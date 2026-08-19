#!/usr/bin/env node
/**
 * weifuwu docs — 本地文档服务器（npm 用户离线文档站）
 *
 * 用法：npx weifuwu docs [--port 4000]
 *
 * 自举纪律（design/showcase-plan.md §2）：文档服务器本身是一个 weifuwu 应用——
 * Router + serve + Markdown 组件 + 框架 SSR 管线（renderToEvents → eventsToHtml）。
 *
 * content/ 定位：<包根>/content（随包发布）——dev 下为仓库根 content/。
 * 路由：
 *   /                       → content/index.md 渲染 + 域导航
 *   /components/:id         → 组件文档渲染（其他域同理：layout/patterns/apps/backend/capabilities/guides）
 *   /raw/:domain/:id.md     → 原始 Markdown（复制/LLM）
 *   /components.css         → 组件样式（layout 原语 + 组件 CSS）
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router, serve } from '../server/index.ts'
import { h } from '../client/vdom/index.ts'
import { renderToStream } from '../client/vdom/core/build.ts'
import { commandToHtml } from '../client/vdom/core/html.ts'
import { Markdown } from '../client/components/index.ts'

// ── 定位 content/（向上逐级找含 index.md 的 content 目录） ──
function findContentRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 6; i++) {
    const cand = join(dir, 'content')
    if (existsSync(join(cand, 'index.md'))) return cand
    const up = dirname(dir)
    if (up === dir) break
    dir = up
  }
  throw new Error('未找到 content/（预期 <包根>/content——npm i weifuwu 后应存在）')
}

const contentRoot = findContentRoot()
const cssFile = [
  resolve(contentRoot, '..', 'dist', 'components', 'style.css'),
  resolve(contentRoot, '..', 'src', 'components', 'style.css'),
  resolve(contentRoot, '..', 'components.css'),
].find((f) => existsSync(f)) ?? resolve(contentRoot, '..', 'dist', 'components', 'style.css')

// ── 框架 SSR 渲染 Markdown 文档 → HTML（vdom 管线：renderToStream →
// 命令流 → commandToHtml 流式）──
async function renderMd(md: string): Promise<string> {
  // Command 流直接 → commandToHtml（同进程不经编码解码——事件面 no-op）
  const reader = renderToStream(h(Markdown, { content: md })).pipeThrough(commandToHtml()).getReader()
  let html = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    html += value
  }
  return html
}

// ── 文档域 → content 子目录 ──
const DOMAINS = ['components', 'layout', 'patterns', 'apps', 'backend', 'capabilities', 'guides']
const DOMAIN_TITLES: Record<string, string> = {
  components: '组件', layout: '布局原语', patterns: '页面模式',
  apps: '应用模板', backend: '后端能力', capabilities: '框架能力', guides: '指南',
}

const PAGE_TMPL = (title: string, body: string, nav: string) => `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="/components.css">
<title>${title} — weifuwu docs</title>
</head>
<body style="max-width:860px;margin:0 auto;padding:24px 20px 80px">
${nav}
<main>${body}</main>
<footer style="margin-top:48px;padding-top:16px;border-top:1px solid var(--wf-color-border, #e2e8f0);color:var(--wf-color-text-secondary, #64748b);font-size:12px">
  weifuwu docs · node_modules/weifuwu/content/ · 与安装版本同步
</footer>
</body>
</html>`

const NAV = (active: string) => `<nav style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid var(--wf-color-border, #e2e8f0)">
  <a href="/" style="text-decoration:none;font-weight:700;color:var(--wf-color-text, #0f172a)">weifuwu docs</a>
  ${Object.entries(DOMAIN_TITLES).map(([d, t]) =>
    `<a href="/${d}/index.md" style="text-decoration:none;padding:2px 8px;border-radius:6px;font-size:13px;${d === active ? 'background:var(--wf-color-primary-bg, #eff6ff);color:var(--wf-color-primary, #2563eb)' : 'color:var(--wf-color-text-secondary, #64748b)'}">${t}</a>`).join('')}
  <span style="margin-left:auto;font-family:monospace;font-size:11px;color:var(--wf-color-text-tertiary, #94a3b8)">LLM: read node_modules/weifuwu/content/</span>
</nav>`

export async function main(): Promise<void> {
  const args = process.argv.slice(2)
  let port = 4000
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port') port = Number(args[i + 1]) || 4000
    if (args[i] === '--help' || args[i] === '-h') {
      console.log('weifuwu docs — 本地文档服务器\n\n用法: weifuwu docs [--port 4000]\n\n路由:\n  /              文档首页\n  /:domain/:id   文档页（components/layout/patterns/apps/backend/capabilities/guides）\n  /raw/...       原始 Markdown\n')
      return
    }
  }

  const app = new Router()

  // 文档页：/:domain/:id（.md 后缀可选）
  for (const domain of DOMAINS) {
    app.get(`/${domain}/:id`, async (req: Request, ctx: any): Promise<Response> => {
      const id = (ctx as any).params.id.replace(/\.md$/, '')
      const file = join(contentRoot, domain, `${id}.md`)
      if (!existsSync(file)) return Response.json({ error: 'not found' }, { status: 404 })
      const md = await readFile(file, 'utf-8')
      const body = await renderMd(md)
      return new Response(PAGE_TMPL(`${id} · ${DOMAIN_TITLES[domain]}`, body, NAV(domain)), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    })
  }

  // 原始 Markdown（LLM/复制）
  app.get('/raw/:domain/:id', async (req: Request, ctx: any): Promise<Response> => {
    const { domain, id } = (ctx as any).params
    if (!DOMAINS.includes(domain)) return Response.json({ error: 'bad domain' }, { status: 400 })
    const file = join(contentRoot, domain, id.replace(/\.md$/, '') + '.md')
    if (!existsSync(file)) return Response.json({ error: 'not found' }, { status: 404 })
    return new Response(await readFile(file, 'utf-8'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  })

  // 首页（index.md 渲染）
  app.get('/', async (req: Request): Promise<Response> => {
    const md = await readFile(join(contentRoot, 'index.md'), 'utf-8')
    const body = await renderMd(md)
    return new Response(PAGE_TMPL('weifuwu docs', body, NAV('')), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  })

  // 样式
  app.get('/components.css', async (req: Request): Promise<Response> => {
    const css = await readFile(cssFile, 'utf-8')
    return new Response(css, { headers: { 'Content-Type': 'text/css' } })
  })

  const server = serve(app, { port })
  await server.ready
  console.log(`weifuwu docs → http://localhost:${server.port}（content: ${contentRoot}）`)
}

// bin 入口（直接执行时启动；被测试 import 时不启动）
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
