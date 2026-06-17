import type { Handler, Middleware, Closeable } from './types.ts'
import { text, integer } from './postgres/schema/columns.ts'
import { Router } from './router.ts'

/** Options for {@link analytics}. */
export interface AnalyticsOptions {
  /** Path prefixes to exclude from analytics (default: `['/__analytics', '/__wfw', '/static']`). */
  excluded?: string[]
  /** PostgreSQL client for persistent storage. Required for production use. */
  pg?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sql: (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    table: (name: string, cols: any) => any
  }
}

/** Analytics module returned by {@link analytics}. */
export interface AnalyticsModule extends Router, Closeable {
  /** Middleware that records page views. */
  middleware: () => Middleware
  /** Create/update the analytics database tables. */
  migrate: () => Promise<void>
  /** Close the in-memory store and any timers. */
  close: () => Promise<void>
}

const DEFAULT_EXCLUDED = ['/__analytics', '/__wfw', '/static']

interface QueryResult {
  total_pv: number
  total_uv: number
  daily: { date: string; pv: number; uv: number }[]
  top_pages: { path: string; pv: number }[]
  referrers: { domain: string; count: number }[]
  devices: { mobile: number; desktop: number }
}

// ── In-memory store ─────────────────────────────────────────────────────────

const MAX_MEM_ENTRIES = 10000

class MemStore {
  private days = new Map<string, { pv: number; uv: Set<string>; mobile: number; desktop: number }>()
  private pages = new Map<string, { count: number }>()
  private refs = new Map<string, Map<string, number>>()
  private timer: ReturnType<typeof setInterval> | null = null

  private evict(forceAll = false) {
    if (this.days.size <= MAX_MEM_ENTRIES) return
    const target = forceAll ? 0 : MAX_MEM_ENTRIES
    const toDelete: string[] = []
    for (const d of this.days.keys()) {
      toDelete.push(d)
      if (!forceAll && this.days.size - toDelete.length <= target) break
    }
    for (const d of toDelete) {
      this.days.delete(d)
      this.refs.delete(d)
    }
  }

  startCleanup(interval: number) {
    if (this.timer) return
    this.timer = setInterval(() => this.evict(true), interval)
    if (this.timer.unref) this.timer.unref()
  }

  stopCleanup() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  record(path: string, date: string, refDomain: string, mobile: boolean) {
    let day = this.days.get(date)
    if (!day) {
      day = { pv: 0, uv: new Set(), mobile: 0, desktop: 0 }
      this.days.set(date, day)
    }
    day.pv++
    day.uv.add(path)
    if (mobile) day.mobile++
    else day.desktop++

    let page = this.pages.get(path)
    if (!page) {
      page = { count: 0 }
      this.pages.set(path, page)
    }
    page.count++

    if (refDomain) {
      let refs = this.refs.get(date)
      if (!refs) {
        refs = new Map()
        this.refs.set(date, refs)
      }
      refs.set(refDomain, (refs.get(refDomain) || 0) + 1)
    }

    this.evict()
  }

  query(days: number): QueryResult {
    const since = new Date()
    since.setDate(since.getDate() - days)
    const sinceStr = since.toISOString().slice(0, 10)
    const daily: { date: string; pv: number; uv: number }[] = []
    let totalPv = 0,
      totalMobile = 0,
      totalDesktop = 0
    const allUv = new Set<string>(),
      pageMap = new Map<string, number>()

    for (const [date, day] of this.days) {
      if (date < sinceStr) continue
      daily.push({ date, pv: day.pv, uv: day.uv.size })
      totalPv += day.pv
      totalMobile += day.mobile
      totalDesktop += day.desktop
      for (const p of day.uv) allUv.add(p)
    }
    for (const [path, page] of this.pages) pageMap.set(path, page.count)

    const topPages = [...pageMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([path, count]) => ({ path, pv: count }))

    const refMap = new Map<string, number>()
    for (const [date, refs] of this.refs) {
      if (date < sinceStr) continue
      for (const [domain, count] of refs) refMap.set(domain, (refMap.get(domain) || 0) + count)
    }

    const total = totalMobile + totalDesktop || 1
    return {
      total_pv: totalPv,
      total_uv: allUv.size,
      daily,
      top_pages: topPages,
      referrers: [...refMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([domain, count]) => ({ domain, count })),
      devices: {
        mobile: Math.round((totalMobile / total) * 1000) / 10,
        desktop: Math.round((totalDesktop / total) * 1000) / 10,
      },
    }
  }
}

