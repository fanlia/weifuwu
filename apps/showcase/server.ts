/**
 * apps/showcase — weifuwu 发展引擎（综合展示平台）
 *
 * 自举纪律（design/showcase-plan.md §2）：平台自身全部由 weifuwu 能力构成——
 * createRouter 六域路由 + components/layout 原语 + Markdown 组件渲染 content/。
 *
 * 能力：
 *   /app.js               平台前端（ctx.ui.js 动态编译）
 *   /components.css       CSS 运行时聚合（layout @import + 组件 CSS——与 build.mjs 同逻辑）
 *   /content/:domain/:id.md  文档文本端点（LLM curl + 平台渲染共用——content/ 根级同源）
 *   /src/examples/*       示例源码端点（text/plain——patterns/apps 复制即用）
 *   /api/chat /api/approve /api/files/:name   wire-fake（AiChat/FilePreview 演示）
 *   /llms.txt             全站 LLM 索引（= content/index.md）
 */
import { serve, Router, ui } from '../../src/server/index.ts'
import { HtmlSafe } from '../../src/server/ui/html-safe.ts'
import { shellHeader } from './src/ssr-header.ts'
// ctx.ui.html 标签模板会转义插值——HTML 插值（header/防闪脚本）需 unsafe 包裹
const unsafe = (s: string): string => new HtmlSafe(s) as unknown as string
import { h } from '../../src/client/vdom/index.ts'
import { renderToStream } from '../../src/client/vdom/core/build.ts'
import { commandToHtml } from '../../src/client/vdom/core/ssr/html.ts'
import { Markdown } from '../../src/client/components/index.ts'
import { installDemoBackend } from './src/demo-backend.ts'
import { registerTodoApi } from '../../examples/apps/todo/api.ts'
import { registerAuthApi, ensureAuthTables } from '../../examples/apps/auth/api.ts'
import { registerAdminApi, ensureAdminTables } from '../../examples/apps/admin/api.ts'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { build as esbuild } from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..', '..') // 仓库根（= 发布根）
const contentRoot = resolve(root, 'content')
const examplesRoot = resolve(root, 'examples')

// ── 进程级防御（2026-08——SSR 组件副作用崩溃实证）──
// unhandledRejection 默认 throw → 服务器进程退出（FilePreview fetch
// 崩溃链实证）——**记录不崩**（问题可见——页面级渲染失败由 renderFullPage
// 回退兜底——进程存活是可用性底线）
process.on('unhandledRejection', (reason) => {
  console.error('[showcase] unhandledRejection（进程保护——不退出）:', reason instanceof Error ? (reason.message + '\n' + (reason.stack ?? '').split('\n').slice(0, 4).join('\n')) : String(reason))
})
process.on('uncaughtException', (err) => {
  console.error('[showcase] uncaughtException（进程保护——不退出）:', err.message)
})

const app = new Router()
app.use(ui())

// ── 后端活体端点（MemorySql/MemoryRedis/rateLimit/queue/graphql/ws——第一批 8 项） ──
const demoCtx = {} as any
installDemoBackend(app, demoCtx)

// ── todo 应用模板后端（共享注册函数——嵌入活体数据通路） ──
await demoCtx.sql.unsafe('CREATE TABLE IF NOT EXISTS todos (id serial PRIMARY KEY, name text, done boolean DEFAULT false)')
registerTodoApi(app, demoCtx.sql)

// ── auth 应用模板后端（内存用户 + 会话） ──
await ensureAuthTables(demoCtx.sql)
registerAuthApi(app, demoCtx.sql)

// ── admin 应用模板后端（订单表 + 种子数据） ──
await ensureAdminTables(demoCtx.sql)
registerAdminApi(app, demoCtx.sql)

