/**
 * showcase 应用路由（buildRouter——双端一体：浏览器 uiServe / 服务端 uiSsr 同一棵组件树）
 *
 * 路由（components-only 定稿——SHOWCASE-COMPONENTS-ONLY-PLAN）：
 *   /                        组件目录（全量平铺 A→Z + 搜索——组件即首页）
 *   /components              同目录（别名——旧链接保留）
 *   /components/:id          组件详情（活体 demo）
 *   /components/:id/:legacy  legacy 三段兜底（旧 /components/<分类>/<id>——取末段为 id）
 *
 * **Trie 参数槽纪律**：深度 2 的参数槽与扁平路由同名（:id——Trie 同槽位
 * 不同 param 名注册即抛 param conflict）——legacy 路由第二段名为 :legacy。
 *
 * **SSR/SPA 同源纪律（2026-08）**：服务端渲染必须与客户端接管渲染
 * 同一棵组件树（差异 = 刷新闪烁 + 滚动跳变）。main.tsx（浏览器 boot）
 * 与 server.ts（uiSsr）共用本文件——零分支漂移。
 */
import { UIRouter, h } from 'weifuwu/vdom'
import type { Component, RenderCtx, UIContext } from 'weifuwu/vdom'
import { toast } from '../../../src/client/vdom/commands.ts'
import { confirm } from '../../../src/client/components/Confirm/Confirm.ts'
import { notification } from '../../../src/client/components/Notification/Notification.ts'
import { ComponentsIndex, ComponentPage } from './pages/components.tsx'
import { NotFound } from './pages/not-found.tsx'
import { Shell } from './shell.tsx'

// ── 页面 handler（Shell 布局包裹——root 稳定——布局共享精准路由） ──
// **active 纪律**：Shell 吸顶导航当前域高亮 = 当前路径推导（请求 URL——
// 浏览器/SSR 同侧同值——服务端渲染 active 与客户端接管一致——不依赖
// location 全局——SSR 无 window）
const pathOf = (req: Request): string => {
  try { return new URL(req.url ?? '/', 'http://localhost').pathname } catch { return '/' }
}
const page = (Comp: Component, props: Record<string, unknown> = {}) =>
  (req: Request, ctx: UIContext) =>
    (ctx as RenderCtx).stream(h(Shell, { page: h(Comp, props as never), active: pathOf(req) }))
const pageWithParams = (Comp: Component) =>
  (req: Request, ctx: UIContext) =>
    page(Comp, { ...(ctx.params ?? {}) } as Record<string, unknown>)(req, ctx)

/** legacy 三段式（/components/<分类>/<id>——扁平化过渡兜底）：取末段为组件 id */
const legacyComponentPage = (req: Request, ctx: UIContext) => {
  const p = (ctx.params ?? {}) as Record<string, string>
  return page(ComponentPage, { id: p.legacy ?? p.id })(req, ctx)
}

export function buildRouter(): UIRouter {
  const router = new UIRouter()
  router.get('/', page(ComponentsIndex))
  router.get('/components', page(ComponentsIndex))
  router.get('/components/:id', pageWithParams(ComponentPage))
  router.get('/components/:id/:legacy', legacyComponentPage)
  // **404 友好化（2026-08）**：shell 包裹渲染（与页面同构——导航可用）——
  // 未知路径不再空白
  router.notFound((req: Request, ctx: UIContext) =>
    (ctx as RenderCtx).stream(h(Shell, { page: h(NotFound), active: pathOf(req) })))
  return router
}

export { toast, confirm, notification }
