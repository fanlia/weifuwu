/**
 * ui 中间件 — 注入 ctx.ui
 *
 * 不持有配置，每个路由调用时传入完整参数。
 *
 * ```ts
 * import { ui, serveStatic } from 'weifuwu'
 *
 * app.use(ui())
 *
 * app.get('*', async (req, ctx) => ctx.ui.html({
 *   title: 'My App',
 *   script: '/static/app.js',
 * }))
 *
 * app.get('/blog/:slug', async (req, ctx) => ctx.ui.html({
 *   title: post.title,
 *   ssr: String(content),
 *   props: { post },
 * }))
 * ```
 */

import type { Middleware, Context } from '../types.ts'

declare module '../types.ts' {
  interface Context {
    ui: {
      /** 返回完整的 SPA HTML 页面 */
      html: (opts?: UiRenderOptions) => Response
    }
  }
}

export interface UiRenderOptions {
  /** 页面标题，默认 'weifuwu' */
  title?: string
  /** Client bundle JS 路径，默认 '/static/app.js' */
  script?: string
  /** 自定义 HTML 模板，覆盖默认模板 */
  template?: string
  /** 内嵌到页面的初始数据（通过 window.__WFUI_PROPS__ 访问） */
  props?: Record<string, unknown>
  /** 预渲染的 HTML 内容，嵌入 #root 内 */
  ssr?: string
}

function defaultTemplate(title: string, script: string, propsTag: string, ssr: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body>
  <div id="root">${ssr}</div>
  ${propsTag}
  <script src="${escapeHtml(script)}"></script>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function makePropsTag(propsJson: string): string {
  return propsJson ? `<script>window.__WFUI_PROPS__=${propsJson}</script>` : ''
}

export function ui(): Middleware {
  return async (_req, ctx, next) => {
    ctx.ui = {
      html(renderOpts: UiRenderOptions = {}): Response {
        const title = renderOpts.title ?? 'weifuwu'
        const script = renderOpts.script ?? '/static/app.js'

        let propsJson = ''
        if (renderOpts.props) {
          try { propsJson = JSON.stringify(renderOpts.props) }
          catch { /* 不可序列化的 props 忽略 */ }
        }

        const propsTag = makePropsTag(propsJson)
        const ssr = renderOpts.ssr ?? ''

        const body = renderOpts.template
          ? renderOpts.template
              .replace(/\{\{title\}\}/g, escapeHtml(title))
              .replace(/\{\{script\}\}/g, escapeHtml(script))
              .replace(/\{\{props\}\}/g, propsTag)
              .replace(/\{\{ssr\}\}/g, ssr)
          : defaultTemplate(title, script, propsTag, ssr)

        return new Response(body, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      },
    }
    return next(_req, ctx)
  }
}
