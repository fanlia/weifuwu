/**
 * aippt server — AI PPT 生成 API
 *
 * 启动: node --env-file=../.env server.ts（从仓库根目录）
 * 或:   node --env-file=.env server.ts（apps/aippt 下）
 *
 * 端点:
 *   POST /api/decks/generate       { topic, pages?, style?, language?, audience? } → { id, deck }
 *   GET  /api/decks/:id            预览 deck 语义 JSON
 *   GET  /api/decks/:id/export     下载 .pptx
 *   GET  /api/health
 */

import { serve, Router, cors, ui } from 'weifuwu'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DeepSeekClient } from './src/ai/deepseek.ts'
import { generateDeck, generateOutline, completeDeck, validateOutline, type Outline } from './src/services/outline.ts'
import { rewriteSlide, relayoutSlide } from './src/services/edit.ts'
import { deckToPptx, type DeckData } from './src/pptx/components/layouts.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── 环境变量（支持从仓库根加载）─────────────────────────
import { readFileSync, existsSync } from 'node:fs'
for (const envPath of [resolve(__dirname, '.env'), resolve(__dirname, '../../.env'), '/home/x/test/ai/weifuwu/.env']) {
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
    }
  }
}

// ── 内存 deck 存储（MVP；持久化在 v0.3 用 postgres）──────
interface DeckRecord { deck: DeckData; createdAt: number }
interface OutlineRecord { outline: Outline; createdAt: number }
const decks = new Map<string, DeckRecord>()
const outlines = new Map<string, OutlineRecord>()
let seq = 0

const app = new Router()
app.use(cors())

// ── AI ────────────────────────────────────────────────────
let client: DeepSeekClient | null = null
try {
  const { DeepSeekClient } = await import('./src/ai/deepseek.ts')
  client = new DeepSeekClient()
} catch (err) {
  console.error('[aippt] AI 客户端初始化失败:', err instanceof Error ? err.message : err)
}

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
        language: body?.language,
        audience: typeof body?.audience === 'string' ? body.audience : undefined,
      },
      client,
    )
    const id = `d${Date.now().toString(36)}${(seq++).toString(36)}`
    decks.set(id, { deck, createdAt: Date.now() })
    return Response.json({ id, deck })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 502 })
  }
})

app.get('/api/decks/:id', (req: Request, ctx: any): Response => {
  const rec = decks.get(ctx.params.id)
  if (!rec) return Response.json({ error: 'deck 不存在或已过期' }, { status: 404 })
  return Response.json({ deck: rec.deck })
})

// ── 预览页编辑 ─────────────────────────────────────────────
// 换主题（仅更新 deck.theme，JSON 不变）
app.patch('/api/decks/:id/theme', async (req: Request, ctx: any): Promise<Response> => {
  const rec = decks.get(ctx.params.id)
  if (!rec) return Response.json({ error: 'deck 不存在或已过期' }, { status: 404 })
  const body = await req.json().catch(() => null) as Record<string, any> | null
  const theme = body?.theme
  const { themes } = await import('./src/pptx/theme.ts')
  if (typeof theme !== 'string' || !(theme in themes)) {
    return Response.json({ error: '未知主题' }, { status: 400 })
  }
  rec.deck = { ...rec.deck, theme }
  return Response.json({ deck: rec.deck })
})

// AI 重写单页（expand / condense / rephrase）
app.post('/api/decks/:id/slides/:n/rewrite', async (req: Request, ctx: any): Promise<Response> => {
  if (!client) return Response.json({ error: 'AI 客户端未配置' }, { status: 500 })
  const rec = decks.get(ctx.params.id)
  if (!rec) return Response.json({ error: 'deck 不存在或已过期' }, { status: 404 })
  const n = Number(ctx.params.n) - 1
  if (!rec.deck.slides[n]) return Response.json({ error: '页面不存在' }, { status: 404 })
  const body = await req.json().catch(() => null) as Record<string, any> | null
  const mode = body?.mode
  if (!['expand', 'condense', 'rephrase'].includes(mode)) {
    return Response.json({ error: 'mode 必须为 expand/condense/rephrase' }, { status: 400 })
  }
  try {
    const newSlide = await rewriteSlide(rec.deck.slides[n], mode, client)
    rec.deck.slides[n] = newSlide
    return Response.json({ slide: newSlide })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }
})

