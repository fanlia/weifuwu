/**
 * apps/showcase — weifuwu 组件演示平台（自举）
 *
 * 能力：
 *   /app.js               平台前端（ctx.ui.js 动态编译）
 *   /components.css       CSS 运行时聚合（layout @import + 组件 CSS——与 build.mjs 同逻辑）
 *   /index.json           结构化索引（registry 运行时构建——单一事实源）
 *   /api/chat /api/approve /api/files/:name   wire-fake（AiChat/FilePreview 演示）
 *   页面路由（/ /components* /layout） SSR 整树首帧，其余走 SPA 壳（客户端渲染）
 */
import { serve, Router, ui } from '../../src/server/index.ts'
import { HtmlSafe } from '../../src/server/ui/html-safe.ts'
// ctx.ui.html 标签模板会转义插值——HTML 插值（header/防闪脚本）需 unsafe 包裹
const unsafe = (s: string): string => new HtmlSafe(s) as unknown as string
import { installDemoBackend } from './src/demo-backend.ts'
import { buildIndexJson } from './src/registry/index-json.ts'
import { resolve, dirname } from 'node:path'
import { writeFile, rm } from 'node:fs/promises'
import { tmpdir as osTmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { readdir, readFile } from 'node:fs/promises'
// ── 进程级防御（2026-08——SSR 组件副作用/编辑竞态崩溃实证）──
// unhandledRejection 默认 throw → 服务器进程退出（FilePreview fetch /
// data url import 崩溃链实证）——**记录不崩**（问题可见——进程存活是
// 可用性底线——页面级失败由 renderFullPage 回退兜底）
process.on('unhandledRejection', (reason) => {
  console.error('[showcase] unhandledRejection（进程保护——不退出）:', reason instanceof Error ? reason.message : String(reason).slice(0, 200))
})
process.on('uncaughtException', (err) => {
  console.error('[showcase] uncaughtException（进程保护——不退出）:', err.message)
})
import { build as esbuild } from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..', '..') // 仓库根（= 发布根）

const app = new Router()
app.use(ui())

// ── 后端活体端点（MemorySql/MemoryRedis/rateLimit/queue/graphql/ws——第一批 8 项） ──
const demoCtx = {} as any
installDemoBackend(app, demoCtx)

// ── 结构化索引（运行时构建——registry 单一事实源；平台前端 + 审计共用） ──
app.get('/index.json', (req: Request): Response =>
  Response.json(buildIndexJson()))

// ── wire-fake：确定性流式（无 API key 全链路演示 AiChat） ──
app.post('/api/chat', async (req: Request): Promise<Response> => {
  const { messages, mode } = await req.json()
  const lastUser = [...(messages ?? [])].reverse().find((m: any) => m.role === 'user')?.content ?? '世界'
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (name: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      push('wf:message_start', { id: `demo-${Date.now()}` })
      if (mode === 'agent') {
        push('wf:step', { type: 'llm' })
        push('wf:tool_call', { id: 'tc_demo', name: 'query_weather', args: { city: '北京' } })
        push('wf:step', { type: 'tool', toolCallId: 'tc_demo', name: 'query_weather' })
        push('wf:tool_progress', { toolCallId: 'tc_demo', step: 1, total: 2, message: '查询 北京…', status: 'running' })
        push('wf:approval_request', { id: 'ap_demo', toolCallId: 'tc_demo', name: 'query_weather', args: { city: '北京' }, reason: '（演示）工具执行前需要审批' })
        setTimeout(() => {
          push('wf:tool_result', { id: 'tc_demo', ok: true, output: { city: '北京', temp: 25, desc: '晴' } })
          const answer = '（demo）北京 25°C，晴。'
          for (let i = 0; i < answer.length; i += 2) push('wf:token', { text: answer.slice(i, i + 2) })
          push('wf:usage', { prompt_tokens: 20, completion_tokens: answer.length })
          push('wf:done', { content: answer, usage: { prompt_tokens: 20, completion_tokens: answer.length } })
          controller.close()
        }, 3000)
        return
      }
      const reply = `（demo 流式回复）你刚才说：${lastUser}`
      let i = 0
      const timer = setInterval(() => {
        if (i >= reply.length) {
          clearInterval(timer)
          push('wf:done', { content: reply, usage: { prompt_tokens: 12, completion_tokens: reply.length } })
          controller.close()
          return
        }
        push('wf:token', { text: reply.slice(i, i + 2) })
        i += 2
      }, 120)
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  })
})

