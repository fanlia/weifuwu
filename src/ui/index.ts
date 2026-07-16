/**
 * ui 中间件 — 注入 ctx.ui.html()
 *
 * 返回 SPA HTML shell，加载前端 client bundle。
 *
 * ```ts
 * import { ui, serveStatic } from 'weifuwu'
 *
 * app.use(ui({ title: 'My App', script: '/static/app.js' }))
 * app.get('/static/*', serveStatic('./dist/client'))
 * app.get('*', async (req, ctx) => ctx.ui.html())
 * ```
 */

import type { Middleware, Context } from '../types.ts'

declare module '../types.ts' {
  interface Context {
    ui: {
      /** 返回 SPA HTML 页面 */
      html: (opts?: UiRenderOptions) => Response
    }
  }
}

export interface UiOptions {
  /** 页面标题，默认 'weifuwu' */
  title?: string
  /** Client bundle JS 路径，默认 '/static/app.js' */
  script?: string
  /** 自定义 HTML 模板，覆盖默认 */
  template?: string
}

export interface UiRenderOptions {
  title?: string
  script?: string
  /** 内嵌到页面的初始数据（通过 window.__WFUI_PROPS__ 访问） */
  props?: Record<string, unknown>
  /** 预渲染的 HTML 内容，嵌入 #root 内 */
  ssr?: string
}

function defaultTemplate(title: string, script: string, propsJson: string, ssr: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body>
  <div id="root">${ssr}</div>
  ${propsJson ? `<script>window.__WFUI_PROPS__=${propsJson}</script>` : ''}
  <script src="${escapeHtml(script)}"></script>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function ui(opts: UiOptions = {}): Middleware {
  const defaultTitle = opts.title ?? 'weifuwu'
  const defaultScript = opts.script ?? '/static/app.js'
  const template = opts.template

  return async (req, ctx, next) => {
    ctx.ui = {
      html(renderOpts: UiRenderOptions = {}): Response {
        const title = renderOpts.title ?? defaultTitle
        const script = renderOpts.script ?? defaultScript
        let propsJson = ''
        if (renderOpts.props) {
          try {
            propsJson = JSON.stringify(renderOpts.props)
          } catch { /* 不可序列化的 props 忽略 */ }
        }

        const ssr = renderOpts.ssr ?? ''

        const body = template
          ? template
              .replace(/\{\{title\}\}/g, escapeHtml(title))
              .replace(/\{\{script\}\}/g, escapeHtml(script))
              .replace(/\{\{props\}\}/g, propsJson)
              .replace(/\{\{ssr\}\}/g, ssr)
          : defaultTemplate(title, script, propsJson, ssr)

        return new Response(body, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      },
    }
    return next(req, ctx)
  }
}
