/**
 * UI 路由 — 提供 SPA 入口和静态资源
 */

import { resolve, join } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { renderSsrPage, ssrToDocument } from '../../ui/ssr.ts'
import type { Router, Context } from 'weifuwu'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

/** 生产模式：预构建的 dist 目录路径 */
function distDir(baseDir: string): string {
  return resolve(baseDir, 'dist')
}

export function registerUiRoutes(app: Router<any>, baseDir: string): void {
  // ── favicon（内联 SVG——浏览器自动请求 404 噪音消除——零文件依赖） ──
  app.get('/favicon.ico', async (): Promise<Response> => new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#4f6ef7"/><path d="M9 21c3-8 11-14 14-11 2 2-1 5-5 8-4 3-7 3-9 3z" fill="#fff"/></svg>`,
    { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=86400' } },
  ))

  // ── 唯一样式来源：weifuwu/components（Token + 布局原语 + 组件样式） ──
  app.get('/static/style.css', async (_req: Request, ctx: Context): Promise<Response> =>
    ctx.ui.css('weifuwu/components/style.css')
  )

  // ── 应用层样式（UX-PLAN-2 波次 3：移动端抽屉外壳——框架明确属应用层职责） ──
  app.get('/static/app.css', async (_req: Request, ctx: Context): Promise<Response> =>
    ctx.ui.css(resolve(baseDir, 'ui', 'app.css'))
  )

  // ── 客户端 JS bundle ─────────────────────────────────
  if (IS_PRODUCTION) {
    const dist = distDir(baseDir)
    // 生产模式：服务预构建的静态文件（gzip——node:zlib 零依赖——一次性压缩缓存）
    let appJsGz: Blob | null = null
    app.get('/static/app.js', async (req: Request, _ctx: Context): Promise<Response> => {
      const jsPath = join(dist, 'app.js')
      if (!existsSync(jsPath)) {
        return new Response('/* app.js not built */', {
          status: 200,
          headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
        })
      }
      const acceptsGzip = (req.headers.get('accept-encoding') ?? '').includes('gzip')
      if (!acceptsGzip) {
        return new Response(readFileSync(jsPath), {
          headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'max-age=3600' },
        })
      }
      if (!appJsGz) appJsGz = new Blob([gzipSync(readFileSync(jsPath))])
      return new Response(appJsGz, {
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Content-Encoding': 'gzip',
          'Cache-Control': 'max-age=3600',
        },
      })
    })
  } else {
    // 开发模式：动态编译
    app.get('/static/app.js', async (req: Request, ctx: Context): Promise<Response> =>
      ctx.ui.js(resolve(baseDir, 'ui', 'v3-main.tsx')) // vdom3 默认入口（main.tsx 为 vdom2 遗留——vdom2 已删除）
    )
  }

  // ── vdom3 入口（默认引擎切换验证） ────────────────
  if (!IS_PRODUCTION) {
    app.get('/v3-app.js', async (_req: Request, ctx: Context): Promise<Response> =>
      ctx.ui.js(resolve(baseDir, 'ui', 'v3-main.tsx'))
    )
    const v3Page = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>vdom3 — Agent Platform</title>
<link rel="stylesheet" href="/static/style.css">
<link rel="stylesheet" href="/static/app.css">
<script>window.__WF_V3_AUDIT='1'</script>
</head>
<body>
<div id="root"></div>
<script>history.replaceState(null, '', location.pathname.replace(/^\\/v3/, '') || '/')</script>
<script type="module" src="/v3-app.js"></script>
</body>
</html>`
    app.get('/v3', async (): Promise<Response> => new Response(v3Page, { headers: { 'Content-Type': 'text/html' } }))
    app.get('/v3/login', async (): Promise<Response> => new Response(v3Page, { headers: { 'Content-Type': 'text/html' } }))
  }

  // ── SPA 入口页面 ───────────────────────────────────
  if (IS_PRODUCTION) {
    const dist = distDir(baseDir)
    const htmlPath = join(dist, 'index.html')
    let htmlTemplate = ''
    if (existsSync(htmlPath)) {
      htmlTemplate = readFileSync(htmlPath, 'utf-8')
        .replace('{{script}}', '/static/app.js')
    }

    const spaPaths = [
      '/', '/login', '/register', '/dashboard',
      '/agents', '/agents/new', '/agents/:id',
      '/templates',
      '/departments', '/departments/new', '/departments/:id',
      '/chat/new', '/chat/:id',
      '/approvals',
      '/sandboxes',
      '/reports',
      '/deliverables',
      '/settings',
      '/admin',
    ]

    for (const path of spaPaths) {
      app.get(path, async (): Promise<Response> => {
        if (htmlTemplate) {
          return new Response(htmlTemplate, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
        }
        return new Response(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Platform</title>
  <link rel="stylesheet" href="/static/style.css">
  <link rel="stylesheet" href="/static/app.css">
</head>
<body>
  <div id="root"><div class="boot-loading"><div class="spinner"></div>加载中...</div></div>
  <script type="module" src="/static/app.js"></script>
</body>
</html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      })
    }
  } else {
    const spaPaths = [
      '/', '/login', '/register', '/dashboard',
      '/agents', '/agents/new', '/agents/:id',
      '/templates',
      '/departments', '/departments/new', '/departments/:id',
      '/chat/new', '/chat/:id',
      '/approvals',
      '/sandboxes',
      '/reports',
      '/deliverables',
      '/settings',
      '/admin',
    ]

    for (const path of spaPaths) {
      app.get(path, async (req: Request, ctx: Context): Promise<Response> => {
        // A1 首屏 SSR（2026-08）：登录/注册服务端渲染——首屏即表单（零 JS 可见）
        // ——客户端 uiServe 吸收接管（SSR 失败回退空壳——SPA 兜底不阻断）
        if (path === '/login' || path === '/register') {
          const ssrBody = await renderSsrPage(path)
          if (ssrBody !== null) return new Response(
            ssrToDocument(ssrBody, path === '/login' ? '登录 — Agent Platform' : '注册 — Agent Platform'),
            { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 },
          )
        }
        return ctx.ui.html`
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Agent Platform</title>
          <link rel="stylesheet" href="/static/style.css">
          <link rel="stylesheet" href="/static/app.css">
        </head>
        <body>
          <div id="root"><div class="boot-loading"><div class="spinner"></div>加载中...</div></div>
          <script type="module" src="/static/app.js"></script>
        </body>
        </html>
      `})
    }
  }
}
