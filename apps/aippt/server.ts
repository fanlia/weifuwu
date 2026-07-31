/**
 * aippt server — AI PPT 生成 API（postgres 持久化）
 *
 * 端点:
 *   POST   /api/decks/outline       { topic, pages?, style?, audience? } → { id, outline }
 *   POST   /api/decks/:id/complete  编辑后大纲 → SSE 流式生成完整 deck（同 id 更新）
 *   POST   /api/decks/generate      一键快速路径（无大纲确认）
 *   GET    /api/decks               历史列表
 *   GET    /api/decks/:id           预览 deck（或 outline）
 *   GET    /api/decks/:id/export    下载 .pptx
 *   PATCH  /api/decks/:id/theme     换主题
 *   POST   /api/decks/:id/slides/:n/rewrite    AI 重写单页
 *   POST   /api/decks/:id/slides/:n/relayout   AI 换版式
 *   DELETE /api/decks/:id           删除
 */

import { serve, Router, cors, ui, postgres } from 'weifuwu'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'
import type { DeepSeekClient } from './src/ai/deepseek.ts'
import { generateDeck, generateOutline, generateOutlineFromDoc, completeDeck, validateOutline, type Outline } from './src/services/outline.ts'
import { rewriteSlide, relayoutSlide } from './src/services/edit.ts'
import { deckToPptx, type DeckData } from './src/pptx/components/layouts.ts'
import {
  createOutline, createDeck, completeDeckRow, getDeckRow, listDecks, deleteDeck, updateDeckJson, updateThemeAndDeck,
  createCustomTheme, listCustomThemes, getCustomTheme, setShareToken, clearShareToken, getDeckByShareToken,
} from './src/db.ts'
import { randomBytes } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── 环境变量（支持从仓库根加载）─────────────────────────
for (const envPath of [resolve(__dirname, '.env'), resolve(__dirname, '../../.env')]) {
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
    }
  }
}

