/**
 * 通用 hydration 入口 — 服务所有 SSR 页面
 *
 * router() 按当前 URL 匹配 routes → 注入 ctx.route（与服务端 uiSsr 同源匹配逻辑）
 * RouteView 渲染匹配的组件 → 与服务端 HTML 一致 → 游标收养（不重建、无闪跳）
 *
 * 不依赖路由数组顺序：任何匹配 routes 的 URL 都能正确 hydrate。
 */

import { createApp, router, RouteView } from 'weifuwu/client'
import { routes } from './routes.tsx'

createApp()
  .use(router({ routes }))
  .mount('#root', RouteView, { hydrate: true })
