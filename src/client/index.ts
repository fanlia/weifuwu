/**
 * weifuwu/client — VDOM 前端框架
 *
 * 概念：
 *   组件 = (props, ctx) => VNode
 *   状态 = JS 变量
 *   更新 = ctx.ui.render()
 *   挂载/卸载 = ref 回调
 *
 * 导出：
 *   h / jsx / jsxs / jsxDEV / Fragment  → JSX 工厂
 *   createApp                            → 应用引导
 *   router / RouteView                   → 路由
 *   api / auth / ws                      → 中间件
 *   extendCtx                            → ctx 扩展
 *   WfuiContext / AppMiddleware / RouteDef → 类型
 */

export { h, jsx, jsxs, jsxDEV, Fragment, Portal, createPortal } from './vnode.ts'
export type { VNode, VNodeType, Component } from './vnode.ts'

export { createApp } from './app.ts'

export { router, RouteView } from './router.ts'

export { ws } from './middleware/ws.ts'
export { api } from './middleware/api.ts'
export { auth } from './middleware/auth.ts'
export type { ApiClient, ApiOptions, ApiRequestOptions } from './middleware/api.ts'
export { ApiError } from './middleware/api.ts'
export type { AuthClient, AuthOptions } from './middleware/auth.ts'

export { extendCtx } from './types.ts'
export type { WfuiContext, AppMiddleware, RouteDef } from './types.ts'

export { ErrorBoundary } from './error-boundary.ts'
export type { ErrorBoundaryProps } from './error-boundary.ts'

export { i18n } from './i18n.ts'
export type { I18nOptions, I18nState } from './i18n.ts'

export { lockScroll, unlockScroll } from './scroll-lock.ts'
export { trapFocus } from './focus-trap.ts'

export { confirm } from './confirm.ts'
export type { ConfirmOptions, ConfirmState } from './confirm.ts'
export { zhCN } from './locale/zh_CN.ts'
export { enUS } from './locale/en_US.ts'
