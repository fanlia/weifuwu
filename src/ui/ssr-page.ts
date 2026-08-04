/**
 * uiSsr — 路由级 SSR 中间件：前端路由表驱动的自动服务端渲染
 *
 * 开发者只声明路由（path + component），GET 匹配即自动 SSR：
 *   匹配 → 注入 params → ctx.ui.ssr 渲染组件（async 工厂 await）→ 页面模板 + __DATA__
 *   未匹配 → next()（交给后续 API/静态/404）
 *
 * 与客户端 router() 共用同一份路由定义（route-match.ts），SPA/SSR 一个声明。
 */

import type { Middleware } from '../types.ts'
import type { RouteDef } from '../client/types.ts'
import type { Component, AsyncComponent } from '../client/vnode.ts'
import { flattenRoutes, matchRoute, extractParams } from '../client/route-match.ts'
import { ssrToString, serializeData } from './ssr.ts'
import { HtmlSafe } from './html-safe.ts'

export interface UiSsrOptions {
  /** 前端路由定义（与 router() 共享同一份） */
  routes: RouteDef[]
  /** 客户端 bundle 路径（自动注入 <script src>，如 '/static/app.js'） */
  bundle?: string
  /** 自定义 title（默认取路由定义 title 或 'weifuwu'） */
  title?: (ctx: { params: Record<string, string>; def: RouteDef }) => string
  /** 自定义页面模板：返回完整 HTML（默认内置，含 head/root/__DATA__/bundle） */
  template?: (parts: {
    html: string
    dataScript: string
    title: string
    bundle?: string
  }) => string
}

const DEFAULT_TEMPLATE = (p: {
  html: string
  dataScript: string
  title: string
  bundle?: string
}): string => `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(p.title)}</title>
</head>
<body>
  <div id="root">${p.html}</div>
  ${p.dataScript}
  ${p.bundle ? `<script src="${escapeHtml(p.bundle)}"></script>` : ''}
</body>
</html>`

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * 路由级 SSR 中间件：
 *
 * ```ts
 * const app = new Router()
 * app.use(uiSsr({ routes, bundle: '/static/app.js' }))
 * ```
 */
export function uiSsr(opts: UiSsrOptions): Middleware {
  const flatRoutes = flattenRoutes(opts.routes)
  const template = opts.template ?? DEFAULT_TEMPLATE

  return async (req, ctx, next) => {
    if (req.method !== 'GET') return next(req, ctx)

    const url = new URL(req.url)
    const match = matchRoute(url.pathname, flatRoutes)
    if (!match) return next(req, ctx)

    // 注入路由参数（组件工厂 ctx.params.slug 可用）——与客户端 router 同源
    const params = extractParams(url.pathname, match)
    const def = match.chain[match.chain.length - 1] ?? match.def
    const pageCtx = Object.assign(Object.create(ctx), {
      params,
      route: { path: url.pathname, params, query: Object.fromEntries(url.searchParams) },
    })

    // 组件未声明（layout 兜底路由）→ 交给后续
    if (!def.component) return next(req, ctx)

    const data = new Map<string, unknown>()
    const html = await ssrToString(def.component as Component | AsyncComponent, {}, pageCtx, { data })
    const title = opts.title
      ? opts.title({ params, def })
      : (def.title as string) || 'weifuwu'
    const dataScript = new HtmlSafe(serializeData(data)).toString()

    const body = template({ html: html.toString(), dataScript, title, bundle: opts.bundle })
    return new Response(body, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
}
