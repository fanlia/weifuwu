/**
 * weifuwu/ui-dom — 前端路由 + 渲染运行时（v2 vdom 引擎，render-only）
 *
 * 渲染运行时 = vdom（第 2 代引擎，design/render-only-plan.md）：
 * - 渲染触发唯一原语 ctx.ui.render()（无 $ / dirty——无自动渲染）
 * - 共享状态：createStore + ctx.ui.useExternal
 * - 命令式挂载：mountCommand/unmountCommand（弹窗中间件在 components 各组件内部）
 *
 * 定稿架构（design/ui-architecture.md）：req = window.location，res = VNode，
 * uiServe = VDOM（落地）；handler = 异步组件；middleware = 两阶段 async。
 */

export { UIRouter } from './router.ts'
export type { UIRouterOptions, RouteMatch } from './router.ts'
export { h, jsx, jsxs, jsxDEV, Fragment, Portal, createPortal } from './vnode.ts'
export type { VNode, VNodeChild, VNodeType, Component } from './vnode.ts'
export { createClientBrowser } from './browser.ts'
export { animateOut } from './motion.ts'
export { api } from './middleware/api.ts'
export type { ApiClient, ApiOptions, ApiRequestOptions, ApiInjected } from './middleware/api.ts'
export { auth } from './middleware/auth.ts'
export type { AuthClient, AuthInjected } from './middleware/auth.ts'
export { ws } from './middleware/ws.ts'
export type { WsClient, WsInjected } from './middleware/ws.ts'
export type {
  UIRequest,
  UIResponse,
  UIHandler,
  UIMiddleware,
  UIRouteDef,
  WfuiContext,
} from './types.ts'

// ── v2 vdom 引擎（render-only）──
export { uiServe } from './vdom/serve.ts'
export type { UIServeOptions, UIServeHandle } from './vdom/serve.ts'
export { patchValue } from './vdom/diff.ts'
export { hydrateVNode } from './vdom/hydration.ts'
export { ssrPage, ssrToString, serializeData } from './vdom/ssr.ts'
export { buildVNode } from './vdom/build.ts'
export { renderValue } from './vdom/render.ts'
export { createRenderer, type Renderer } from './vdom/mount.ts'
export { createStore } from './store.ts'
export { createVdomContext, mountRoot } from './context.ts'
export type { ExternalStore } from './store.ts'
