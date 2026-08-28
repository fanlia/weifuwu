/**
 * showcase 应用路由（buildRouter——双端一体：浏览器 uiServe / 服务端 uiSsr 同一棵组件树）
 *
 * 路由（design/showcase-plan.md §5）：
 *   /                        首页（六域入口 + 计数）
 *   /components[/:category][/:id]   组件总览/分类/详情
 *   /layout[/:id]            布局原语
 *   /patterns[/:id]          页面模式
 *   /apps[/:id]              应用模板
 *   /backend[/:id]           后端能力
 *   /capabilities[/:id]      框架能力
 *   /guides[/:id]            指南
 *
 * **SSR/SPA 同源纪律（2026-08）**：服务端渲染必须与客户端接管渲染
 * 同一棵组件树（差异 = 刷新闪烁 + 滚动跳变——inputnumber 实证：
 * SSR 只有 Markdown、SPA 有面包屑/标题/活体 demo/页脚）。main.tsx
 * （浏览器 boot）与 server.ts（uiSsr）共用本文件——零分支漂移。
 */
import { UIRouter, h } from 'weifuwu/vdom'
import type { Component, RenderCtx, UIContext } from 'weifuwu/vdom'
import { toast } from '../../../src/client/vdom/commands.ts'
import { confirm } from '../../../src/client/components/Confirm/Confirm.ts'
import { notification } from '../../../src/client/components/Notification/Notification.ts'
import { Home } from './pages/home.tsx'
import { ComponentsIndex, CategoryPage, ComponentPage } from './pages/components.tsx'
import { LayoutIndex } from './pages/domains.tsx'
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
    (ctx as RenderCtx).stream(h(Shell, { page: h(Comp, { ...(ctx.params ?? {}) } as never), active: pathOf(req) }))

export function buildRouter(): UIRouter {
  const router = new UIRouter()
  router.get('/', page(Home))
  router.get('/components', page(ComponentsIndex))
  router.get('/components/:category', pageWithParams(CategoryPage))
  router.get('/components/:category/:id', pageWithParams(ComponentPage))
  router.get('/layout', page(LayoutIndex))
                        // **404 友好化（2026-08）**：shell 包裹渲染（与页面同构——导航可用）——
  // 未知路径不再空白
  router.notFound((req: Request, ctx: UIContext) =>
    (ctx as RenderCtx).stream(h(Shell, { page: h(NotFound), active: pathOf(req) })))
  return router
}

export { toast, confirm, notification }
