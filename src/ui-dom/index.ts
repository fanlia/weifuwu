/**
 * weifuwu/ui-dom — 前端路由（UIRouter 纯路由 + uiServe 渲染运行时）
 *
 * 定稿架构（design/ui-architecture.md + ui-dom-client-align.md）：
 *   req = window.location，res = VNode，uiServe = VDOM（落地）
 *   handler = 异步组件：async (location, ctx) => vnode（$ 有效）
 *   middleware = 两阶段 async（layout 与 SSR 都是中间件）
 *
 * 渲染运行时复制自 client（registry/createUi/render/diff/popup-tracker 局部实例），
 * VNode 契约共享（components 直接复用）。
 */

export { UIRouter } from './router.ts'
export type { UIRouterOptions, RouteMatch } from './router.ts'
export { uiServe } from './serve.ts'
export type { UIServeOptions, UIServeHandle } from './serve.ts'
export { h, jsx, jsxs, jsxDEV, Fragment, Portal, createPortal, Placeholder, Suspense } from './vnode.ts'
export type { VNode, VNodeChild, VNodeType, Component } from './vnode.ts'
export { createReactiveState } from './reactive.ts'
export { createClientBrowser } from './browser.ts'
export { mountVNode } from './render.ts'
export { callRefCleanup } from './render.ts'
export { animateOut } from './motion.ts'
export { patchValue } from './diff.ts'
export { hydrateVNode } from './hydration.ts'
export type { AsyncComponent } from './vnode.ts'
export { api } from './middleware/api.ts'
export type { ApiClient, ApiOptions, ApiRequestOptions, ApiInjected } from './middleware/api.ts'
export { auth } from './middleware/auth.ts'
export type { AuthClient, AuthInjected } from './middleware/auth.ts'
export { ws } from './middleware/ws.ts'
export type { WsClient, WsInjected } from './middleware/ws.ts'
export { ssrPage, serializeData, ssrToString } from './ssr.ts'
export type {
  UIRequest,
  UIResponse,
  UIHandler,
  UIMiddleware,
  UIRouteDef,
  WfuiContext,
} from './types.ts'
