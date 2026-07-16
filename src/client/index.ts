/**
 * weifuwu/client — 响应式前端框架，TSX + Signal
 *
 * ```tsx
 * import { signal, computed, Show, For, createApp, router, RouteView } from 'weifuwu/client'
 * import type { WfuiContext } from 'weifuwu/client'
 *
 * const app = createApp()
 * app.use(router({ routes: [
 *   { path: '/', component: HomePage },
 * ]}))
 * app.mount('#root', AppShell)
 * ```
 */

export { signal, computed, effect, isSignal } from './signal.ts'
export type { Signal } from './signal.ts'
export { jsx, jsxs, jsxDEV, Fragment, Show, For, domMount } from './jsx-runtime.ts'
export type { Component } from './jsx-runtime.ts'
export type { WfuiContext, AppMiddleware, RouteDef } from './types.ts'
export { createApp } from './app.ts'
export { router, RouteView } from './router.ts'