// AI 单页换版式
app.post('/api/decks/:id/slides/:n/relayout', async (req: Request, ctx: any): Promise<Response> => {
  if (!client) return Response.json({ error: 'AI 客户端未配置' }, { status: 500 })
  const rec = decks.get(ctx.params.id)
  if (!rec) return Response.json({ error: 'deck 不存在或已过期' }, { status: 404 })
  const n = Number(ctx.params.n) - 1
  if (!rec.deck.slides[n]) return Response.json({ error: '页面不存在' }, { status: 404 })
  const body = await req.json().catch(() => null) as Record<string, any> | null
  const layout = body?.layout
  try {
    const newSlide = await relayoutSlide(rec.deck.slides[n], layout, client)
    rec.deck.slides[n] = newSlide
    return Response.json({ slide: newSlide })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 400 })
  }
})

app.get('/api/decks/:id/export', (req: Request, ctx: any): Response => {
  const rec = decks.get(ctx.params.id)
  if (!rec) return Response.json({ error: 'deck 不存在或已过期' }, { status: 404 })
  const buf = deckToPptx(rec.deck)
  const name = encodeURIComponent((rec.deck.title ?? 'deck').replace(/\s+/g, '-'))
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename*=UTF-8''${name}.pptx`,
    },
  })
})

app.get('/api/health', () => Response.json({ ok: true, decks: decks.size, outlines: outlines.size }))

// ── 阶段 1：大纲生成 ─────────────────────────────────────
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
      },
      client,
    )
    const id = `o${Date.now().toString(36)}${(seq++).toString(36)}`
    outlines.set(id, { outline, createdAt: Date.now() })
    return Response.json({ id, outline })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 502 })
  }
})

app.get('/api/outlines/:id', (req: Request, ctx: any): Response => {
  const rec = outlines.get(ctx.params.id)
  if (!rec) return Response.json({ error: '大纲不存在或已过期' }, { status: 404 })
  return Response.json({ outline: rec.outline })
})

// ── 阶段 2：基于确认后的大纲生成完整 deck（SSE 流式）────
app.post('/api/decks/:id/complete', async (req: Request, ctx: any): Promise<Response> => {
  if (!client) return Response.json({ error: 'AI 客户端未配置（缺少 DEEPSEEK_API_KEY）' }, { status: 500 })
  const outlineRec = outlines.get(ctx.params.id)
  if (!outlineRec) return Response.json({ error: '大纲不存在或已过期' }, { status: 404 })

  const body = await req.json().catch(() => null) as Record<string, any> | null
  const slides = body?.slides
  if (!Array.isArray(slides) || slides.length === 0) {
    return Response.json({ error: 'slides 为必填（编辑后的大纲）' }, { status: 400 })
  }
  let edited: Outline
  try {
    edited = { ...outlineRec.outline, slides }
    validateOutline(edited)
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 })
  }

  // SSE 流：event slide（逐批进度）→ event done（含完整 deck）→ event error
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      try {
        const deck = await completeDeck(edited, client, (p) => send('slide', p))
        const id = `d${Date.now().toString(36)}${(seq++).toString(36)}`
        decks.set(id, { deck, createdAt: Date.now() })
        send('done', { id, deck })
      } catch (err) {
        send('error', { message: err instanceof Error ? err.message : String(err) })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
})

// ── UI / SPA ────────────────────────────────────────────
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

serve(app, { port: 3001 })
console.log('[aippt] http://localhost:3001')