app.post('/api/approve', async (req: Request): Promise<Response> => {
  await req.json()
  return Response.json({ ok: true })
})

// ── wire-fake 文件服务（FilePreview 演示） ──
const fileStore = new Map<string, string>()
fileStore.set('README.md', [
  '# weifuwu 文件预览', '',
  '这是 **远程加载** 的 Markdown 文档（wire-fake 文件服务）。', '',
  '> 支持预览与编辑——基于事件流', '',
  '- 预览：Markdown 安全渲染', '- 编辑：Editor 事务层（撤销/AI）', '- 保存：PUT 回写文件服务',
].join('\n'))
app.get('/api/files/:name', async (req: Request, ctx: any): Promise<Response> => {
  const content = fileStore.get((ctx as any).params.name)
  if (content === undefined) return Response.json({ error: 'not found' }, { status: 404 })
  return new Response(content, { headers: { 'Content-Type': 'text/plain' } })
})
app.put('/api/files/:name', async (req: Request, ctx: any): Promise<Response> => {
  const name = (ctx as any).params.name
  const content = await req.text()
  fileStore.set(name, content)
  return Response.json({ ok: true, chars: content.length })
})

// ── 平台前端 ──
app.get('/app.js', (req, ctx) => ctx.ui.js(resolve(__dirname, 'src', 'main.tsx')))

app.get('/components.css', async (req, ctx) => {
  const layoutSrc = resolve(root, 'src', 'client', 'layout')
  const entry = await readFile(resolve(layoutSrc, 'weifuwu-layout.css'), 'utf-8')
  const layoutChunks: string[] = []
  for (const line of entry.split('\n')) {
    const m = line.match(/@import\s+['"]([^'"]+)['"]/)
    if (m) {
      const content = (await readFile(resolve(layoutSrc, m[1]), 'utf-8')).replace(/@import\s+['"][^'"]+['"]\s*;?\s*\n?/g, '').trim()
      layoutChunks.push(`@layer layout {\n${content}\n}`)
    }
  }
  let css = '@layer tokens, base, layout, utilities, components;\n\n' + layoutChunks.join('\n\n')
  css += '\n@layer components {\n'
  const dirs = await readdir(resolve(root, 'src', 'client', 'components'), { withFileTypes: true })
  for (const d of dirs.filter((x) => x.isDirectory())) {
    try {
      css += await readFile(resolve(root, 'src', 'client', 'components', d.name, `${d.name}.css`), 'utf-8') + '\n'
    } catch { /* 无 CSS 组件跳过 */ }
  }
  css += '}\n'
  return new Response(css, { headers: { 'Content-Type': 'text/css' } })
})


// ── 暗色模式防闪（内联脚本——CSS 前设 data-theme；auto 不设——系统 @media 原生生效） ──
const themeNoFouc = `<script>
  try {
    var t = localStorage.getItem('wf_theme')
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
    else if (t === 'light') document.documentElement.setAttribute('data-theme', 'light')
  } catch (e) {}
</script>`

// ── 页面 SSR（整树——SSR ≡ SPA 首帧——原子回退 SPA 空壳） ──
// content/ 文档库移除后：页面首帧 = SPA 同一棵组件树（无 md 回退链）
const SPA_SHELL = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/components.css">
  ${themeNoFouc}
  <title>weifuwu showcase</title>
</head>
<body>
  <div id="root"></div>
  <script src="/app.js"></script>
