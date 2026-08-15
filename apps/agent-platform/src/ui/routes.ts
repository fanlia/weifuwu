/**
 * UI 路由 — 提供 SPA 入口和静态资源
 */

import { resolve, join } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import type { Router, Context } from 'weifuwu'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

/** 生产模式：预构建的 dist 目录路径 */
function distDir(baseDir: string): string {
  return resolve(baseDir, 'dist')
}

export function registerUiRoutes(app: Router<any>, baseDir: string): void {
  // ── 唯一样式来源：weifuwu/components（Token + 布局原语 + 组件样式） ──
  app.get('/static/style.css', async (_req: Request, ctx: Context): Promise<Response> =>
    ctx.ui.css('weifuwu/components/style.css')
  )

  // ── 客户端 JS bundle ─────────────────────────────────
  if (IS_PRODUCTION) {
    const dist = distDir(baseDir)
    // 生产模式：服务预构建的静态文件
    app.get('/static/app.js', async (_req: Request, _ctx: Context): Promise<Response> => {
      const jsPath = join(dist, 'app.js')
      if (!existsSync(jsPath)) {
        return new Response('/* app.js not built */', {
          status: 200,
          headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
        })
      }
      const js = readFileSync(jsPath, 'utf-8')
      return new Response(js, {
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
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
      '/settings',
      '/admin',
    ]

    for (const path of spaPaths) {
      app.get(path, async (req: Request, ctx: Context): Promise<Response> => ctx.ui.html`
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Agent Platform</title>
          <link rel="stylesheet" href="/static/style.css">
        </head>
        <body>
          <div id="root"><div class="boot-loading"><div class="spinner"></div>加载中...</div></div>
          <script type="module" src="/static/app.js"></script>
        </body>
        </html>
      `)
    }
  }
}
