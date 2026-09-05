/**
 * 公开路由（server.ts 拆分 W1——无需登录面）
 *
 * demo/skills-available/role-templates/white-label/v1-apps/healthz/
 * metrics——经 deps（pg/hasRedis/redisClient）共享运行时引用。
 */
import type { Router } from 'weifuwu'
import { HttpError, ops } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'
import type { PlatformDeps } from './deps.ts'
import { readFileSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export function registerPublicRoutes(app: Router<AppCtx>, deps: PlatformDeps): void {
  const { pg, hasRedis, redisClient } = deps
  const __dirname = dirname(fileURLToPath(import.meta.url)) + '/../..'

  // ── 公开 API（无需登录） ───────────────────────────────

  // ── workflow 演示数据（本地 demo 链接——示例 wfjs 直用；?stock=N 控制告警路径） ──
  app.get('/api/demo/stock', async (req: Request): Promise<Response> => {
    const n = Math.max(0, parseInt(new URL(req.url).searchParams.get('stock') ?? '0', 10) || 0)
    const items = Array.from({ length: n }, (_, i) => ({
      sku: `SKU-${100 + i}`, stock: 0, name: `商品 ${100 + i}`,
    }))
    return Response.json({
      updated_at: new Date().toISOString(),
      items: n === 0 ? [] : items,
    })
  })

  // 可用技能列表（公开）+ C6 技能市场：?q= 搜索 + 全局评分聚合
  app.get('/api/skills/available', async (req: Request, _ctx: AppCtx): Promise<Response> => {
    const { discoverSkills } = await import('../services/skills.ts')
    const { resolve, dirname } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const skillsDir = resolve(__dirname, 'skills', 'builtin')
    let skills = await discoverSkills(skillsDir)

    // C6 搜索：name/description 匹配（大小写不敏感）
    const q = new URL(req.url).searchParams.get('q')?.trim().toLowerCase() ?? ''
    if (q) {
      skills = skills.filter((sk: any) =>
        String(sk?.meta?.name ?? '').toLowerCase().includes(q) ||
        String(sk?.meta?.description ?? '').toLowerCase().includes(q) ||
        String(sk?.dir ?? '').toLowerCase().includes(q),
      )
    }

    // C6 评分聚合（全局——所有租户的评分）
    try {
      const rl = await pg.orm.query.from('skill_ratings').select('skill_dir').count('*', 'likes', { liked: { eq: true } }).groupBy('skill_dir').run()
      const rd = await pg.orm.query.from('skill_ratings').select('skill_dir').count('*', 'dislikes', { liked: { eq: false } }).groupBy('skill_dir').run()
      const ratings = [...new Map([...rl, ...rd].map((r: any) => [String(r.skill_dir), r])).values()]
      // key 用路径 basename（绝对/相对路径环境无关——如 process-csv）
      const base = (p: string) => String(p ?? '').split(/[\\/]/).filter(Boolean).pop() ?? ''
      const map = new Map<string, { likes: number; dislikes: number }>(
        (Array.isArray(ratings) ? ratings : [ratings]).map((r: any) => [
          base(String(r.skill_dir ?? '')), { likes: Number(r.likes ?? 0), dislikes: Number(r.dislikes ?? 0) },
        ]),
      )
      for (const sk of skills) {
        const r = map.get(base(String(sk?.dir ?? ''))) ?? { likes: 0, dislikes: 0 }
        ;(sk as any).rating = r
      }
    } catch { /* 评分表不存在——无评分 */ }

    return Response.json({ skills, skillsDir })
  })

  // C6 技能评分（登录——每租户每技能一次，upsert 可改评）
  app.post('/api/skills/rate', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const body = await req.json().catch(() => ({})) as { skill_dir?: string; liked?: boolean }
    if (!body.skill_dir) throw new HttpError('skill_dir 为必填', 400)
    const liked = !!body.liked
    // key 统一 basename（绝对/相对路径一致）
    const key = String(body.skill_dir).split(/[\\/]/).filter(Boolean).pop() ?? String(body.skill_dir)
    const [row] = await pg.orm.query.insert('skill_ratings').rows([
      { skill_dir: key.slice(0, 200), app_id: ctx.appId, liked },
    ]).onConflict(['skill_dir', 'app_id'], true).returning('skill_dir', 'liked').run()
    return Response.json({ rating: row })
  })

  // ── 角色模板列表（公开） ───────────────────────────────
  // 使用动态 import 访问模板数据
  app.get('/api/role-templates', async () => {
    const { getRoleTemplates } = await import('../routes/role-templates.ts')
    const templates = getRoleTemplates()
    // 持久化使用计数（DB 统计——内存计数服务重启即清零）
    const rows = await pg.orm.query.from('agents').select('template_slug').count('*', 'cnt').where({ template_slug: { isNull: false } }).groupBy('template_slug').run()
    const usage = new Map<string, number>(rows.map((r: any) => [r.template_slug, r.cnt]))
    for (const t of templates) t.usage_count = usage.get(t.slug) ?? 0
    return Response.json({ templates })
  })
  app.get('/api/role-templates/:slug', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { getRoleTemplates } = await import('../routes/role-templates.ts')
    const template = getRoleTemplates().find(t => t.slug === ctx.params.slug)
    if (!template) throw new HttpError('模板不存在', 404)
    return Response.json({ template })
  })

  // ── 健康检查（运营/部署探针——存活 + 依赖探活） ─────────
  // 商业化 G13：白标配置（公开——登录页/壳读取品牌）
  app.get('/api/white-label', async (): Promise<Response> => {
    const { getWhiteLabelInfo } = await import('../services/license.ts')
    return Response.json(getWhiteLabelInfo())
  })

  // 商业化 G15：管理 API（只读——客户系统集成；独立于登录会话，MANAGEMENT_API_KEY 认证）
  app.get('/api/v1/apps', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    const expected = process.env.MANAGEMENT_API_KEY ?? ''
    if (!expected) throw new HttpError('管理 API 未启用（配置 MANAGEMENT_API_KEY）', 403)
    if ((_req.headers.get('authorization') ?? '') !== `Bearer ${expected}`) {
      throw new HttpError('无效的管理 API Key', 401)
    }
    const appRows = await ctx.orm.query.from('_weifuwu_apps').select('slug', 'name', 'status', 'plan', 'trial_ends_at', 'monthly_token_limit', 'created_at').orderBy('created_at', 'desc').run()
    const appIds = appRows.map((a) => String(a.id))
    const mrows = appIds.length ? await ctx.orm.query.from('_weifuwu_app_members').select('app_id').count('*', 'member_count', { app_id: { in: appIds } }).groupBy('app_id').run() : []
    const arows = appIds.length ? await ctx.orm.query.from('agents').select('app_id').count('*', 'agent_count', { app_id: { in: appIds } }).groupBy('app_id').run() : []
    const trows = appIds.length ? await ctx.orm.query.from('agent_logs').select('app_id').sum('tokens_total', 'token_usage_month', { app_id: { in: appIds }, created_at: { gte: ops.monthStart() } }).groupBy('app_id').run() : []
    const mMap = new Map(mrows.map((x) => [String(x.app_id), Number((x as any).member_count ?? 0)]))
    const aMap = new Map(arows.map((x) => [String(x.app_id), Number((x as any).agent_count ?? 0)]))
    const tMap = new Map(trows.map((x) => [String(x.app_id), Number((x as any).token_usage_month ?? 0)]))
    const apps = appRows.map((a) => ({ ...a, member_count: mMap.get(String(a.id)) ?? 0, agent_count: aMap.get(String(a.id)) ?? 0, token_usage_month: tMap.get(String(a.id)) ?? 0 }))
    return Response.json({ apps })
  })

  app.get('/api/v1/usage', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    const expected = process.env.MANAGEMENT_API_KEY ?? ''
    if (!expected) throw new HttpError('管理 API 未启用（配置 MANAGEMENT_API_KEY）', 403)
    if ((_req.headers.get('authorization') ?? '') !== `Bearer ${expected}`) {
      throw new HttpError('无效的管理 API Key', 401)
    }
    // orm-pg-date-trunc 判负登记：date_trunc('day') 分组投影（GROUP BY 表达式——列表达面）
    // ——改为拉取 30 天窗口（≤500 行/租户）按日聚合——语义等价
    const logRows = await ctx.orm.query.from('agent_logs').select('app_id', 'created_at', 'tokens_total').where({ created_at: { gte: ops.nowAgo(30, 'day') } }).run()
    const dayKey = (iso: unknown) => String(iso).slice(0, 10)
    const byDay = new Map<string, { app_id: string; day_iso: string; calls: number; tokens: number }>()
    for (const r of logRows) {
      const k = `${String(r.app_id)}|${dayKey(r.created_at)}`
      const cur = byDay.get(k) ?? { app_id: String(r.app_id), day_iso: String(r.created_at), calls: 0, tokens: 0 }
      cur.calls += 1
      cur.tokens += Number(r.tokens_total ?? 0)
      byDay.set(k, cur)
    }
    const rows = [...byDay.values()].map((r) => ({ app_id: r.app_id, day: dayKey(r.day_iso), calls: r.calls, tokens: r.tokens })).sort((a, b) => String(b.day).localeCompare(String(a.day))).slice(0, 500)
    return Response.json({ usage: rows })
  })

  app.get('/healthz', async (): Promise<Response> => {
    const deps: Record<string, any> = { pg: false, redis: false, sandbox: null }
    try { await pg.orm.query.from('_weifuwu_apps').select('id').limit(1).run(); deps.pg = true } catch { /* 探活失败 */ }
    try {
      if (hasRedis) { await redisClient.redis.command('PING'); deps.redis = true }
      else deps.redis = 'disabled'
    } catch { deps.redis = false }
    try {
      const { sandbox } = await import('../sandbox/docker.ts')
      const st = await sandbox.status()
      deps.sandbox = { available: st.available, enabled: st.enabled, imageReady: st.imageReady, mode: st.mode, poolSize: st.poolSize, maxContainers: st.maxContainers }
    } catch { deps.sandbox = 'unavailable' }
    // R7：磁盘水位 + 版本（运维告警/升级判断）
    let disk: Record<string, any> | null = null
    try {
      const { statfs } = await import('node:fs/promises')
      const st = await statfs(process.env.AGENT_WORKSPACE_ROOT ?? '.')
      const total = st.blocks * st.bsize
      const free = st.bfree * st.bsize
      disk = { totalBytes: total, freeBytes: free, freePercent: Math.round(free / total * 100) }
    } catch { disk = null }
    const healthy = deps.pg === true && (!disk || disk.freePercent > 5)
    const startTime = (globalThis as any).__platform_metrics?.startTime
    const uptimeSec = startTime ? Math.round((Date.now() - startTime) / 1000) : 0
    return Response.json(
      { status: healthy ? 'ok' : 'degraded', uptimeSec, deps, disk, version: (() => { try { return JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../package.json'), 'utf-8')).version } catch { return 'dev' } })(), ts: new Date().toISOString() },
      { status: healthy ? 200 : 503 },
    )
  })

  // ── 指标端点（运营/监控——内存计数器 + 进程信息） ──
  // R9：Prometheus 文本格式（Grafana 生态可抓）
  app.get('/api/metrics/prom', async () => {
    const m = (globalThis as any).__platform_metrics ?? {}
    const uptime = Math.round((Date.now() - (m.startTime ?? Date.now())) / 1000)
    let disk: Record<string, any> | null = null
    try {
      const { statfs } = await import('node:fs/promises')
      const st = await statfs(process.env.AGENT_WORKSPACE_ROOT ?? '.')
      disk = { freePercent: Math.round(st.bfree * st.bsize / (st.blocks * st.bsize) * 100) }
    } catch { disk = null }
    // M6-2：沙盒生命周期计数（修复 sandboxCalls 死指标——manager.runTool 入口自增）
    let sbCounters: Record<string, unknown> = {}
    try {
      const { manager } = await import('../sandbox/manager.ts')
      const { sandbox } = await import('../sandbox/docker.ts')
      sbCounters = { ...manager.counters, exec: sandbox.execStats }
    } catch { /* 沙盒未初始化 */ }
    const lines = [
      `# HELP agent_platform_uptime_seconds 服务运行时长`,
      `agent_platform_uptime_seconds ${uptime}`,
      `agent_platform_requests_total ${m.requests ?? 0}`,
      `agent_platform_errors_total ${m.errors ?? 0}`,
      `agent_platform_ai_calls_total ${m.aiCalls ?? 0}`,
      `agent_platform_ai_tokens_total ${m.aiTokens ?? 0}`,
      `agent_platform_webhooks_total ${m.webhooks ?? 0}`,
      `agent_platform_sandbox_calls_total ${m.sandboxCalls ?? 0}`,
      `agent_platform_sandbox_created_total ${(sbCounters as any).created ?? 0}`,
      `agent_platform_sandbox_terminated_total ${(sbCounters as any).terminated ?? 0}`,
      `agent_platform_sandbox_evicted_total ${(sbCounters as any).evicted ?? 0}`,
      `agent_platform_sandbox_idle_stopped_total ${(sbCounters as any).idleStopped ?? 0}`,
      `agent_platform_sandbox_exec_total ${((sbCounters as any).exec as any)?.execCount ?? 0}`,
      `agent_platform_sandbox_exec_errors_total ${((sbCounters as any).exec as any)?.execErrors ?? 0}`,
      `agent_platform_sandbox_exec_timeouts_total ${((sbCounters as any).exec as any)?.execTimeouts ?? 0}`,
      `agent_platform_disk_free_percent ${disk?.freePercent ?? -1}`,
    ]
    return new Response(lines.join('\n') + '\n', {
      headers: { 'Content-Type': 'text/plain; version=0.0.4' },
    })
  })

  app.get('/api/metrics', async () => {
    const m = (globalThis as any).__platform_metrics ?? {}
    const uptime = Math.round((Date.now() - (m.startTime ?? Date.now())) / 1000)
    // 2026-12 运维：pg 连接池水位（池耗尽预警——演示事故的预防）
    let pgActive = -1
    let pgTotal = -1
    try {
      // orm-pg-system-view 判负：pg_stat_activity 为 PG 系统视图（无表模型——监控专用）
      const [row] = await pg.runMigration('pg-stat-probe', `SELECT count(*) FILTER (WHERE state = 'active')::int as active, count(*)::int as total FROM pg_stat_activity`).then(() => [])
      pgActive = Number((row as any)?.active ?? -1)
      pgTotal = Number((row as any)?.total ?? -1)
    } catch { /* 查询失败 */ }
    // M6-2：沙盒生命周期计数（manager.counters + 执行器 execStats）
    let sb: Record<string, unknown> = {}
    try {
      const { manager } = await import('../sandbox/manager.ts')
      const { sandbox } = await import('../sandbox/docker.ts')
      // P3-3：状态计数（DB 快照——reconcile 后的现实）
      let statusCounts: Record<string, number> = {}
      try {
        const rows = await manager.statusCounts()
        statusCounts = rows
      } catch { /* 查询失败 */ }
      sb = {
        calls: m.sandboxCalls ?? 0,
        created: manager.counters.created,
        terminated: manager.counters.terminated,
        evicted: manager.counters.evicted,
        idleStopped: manager.counters.idleStopped,
        autoStarted: manager.counters.autoStarted,
        orphansCleaned: manager.counters.orphansCleaned,
        exec: sandbox.execStats,
        statusCounts,
      }
    } catch { /* 沙盒未初始化 */ }
    return Response.json({
      uptimeSec: uptime,
      requests: m.requests ?? 0,
      errors: m.errors ?? 0,
      // E2 细分（5xx 响应 vs 未捕获异常——诊断粒度）
      errors5xx: m.errors5xx ?? 0,
      errorsCaught: m.errorsCaught ?? 0,
      errorRate: m.requests ? Number(((m.errors / m.requests) * 100).toFixed(2)) : 0,
      aiCalls: m.aiCalls ?? 0,
      aiTokens: m.aiTokens ?? 0,
      aiAvgLatencyMs: m.aiCalls ? Math.round((m.aiLatencyMs ?? 0) / m.aiCalls) : 0,
      webhooks: m.webhooks ?? 0,
      sandboxCalls: m.sandboxCalls ?? 0,
      sandbox: sb,
      pgConnections: { active: pgActive, total: pgTotal },
      memMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    })
  })



  // ── 需要登录 + 租户隔离的路由 ─────────────────────────
}