</body>
</html>`

async function renderSsrPage(req: Request): Promise<Response> {
  try {
    ;(globalThis as any).__SHOWCASE_SSR_BASE__ = ssrDataBase(req)
    const mod = await loadSsrApp()
    const url = new URL(req.url ?? '/', 'http://localhost').pathname
    const html = await mod.uiSsr(mod.buildRouter(), url, { title: 'weifuwu showcase', prefetch: async () => { await mod.fetchIndex(); return { showcaseIndex: mod.getIndexCache() } } })
    const doc = html
      .replace(/<head>[\s\S]*?<\/head>/, `<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${themeNoFouc}
  <link rel="stylesheet" href="/components.css">
  <title>weifuwu showcase</title>
</head>`)
      .replace('</body>', '<script src="/app.js"></script></body>')
    return new Response(doc, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  } catch (e) {
    console.error(`[showcase] SSR 整树失败（回退 SPA 空壳）: ${(e as Error).message ?? String(e)}`)
    return new Response(SPA_SHELL, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
}

// ── 页面路由（SSR 首帧——客户端接管交互；其余路径走底部 SPA 壳） ──
for (const r of ['/', '/components', '/components/:category', '/components/:category/:id', '/layout']) {
  app.get(r, (req: Request) => renderSsrPage(req))
}

/** **SSR/SPA 同一棵树（2026-08——刷新闪烁/滚动跳变根治）**：esbuild 编译
 *  ssr.ts（platform: node——与 /app.js 同入口同源码）→ 临时文件 import →
 *  uiSsr 渲染同一 router 同一 handler → 首帧 = SPA 首帧——接管零差异；
 *  整树 SSR 失败 → 原子回退 SPA 空壳（客户端渲染） */
async function loadSsrApp(): Promise<any> {
  const entry = resolve(__dirname, 'src', 'ssr.ts')
  // **无缓存（正确性优先——与 /app.js 同策略 2026-12 决策）**：每次请求编译
  // 最新源码（框架 src + showcase 全部依赖——mtime 只锁入口会漏依赖变更）
  // **data url import 脆弱面根治（2026-08——SyntaxError :3201:21 实证）**：
  // data:text/javascript;base64 的解析/长度/编辑竞态多次导致 server 崩——
  // 改为临时文件 + file:// import（Node 原生路径——无 data url 解析面）——
  // 编译失败（编辑竞态——半写文件）重试一次
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await esbuild({
        entryPoints: [entry],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
        jsx: 'automatic',
        jsxImportSource: 'weifuwu/vdom',
      })
      const tmp = resolve(osTmpdir(), `wf-ssr-${process.pid}-${Date.now()}.mjs`)
      await writeFile(tmp, result.outputFiles[0].text)
      const mod = await import(pathToFileURL(tmp).href + `?v=${Date.now()}`)
      void rm(tmp, { force: true }).catch(() => {})
      return mod
    } catch (e) {
      if (attempt === 0) {
        console.error('[showcase] SSR bundle 编译/import 失败——重试一次（编辑竞态）:', (e as Error).message.slice(0, 120))
        await new Promise((r) => setTimeout(r, 50))
        continue
      }
      throw e
    }
  }
}

/** SSR fetch 基址（data.ts 自 fetch 本机 /index.json 端点——首次请求缓存） */
let ssrBase = ''
function ssrDataBase(req: Request): string {
  if (!ssrBase) ssrBase = `http://${req.headers.get('host') ?? '127.0.0.1'}`
  return ssrBase
}

app.get('/*', async (req, ctx) => ctx.ui.html`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/components.css">
  ${unsafe(themeNoFouc)}
  <title>weifuwu showcase — 发展引擎</title>
</head>
<body>
  <div id="root"></div>
  <script src="/app.js"></script>
</body>
</html>
script>
</body>
</html>
`)

serve(app, { port: Number(process.env.PORT ?? 3200) })
console.log(`showcase → http://localhost:${process.env.PORT ?? 3200}`)