// ── PG store ────────────────────────────────────────────────────────────────

async function migratePg(
  sql: (sql: any, ...args: any[]) => Promise<any[]>,
  table: (name: string, cols: any) => any,
) {
  const analytics = table('__analytics', {
    date: text('date').notNull(),
    path: text('path').notNull(),
    count: integer('count').default(0),
    mobile: integer('mobile').default(0),
    desktop: integer('desktop').default(0),
  })
  await analytics.create()
  await analytics.createIndex(['date', 'path'], { unique: true })
  return analytics
}

async function recordPg(
  sql: (sql: any, ...args: any[]) => Promise<any[]>,
  path: string,
  date: string,
  mobile: boolean,
) {
  await sql`
    INSERT INTO __analytics (date, path, count, mobile, desktop)
    VALUES (${date}, ${path}, 1, ${mobile ? 1 : 0}, ${mobile ? 0 : 1})
    ON CONFLICT (date, path) DO UPDATE SET
      count = __analytics.count + 1,
      mobile = __analytics.mobile + ${mobile ? 1 : 0},
      desktop = __analytics.desktop + ${mobile ? 0 : 1}
  `
}

async function queryPg(
  sql: (sql: any, ...args: any[]) => Promise<any[]>,
  days: number,
): Promise<QueryResult> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().slice(0, 10)

  const daily = (await sql`
    SELECT date, SUM(count)::int as pv, COUNT(DISTINCT path)::int as uv
    FROM __analytics WHERE date >= ${sinceStr} GROUP BY date ORDER BY date
  `) as { date: string; pv: number; uv: number }[]

  const pageRows = (await sql`
    SELECT path, SUM(count)::int as pv
    FROM __analytics WHERE date >= ${sinceStr}
    GROUP BY path ORDER BY pv DESC LIMIT 20
  `) as { path: string; pv: number }[]

  const totalRes = (await sql`
    SELECT COALESCE(SUM(count), 0)::int as total_pv,
           COALESCE(SUM(mobile), 0)::int as total_mobile,
           COALESCE(SUM(desktop), 0)::int as total_desktop
    FROM __analytics WHERE date >= ${sinceStr}
  `) as { total_pv: number; total_mobile: number; total_desktop: number }[]

  const t = totalRes[0]
  const denom = t.total_mobile + t.total_desktop || 1
  return {
    total_pv: t.total_pv,
    total_uv: pageRows.length,
    daily: daily.map((d) => ({ date: d.date, pv: d.pv, uv: d.uv })),
    top_pages: pageRows.map((p) => ({ path: p.path, pv: p.pv })),
    referrers: [],
    devices: {
      mobile: Math.round((t.total_mobile / denom) * 1000) / 10,
      desktop: Math.round((t.total_desktop / denom) * 1000) / 10,
    },
  }
}