// ── 文档文本端点（LLM 主路径——curl 即所得） ──
const DOMAINS = ['components', 'layout', 'patterns', 'apps', 'backend', 'capabilities', 'guides']
for (const domain of DOMAINS) {
  app.get(`/content/${domain}/:id`, async (req: Request, ctx: any): Promise<Response> => {
    const id = (ctx as any).params.id.replace(/\.md$/, '')
    const file = resolve(contentRoot, domain, `${id}.md`)
    if (!file.startsWith(contentRoot) || !existsSync(file)) return Response.json({ error: 'not found' }, { status: 404 })
    return new Response(await readFile(file, 'utf-8'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  })
}

// 结构化索引（平台前端 + LLM 共用）
app.get('/content/index.json', async (req: Request): Promise<Response> => {
  const file = resolve(contentRoot, 'index.json')
  if (!existsSync(file)) return Response.json({ error: 'not found' }, { status: 404 })
  return new Response(await readFile(file, 'utf-8'), { headers: { 'Content-Type': 'application/json' } })
})

// ── 示例源码端点（复制即用） ──
app.get('/src/examples/*', async (req: Request, ctx: any): Promise<Response> => {
  const rel = (ctx as any).params['*'] ?? ''
  const file = resolve(examplesRoot, rel)
  if (!file.startsWith(examplesRoot) || !existsSync(file)) return Response.json({ error: 'not found' }, { status: 404 })
  return new Response(await readFile(file, 'utf-8'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
})

// ── llms.txt（= content/index.md 同源） ──
app.get('/llms.txt', async (req: Request): Promise<Response> => {
  const md = await readFile(resolve(contentRoot, 'index.md'), 'utf-8')
  return new Response(md, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
})

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

// ── 文档页 SSR（SEO——/components/:id 等被搜索引擎索引；SPA 客户端接管交互） ──
const DOC_DOMAINS = ['components', 'layout', 'patterns', 'apps', 'backend', 'capabilities', 'guides']
const DOMAIN_TITLES: Record<string, string> = {
  components: '组件', layout: '布局原语', patterns: '页面模式',
  apps: '应用模板', backend: '后端能力', capabilities: '框架能力', guides: '指南',
}

/** **SSR/SPA 同一棵树（2026-08——刷新闪烁/滚动跳变根治——inputnumber 实证：
 *  SSR 只有 Markdown、SPA 有面包屑/标题/活体 demo/页脚——刷新先见文档页、
 *  加载后整页跳变——用户误判素材丢失）**：esbuild 编译 main.tsx（platform:
 *  node——与 /app.js 同入口同源码——零手写镜像）→ 动态 import data URL →
 *  uiSsr 渲器同一 router 同一 handler → 首帧 = SPA 首帧（面包屑/标题/
 *  demo/页脚同 html——接管零差异）——**原子回退**：整树 SSR 失败（demo 的
 *  浏览器态缺失等）→ 回退 Markdown-only SSR（SEO 不丢——仅无 demo 首帧） */
async function loadSsrApp(): Promise<any> {
  const entry = resolve(__dirname, 'src', 'ssr.ts')
  // **无缓存（正确性优先——与 /app.js 同策略 2026-12 决策）**：每次请求编译
  // 最新源码（框架 src + showcase 全部依赖——mtime 只锁入口会漏依赖变更）
  // **编辑竞态防御（2026-08——data url import SyntaxError 实证——:3201:21）**：
  // 开发中修改文件与请求并发——esbuild 读到半写文件 → bundle 语法错误 →
  // import 失败（偶发崩溃）——重试一次（50ms 间隔——文件写入完成即自愈）
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
      return await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
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

/** SSR fetch 基址（data.ts 自 fetch 本机 /content/* 端点——首次请求缓存） */
let ssrBase = ''
function ssrDataBase(req: Request): string {
  if (!ssrBase) ssrBase = `http://${req.headers.get('host') ?? '127.0.0.1'}`
  return ssrBase
}

/** 整树 SSR（同一棵组件树——SSR ≡ SPA 首帧） */
async function renderFullPage(domain: string, id: string, req: Request): Promise<Response> {
  ;(globalThis as any).__SHOWCASE_SSR_BASE__ = ssrDataBase(req)
  const mod = await loadSsrApp()
  // **同实例纪律**：uiSsr 必须与 h() 同一 bundle 实例（src/ssr.ts——
  // Fragment 符号全等——跨实例 = 文本变空洞锚）
  // 渲染实际请求路径（/components/input/inputnumber——category 段由路由承载）
  const url = new URL(req.url ?? '/', 'http://localhost').pathname
  const html = await mod.uiSsr(mod.buildRouter(), url, { title: `${id} · ${DOMAIN_TITLES[domain]} — weifuwu showcase` })
  const head = `<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="weifuwu ${DOMAIN_TITLES[domain]}文档：${id}">
  ${themeNoFouc}
  <link rel="stylesheet" href="/components.css">
  <title>${id} · ${DOMAIN_TITLES[domain]} — weifuwu showcase</title>
</head>`
  const doc = html
    .replace(/<head>[\s\S]*?<\/head>/, head)
    .replace('</body>', '<script src="/app.js"></script></body>')
  return new Response(doc, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

/** 回退：Markdown-only SSR（整树 SSR 失败时——SEO 保底） */
async function renderDocOnlyPage(domain: string, id: string): Promise<Response> {
  const file = resolve(contentRoot, domain, `${id}.md`)
  const md = await readFile(file, 'utf-8')
  const reader = renderToStream(h(Markdown, { content: md })).pipeThrough(commandToHtml()).getReader()
  let body = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    body += value
  }
  const nav = shellHeader(domain)
  return new Response(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="weifuwu ${DOMAIN_TITLES[domain]}文档：${id}">
  ${themeNoFouc}
  <link rel="stylesheet" href="/components.css">
  <title>${id} · ${DOMAIN_TITLES[domain]} — weifuwu showcase</title>
</head>
<body>
  <div id="root">${nav}<main style="max-width:860px;margin:0 auto;padding:24px 20px 80px">${body}</main></div>
  <script src="/app.js"></script>
</body>
</html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

async function renderDocPage(domain: string, id: string, req: Request): Promise<Response> {
  const file = resolve(contentRoot, domain, `${id}.md`)
  if (!file.startsWith(contentRoot) || !existsSync(file)) return Response.json({ error: 'not found' }, { status: 404 })
  try {
    return await renderFullPage(domain, id, req)
  } catch (e) {
    console.error(`[showcase] SSR 整树失败（回退 Markdown-only）: ${(e as Error).message ?? String(e)}`)
    return renderDocOnlyPage(domain, id)
  }
}

// ── 文档页 SSR 路由（与 SPA 同 URL——SEO 索引；SPA 接管交互） ──
for (const domain of DOC_DOMAINS) {
  if (domain === 'components') {
    app.get('/components/:category/:id', async (req: Request, ctx: any): Promise<Response> =>
      renderDocPage('components', (ctx as any).params.id.replace(/\.md$/, ''), req))
    app.get('/components/:category', async (req: Request, ctx: any): Promise<Response> => {
      // 分类页（如 /components/core）无独立文档——回退 SPA 壳（客户端渲染分类网格）
      const cat = (ctx as any).params.category
      if (existsSync(resolve(contentRoot, 'components', `${cat}.md`))) {
        return renderDocPage('components', cat, req)
      }
      return ctx.ui.html`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/components.css">
  ${unsafe(themeNoFouc)}
  <title>weifuwu showcase</title>
</head>
<body>
  <div id="root"></div>
  <script src="/app.js"></script>
</body>
</html>`
    })
  } else {
    app.get(`/${domain}/:id`, async (req: Request, ctx: any): Promise<Response> =>
      renderDocPage(domain, (ctx as any).params.id.replace(/\.md$/, ''), req))
  }
}

// ── 首页 SSR（SEO + 与 SPA 内容一致——hero 结构同文案，避免 SSR/SPA 切换闪烁） ──
app.get('/', async (req: Request): Promise<Response> => {
  // hero 静态结构（与前端 home.tsx 同文案——SPA 接管时内容一致，无"文字闪过"）
  const hero = `<div class="wf-container wf-stack" style="--wf-max:980px;--wf-gap:24px;padding:32px 16px">
  <div class="wf-border wf-rounded-lg wf-clip" style="background:linear-gradient(180deg,var(--wf-color-bg) 0%,var(--wf-color-bg-secondary) 100%)">
    <div class="wf-stack wf-gap-md" style="padding:48px 32px;text-align:center">
      <h1 style="font-size:2.25rem;margin:0;letter-spacing:-0.02em">weifuwu <span style="color:var(--wf-color-primary)">发展引擎</span></h1>
      <p style="color:var(--wf-color-text-secondary);max-width:560px;margin:8px auto 0">组件 / 布局原语 / 页面模式 / 应用模板 / 后端能力 / 框架能力 / 指南——全部可复制、可验证、可深链</p>
      <div class="wf-surface wf-border wf-rounded-md" style="font-family:var(--wf-font-mono);text-align:left;max-width:520px;margin:12px auto 0;padding:12px 16px;font-size:12px">
        <div><span style="color:var(--wf-color-primary)">$</span> npx weifuwu docs</div>
        <div style="color:var(--wf-color-text-tertiary)">→ 文档站已就绪（129 组件 · 20 指南）</div>
        <div><span style="color:var(--wf-color-primary)">$</span> node server.ts</div>
        <div style="color:var(--wf-color-text-tertiary)">→ 你的第一个页面，跑起来了</div>
      </div>
    </div>
  </div>
  <nav style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
    <a href="/components" style="padding:4px 12px;border:1px solid var(--wf-color-border);border-radius:6px;text-decoration:none;color:inherit;font-size:13px">组件</a>
    <a href="/layout" style="padding:4px 12px;border:1px solid var(--wf-color-border);border-radius:6px;text-decoration:none;color:inherit;font-size:13px">布局原语</a>
    <a href="/patterns" style="padding:4px 12px;border:1px solid var(--wf-color-border);border-radius:6px;text-decoration:none;color:inherit;font-size:13px">页面模式</a>
    <a href="/apps" style="padding:4px 12px;border:1px solid var(--wf-color-border);border-radius:6px;text-decoration:none;color:inherit;font-size:13px">应用模板</a>
    <a href="/backend" style="padding:4px 12px;border:1px solid var(--wf-color-border);border-radius:6px;text-decoration:none;color:inherit;font-size:13px">后端能力</a>
    <a href="/capabilities" style="padding:4px 12px;border:1px solid var(--wf-color-border);border-radius:6px;text-decoration:none;color:inherit;font-size:13px">框架能力</a>
    <a href="/guides" style="padding:4px 12px;border:1px solid var(--wf-color-border);border-radius:6px;text-decoration:none;color:inherit;font-size:13px">指南</a>
  </nav>
</div>`
  return new Response(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="weifuwu — AI SaaS 全栈框架：129 组件 + 布局原语 + 应用模板 + 文档随包。用 weifuwu 构建的网站（自举）。">
  ${themeNoFouc}
  <link rel="stylesheet" href="/components.css">
  <title>weifuwu showcase — 发展引擎</title>
</head>
<body>
  <div id="root">${shellHeader('')}${hero}</div>
  <script src="/app.js"></script>
</body>
</html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
})

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
console.log(`showcase → http://localhost:${process.env.PORT ?? 3200}（LLM: /llms.txt · /content/:domain/:id.md）`)
