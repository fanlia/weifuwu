/**
 * weifuwu/ui-dom — 独立前端 UI（UIRouter + VDOM）
 *
 * 完全独立于 src/client（零 import 依赖）——不共享 idRegistry/ctx 状态。
 * 定稿架构（design/ui-architecture.md）：
 *   req = window.location，res = VNode，serveUI = VDOM（落地），params/query 在 ctx
 *   handler = 异步组件：async (location, ctx) => vnode（$ 有效）
 *   middleware = 两阶段 async（layout 与 SSR 都是中间件）
 */

export { UIRouter, serveUI } from './router.ts'
export type { UIRouterOptions } from './router.ts'
export { h, jsx, jsxs, jsxDEV } from './vnode.ts'
export type { VNode, VNodeChild, VNodeType } from './vnode.ts'
export { createReactiveState } from './reactive.ts'
export { Registry } from './registry.ts'
export { renderHtml } from './ssr.ts'
export type { ReactiveState } from './reactive.ts'
export type {
  UIRequest,
  UIResponse,
  UIHandler,
  UIMiddleware,
  UIContext,
  UIRouteDef,
} from './types.ts'