// ── Dashboard ───────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderDashboard(days: number, data: QueryResult): string {
  const { total_pv, total_uv, top_pages, referrers } = data
  const maxPv = Math.max(...data.daily.map((d) => d.pv), 1)
  const bars = data.daily
    .map(
      (d) =>
        `<div class="bar-wrap"><div class="bar" style="height:${(d.pv / maxPv) * 100}%"></div><span class="bar-label">${escapeHtml(d.date.slice(5))}</span></div>`,
    )
    .join('')
  const rows = top_pages
    .map(
      (p, i) =>
        `<tr><td class="num">${i + 1}</td><td class="path">${escapeHtml(p.path)}</td><td class="num">${p.pv}</td></tr>`,
    )
    .join('')
  const refRows = referrers
    .map((r) => `<tr><td>${escapeHtml(r.domain)}</td><td class="num">${r.count}</td></tr>`)
    .join('')

  return `<!DOCTYPE html><html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Analytics - weifuwu</title>
<style>*,:before,:after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8f9fa;color:#333;padding:24px;max-width:960px;margin:0 auto}
h1{font-size:24px;font-weight:700;margin-bottom:24px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:24px}
.card{background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.card .val{font-size:28px;font-weight:700;color:#2563eb}
.card .lbl{font-size:12px;color:#888;margin-top:4px}
.section{background:#fff;border-radius:10px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.section h2{font-size:14px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px}
.chart{display:flex;align-items:flex-end;gap:4px;height:160px;padding-top:8px}
.bar-wrap{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end}
.bar{width:100%;background:#2563eb;border-radius:4px 4px 0 0;min-height:2px}
.bar-label{font-size:10px;color:#888;margin-top:6px;white-space:nowrap}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:6px 8px;color:#888;font-weight:500;border-bottom:1px solid #eee}
td{padding:6px 8px;border-bottom:1px solid #f0f0f0}
.num{text-align:right;font-variant-numeric:tabular-nums}
.path{font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px}
tr:hover td{background:#f8faff}
</style></head>
<body>
<h1>Analytics</h1>
<div class="cards">
  <div class="card"><div class="val">${total_pv}</div><div class="lbl">Page Views (${days}d)</div></div>
  <div class="card"><div class="val">${total_uv}</div><div class="lbl">Unique Pages</div></div>
  <div class="card"><div class="val">${data.devices.mobile}%</div><div class="lbl">Mobile</div></div>
  <div class="card"><div class="val">${data.devices.desktop}%</div><div class="lbl">Desktop</div></div>
</div>
<div class="section"><h2>Daily Page Views</h2><div class="chart">${bars}</div></div>
<div class="section"><h2>Top Pages</h2>
<table><thead><tr><th style="width:32px">#</th><th>Path</th><th style="width:64px">Views</th></tr></thead><tbody>${rows}</tbody></table></div>
${referrers.length ? `<div class="section"><h2>Referrers</h2><table><thead><tr><th>Domain</th><th style="width:64px">Views</th></tr></thead><tbody>${refRows}</tbody></table></div>` : ''}
</body></html>`
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Page view analytics module.
 *
 * Records page views with referrer and device type. Supports in-memory and PostgreSQL storage.
 * Provides a dashboard at `GET /__analytics`.
 *
 * ```ts
 * import { analytics, postgres } from 'weifuwu'
 *
 * const pg = postgres({ connection: DATABASE_URL })
 * app.use(analytics({ pg }).middleware())
 * ```
 */
export function analytics(options?: AnalyticsOptions): AnalyticsModule {
  const excluded = options?.excluded ?? DEFAULT_EXCLUDED
  const pg = options?.pg
  const store = pg ? null : new MemStore()
  if (store) store.startCleanup(60_000)

  const middleware = () => {
    const m: Middleware = async (req, ctx, next) => {
      const path = new URL(req.url).pathname
      if (excluded.some((e) => path.startsWith(e))) return next(req, ctx)

      const date = new Date().toISOString().slice(0, 10)
      const ua = req.headers.get('user-agent') || ''
      const mobile = /mobile|android|iphone|ipad/i.test(ua)

      if (pg) {
        await recordPg(pg.sql, path, date, mobile)
      } else {
        const ref = req.headers.get('referer') || ''
        let refDomain = ''
        if (ref) {
          try {
            refDomain = new URL(ref).hostname.replace(/^www\./, '')
          } catch {
            /* invalid referer URL */
          }
        }
        store!.record(path, date, refDomain, mobile)
      }
      return next(req, ctx)
    }
    return m
  }

  const handler: Handler = async (req) => {
    const url = new URL(req.url)
    const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 7, 1), 365)
    const data = pg ? await queryPg(pg.sql, days) : store!.query(days)
    if (url.pathname === '/__analytics/data') return Response.json(data)
    return new Response(renderDashboard(days, data), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }

  const r = new Router()
  r.get('/__analytics/data', handler)
  r.get('/__analytics', handler)

  const migrate = async () => {
    if (pg) await migratePg(pg.sql, pg.table)
  }

  const close = async () => {
    store?.stopCleanup()
  }

  const mod = r as AnalyticsModule
  mod.middleware = middleware
  mod.migrate = migrate
  mod.close = close
  return mod
}
