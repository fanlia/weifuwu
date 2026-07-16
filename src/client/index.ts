/**
 * weifuwu/client — 响应式前端框架，TSX + Signal
 *
 * ```tsx
 * import { signal, createdApp, api, auth, ws, router, RouteView, Show, For } from 'weifuwu/client'
 * import type { WfuiContext } from 'weifuwu/client'
 *
 * const app = createApp()
 * app.use(api())
 * app.use(auth())
 * app.use(ws())
 * app.use(router({ routes }))
 * app.mount('#root', AppShell)
 * ```
 */

export { signal, computed, effect, isSignal } from './signal.ts'
export type { Signal } from './signal.ts'
export { jsx, jsxs, jsxDEV, Fragment, Show, For, domMount, wrap, createPortal, ErrorBoundary } from './jsx-runtime.ts'
export type { Component } from './jsx-runtime.ts'
export type { WfuiContext, AppMiddleware, RouteDef } from './types.ts'
export { createApp } from './app.ts'
export { router, RouteView } from './router.ts'
export { api, ApiClient, ApiError } from './middleware/api.ts'
export { auth } from './middleware/auth.ts'
export type { UserRecord } from './middleware/auth.ts'
export { ws } from './middleware/ws.ts'

// ── 工具 ──
export { useForm } from './lib/form.ts'

// ── 预置组件 ──
export { LoginForm } from './components/LoginForm.ts'
export { Chat } from './components/Chat.ts'