async function main() {
  const app = new Router()
  app.use(cors())

  // ── postgres ──────────────────────────────────────────
  const pg = postgres()
  app.use(pg)
  const schema = readFileSync(resolve(__dirname, 'src', 'db', 'schema.sql'), 'utf-8')
  await pg.migrate()
  if (!(await pg.isMigrated('aippt'))) {
    await pg.sql.unsafe(schema)
    await pg.markMigrated('aippt')
    console.log('[aippt] DB schema 已初始化')
  }

  // ── AI 客户端 ─────────────────────────────────────────
  let client: DeepSeekClient | null = null
  try {
    const { DeepSeekClient } = await import('./src/ai/deepseek.ts')
    client = new DeepSeekClient()
  } catch (err) {
    console.error('[aippt] AI 客户端初始化失败:', err instanceof Error ? err.message : err)
  }

  const sql = pg.sql
  // share_token 列幂等迁移（schema 已标记过，不会重跑）
  await sql.unsafe('ALTER TABLE decks ADD COLUMN IF NOT EXISTS share_token TEXT')
  await sql.unsafe('CREATE UNIQUE INDEX IF NOT EXISTS decks_share_token_idx ON decks (share_token) WHERE share_token IS NOT NULL')
  let seq = 0
  const nextId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`

  // ── 模板列表 ──────────────────────────────────────────
  app.get('/api/templates', async (): Promise<Response> => {
    const { getTemplates } = await import('./src/services/templates.ts')
    return Response.json({ templates: getTemplates() })
  })

  // ── 自定义主题（品牌模板）──────────────────────────────
  app.get('/api/themes', async (): Promise<Response> => {
    const { themes } = await import('./src/pptx/theme.ts')
    const presets = Object.entries(themes).map(([id, t]) => ({ id, name: t.name, preset: true, colors: t.colors }))
    const customs = await listCustomThemes(sql)
    return Response.json({ themes: [...presets, ...customs.map((c) => ({ ...c, preset: false }))] })
  })

  app.post('/api/themes/custom', async (req: Request): Promise<Response> => {
    const body = await req.json().catch(() => null) as Record<string, any> | null
    const name = body?.name
    const colors = body?.colors
    if (typeof name !== 'string' || name.trim() === '') return Response.json({ error: 'name 为必填' }, { status: 400 })
    if (typeof colors !== 'object' || colors === null) return Response.json({ error: 'colors 为必填' }, { status: 400 })
    const id = nextId('c')
    const rec = { id, name: name.trim(), colors, logo: typeof body?.logo === 'string' ? body.logo : undefined }
    await createCustomTheme(sql, rec)
    return Response.json({ theme: { ...rec, preset: false } })
  })

  // ── 阶段 1：大纲 ──────────────────────────────────────
  app.post('/api/decks/outline', async (req: Request): Promise<Response> => {
    if (!client) return Response.json({ error: 'AI 客户端未配置（缺少 DEEPSEEK_API_KEY）' }, { status: 500 })
    try {
      const body = await req.json().catch(() => null) as Record<string, any> | null
      const topic = body?.topic
      if (typeof topic !== 'string' || topic.trim() === '') {
        return Response.json({ error: 'topic 为必填' }, { status: 400 })
      }
      const outline = await generateOutline(
        {
          topic: topic.trim(),
          pages: Number(body?.pages) || undefined,
          style: typeof body?.style === 'string' ? body.style : undefined,
          audience: typeof body?.audience === 'string' ? body.audience : undefined,
          template: typeof body?.template === 'string' ? body.template : undefined,
        },
        client,
      )
      const id = nextId('d')
      await createOutline(sql, { id, title: outline.title, theme: outline.theme, outline })
      return Response.json({ id, outline })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return Response.json({ error: msg }, { status: 502 })
    }
  })

  // ── 阶段 2：complete（SSE 流式，同 id 更新为 ready）──
  app.post('/api/decks/:id/complete', async (req: Request, ctx: any): Promise<Response> => {
    if (!client) return Response.json({ error: 'AI 客户端未配置（缺少 DEEPSEEK_API_KEY）' }, { status: 500 })
    const row = await getDeckRow(sql, ctx.params.id)
    if (!row || row.status !== 'outline' || !row.outline_json) {
      return Response.json({ error: '大纲不存在或已过期' }, { status: 404 })
    }

    const body = await req.json().catch(() => null) as Record<string, any> | null
    const slides = body?.slides
    if (!Array.isArray(slides) || slides.length === 0) {
      return Response.json({ error: 'slides 为必填（编辑后的大纲）' }, { status: 400 })
    }
    let edited: Outline
    try {
      edited = { ...row.outline_json, slides }
      validateOutline(edited)
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        }
        try {
          const deck = await completeDeck(edited, client, (p) => send('slide', p))
          await completeDeckRow(sql, { id: ctx.params.id, title: deck.title, theme: deck.theme, deck })
          send('done', { id: ctx.params.id, deck })
        } catch (err) {
          send('error', { message: err instanceof Error ? err.message : String(err) })
        } finally {
          controller.close()
        }
      },
    })
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    })
  })

  // ── 批量生成（串行，单份失败不影响其他）───────────────
  app.post('/api/decks/generate-batch', async (req: Request): Promise<Response> => {
    if (!client) return Response.json({ error: 'AI 客户端未配置（缺少 DEEPSEEK_API_KEY）' }, { status: 500 })
    const body = await req.json().catch(() => null) as Record<string, any> | null
    const items = body?.items
    if (!Array.isArray(items) || items.length === 0 || items.length > 10) {
      return Response.json({ error: 'items 必须是非空数组（最多 10 份）' }, { status: 400 })
    }
    const results: any[] = []
    for (const [i, item] of items.entries()) {
      try {
        const deck = await generateDeck(
          {
            topic: String(item?.topic ?? '').trim(),
            pages: Number(item?.pages) || undefined,
            style: typeof item?.style === 'string' ? item.style : undefined,
            audience: typeof item?.audience === 'string' ? item.audience : undefined,
          },
          client,
        )
        const id = nextId('d')
        await createDeck(sql, { id, title: deck.title, theme: deck.theme, deck })
        results.push({ index: i, status: 'ok', id, title: deck.title, slides: deck.slides.length })
      } catch (err) {
        results.push({ index: i, status: 'error', error: err instanceof Error ? err.message : String(err) })
      }
    }
    return Response.json({ results })
  })

  // ── 一键快速路径 ──────────────────────────────────────
  app.post('/api/decks/generate', async (req: Request): Promise<Response> => {
    if (!client) return Response.json({ error: 'AI 客户端未配置（缺少 DEEPSEEK_API_KEY）' }, { status: 500 })
    try {
      const body = await req.json().catch(() => null) as Record<string, any> | null
      const topic = body?.topic
      if (typeof topic !== 'string' || topic.trim() === '') {
        return Response.json({ error: 'topic 为必填' }, { status: 400 })
      }
      const deck = await generateDeck(
        {
          topic: topic.trim(),
          pages: Number(body?.pages) || undefined,
          style: typeof body?.style === 'string' ? body.style : undefined,
          audience: typeof body?.audience === 'string' ? body.audience : undefined,
        },
        client,
      )
      const id = nextId('d')
      await createDeck(sql, { id, title: deck.title, theme: deck.theme, deck })
      return Response.json({ id, deck })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return Response.json({ error: msg }, { status: 502 })
    }
  })

  // ── 从文档生成大纲 ─────────────────────────────────────
  app.post('/api/decks/outline-from-doc', async (req: Request): Promise<Response> => {
    if (!client) return Response.json({ error: 'AI 客户端未配置（缺少 DEEPSEEK_API_KEY）' }, { status: 500 })
    try {
      const body = await req.json().catch(() => null) as Record<string, any> | null
      const content = body?.content
      if (typeof content !== 'string' || content.trim().length < 50) {
        return Response.json({ error: 'content 至少 50 字' }, { status: 400 })
      }
      const outline = await generateOutlineFromDoc(
        content.trim(),
        {
          pages: Number(body?.pages) || undefined,
          style: typeof body?.style === 'string' ? body.style : undefined,
          audience: typeof body?.audience === 'string' ? body.audience : undefined,
        },
        client,
      )
      const id = nextId('d')
      await createOutline(sql, { id, title: outline.title, theme: outline.theme, outline })
      return Response.json({ id, outline })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return Response.json({ error: msg }, { status: 502 })
    }
  })

  // ── 历史列表 ──────────────────────────────────────────
  app.get('/api/decks', async (): Promise<Response> => {
    const rows = await listDecks(sql)
    return Response.json({
      decks: rows.map((r) => ({
        id: r.id,
        title: r.title,
        theme: r.theme,
        status: r.status,
        slides: (r.deck_json?.slides?.length ?? r.outline_json?.slides?.length) ?? 0,
        createdAt: r.created_at,
      })),
    })
  })

  // ── 查询（ready → deck；outline → outline）────────────
  app.get('/api/decks/:id', async (req: Request, ctx: any): Promise<Response> => {
    const row = await getDeckRow(sql, ctx.params.id)
    if (!row) return Response.json({ error: 'deck 不存在' }, { status: 404 })
    if (row.status === 'ready' && row.deck_json) return Response.json({ deck: row.deck_json, status: 'ready' })
    if (row.status === 'outline' && row.outline_json) return Response.json({ outline: row.outline_json, status: 'outline' })
    return Response.json({ error: 'deck 数据不完整' }, { status: 500 })
  })

  app.get('/api/outlines/:id', async (req: Request, ctx: any): Promise<Response> => {
    const row = await getDeckRow(sql, ctx.params.id)
    if (!row?.outline_json) return Response.json({ error: '大纲不存在' }, { status: 404 })
    return Response.json({ outline: row.outline_json })
  })

  // ── 导出 ──────────────────────────────────────────────
  app.get('/api/decks/:id/export', async (req: Request, ctx: any): Promise<Response> => {
    const row = await getDeckRow(sql, ctx.params.id)
    if (!row?.deck_json) return Response.json({ error: 'deck 不存在或未完成' }, { status: 404 })
    // 自定义主题解析（品牌模板）
    const { themes, buildCustomTheme } = await import('./src/pptx/theme.ts')
    let customTheme
    if (!(row.deck_json.theme in themes)) {
      const rec = await getCustomTheme(sql, row.deck_json.theme)
      if (rec) customTheme = buildCustomTheme(rec.id, rec.name, rec.colors, rec.logo)
    }
    const buf = deckToPptx(row.deck_json, customTheme ? { customTheme } : {})
    const name = encodeURIComponent((row.title ?? 'deck').replace(/\s+/g, '-'))
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename*=UTF-8''${name}.pptx`,
      },
    })
  })

  // ── 编辑 ──────────────────────────────────────────────
  app.patch('/api/decks/:id/theme', async (req: Request, ctx: any): Promise<Response> => {
    const row = await getDeckRow(sql, ctx.params.id)
    if (!row?.deck_json) return Response.json({ error: 'deck 不存在或未完成' }, { status: 404 })
    const body = await req.json().catch(() => null) as Record<string, any> | null
    const theme = body?.theme
    const { themes } = await import('./src/pptx/theme.ts')
    const validPreset = typeof theme === 'string' && theme in themes
    const validCustom = typeof theme === 'string' && !validPreset && (await getCustomTheme(sql, theme)) !== null
    if (!validPreset && !validCustom) {
      return Response.json({ error: '未知主题' }, { status: 400 })
    }
    const deck: DeckData = { ...row.deck_json, theme }
    await updateThemeAndDeck(sql, ctx.params.id, deck)
    return Response.json({ deck })
  })

  async function editSlide(ctx: any, fn: (slide: any) => Promise<any>): Promise<Response> {
    const row = await getDeckRow(sql, ctx.params.id)
    if (!row?.deck_json) return Response.json({ error: 'deck 不存在或未完成' }, { status: 404 })
    const n = Number(ctx.params.n) - 1
    if (!row.deck_json.slides[n]) return Response.json({ error: '页面不存在' }, { status: 404 })
    try {
      const newSlide = await fn(row.deck_json.slides[n])
      const deck: DeckData = { ...row.deck_json, slides: row.deck_json.slides.map((s, i) => (i === n ? newSlide : s)) }
      await updateDeckJson(sql, ctx.params.id, deck)
      return Response.json({ slide: newSlide })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return Response.json({ error: msg }, { status: 400 })
    }
  }

  app.post('/api/decks/:id/slides/:n/rewrite', async (req: Request, ctx: any): Promise<Response> => {
    if (!client) return Response.json({ error: 'AI 客户端未配置' }, { status: 500 })
    const body = await req.json().catch(() => null) as Record<string, any> | null
    const mode = body?.mode
    if (!['expand', 'condense', 'rephrase'].includes(mode)) {
      return Response.json({ error: 'mode 必须为 expand/condense/rephrase' }, { status: 400 })
    }
    return editSlide(ctx, (slide) => rewriteSlide(slide, mode, client))
  })

  app.post('/api/decks/:id/slides/:n/relayout', async (req: Request, ctx: any): Promise<Response> => {
    if (!client) return Response.json({ error: 'AI 客户端未配置' }, { status: 500 })
    const body = await req.json().catch(() => null) as Record<string, any> | null
    return editSlide(ctx, (slide) => relayoutSlide(slide, body?.layout, client))
  })

  app.delete('/api/decks/:id', async (req: Request, ctx: any): Promise<Response> => {
    const ok = await deleteDeck(sql, ctx.params.id)
    if (!ok) return Response.json({ error: 'deck 不存在' }, { status: 404 })
    return Response.json({ ok: true })
  })

  // ── 分享（只读预览）───────────────────────────────────
  app.post('/api/decks/:id/share', async (req: Request, ctx: any): Promise<Response> => {
    const row = await getDeckRow(sql, ctx.params.id)
    if (!row?.deck_json) return Response.json({ error: 'deck 不存在或未完成' }, { status: 404 })
    if (!row.share_token) {
      const token = randomBytes(12).toString('hex')
      await setShareToken(sql, ctx.params.id, token)
      row.share_token = token
    }
    return Response.json({ url: `/share/${row.share_token}` })
  })

  app.delete('/api/decks/:id/share', async (req: Request, ctx: any): Promise<Response> => {
    await clearShareToken(sql, ctx.params.id)
    return Response.json({ ok: true })
  })

  app.get('/api/share/:token', async (req: Request, ctx: any): Promise<Response> => {
    const row = await getDeckByShareToken(sql, ctx.params.token)
    if (!row?.deck_json) return Response.json({ error: '分享链接不存在或已撤销' }, { status: 404 })
    return Response.json({ deck: row.deck_json })
  })

  app.get('/api/health', async () => {
    const count = await sql`SELECT COUNT(*)::int as c FROM decks`
    return Response.json({ ok: true, decks: count[0]?.c ?? 0 })
  })

  // ── UI / SPA ──────────────────────────────────────────
  app.use(ui())
  app.get('/app.js', (req: Request, ctx: any) => ctx.ui.js(resolve(__dirname, 'ui', 'main.tsx')))
  app.get('/style.css', (req: Request, ctx: any) => ctx.ui.css(resolve(__dirname, 'public', 'style.css')))
  app.get('/*', async (req: Request, ctx: any) =>
    ctx.ui.html`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/style.css">
  <title>aippt — AI PPT 生成引擎</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/app.js"></script>
</body>
</html>
`,
  )

  serve(app, { port: 3001, timeout: 300_000, keepAliveTimeout: 10_000 }) // 长超时支持批量生成
  console.log('[aippt] http://localhost:3001 (postgres 持久化)')
}

main().catch((err) => {
  console.error('[aippt] 启动失败:', err)
  process.exit(1)
})
