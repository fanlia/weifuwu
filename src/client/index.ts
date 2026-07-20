/**
 * weifuwu/client — 响应式前端框架，TSX + Signal
 *
 * 零虚拟 DOM，零外部依赖。组件模型：(props, ctx) => Node。
 *
 * ```tsx
 * import { signal, createApp, api, auth, ws, router, RouteView, Show, For } from 'weifuwu/client'
 * import type { WfuiContext } from 'weifuwu/client'
 *
 * const app = createApp()
 * app.use(api())
 * app.use(auth())
 * app.use(ws())
 * app.use(router({ routes }))
 * app.mount('#root', AppShell)
 * ```
 *
 * ## 核心概念
 *
 * | 导出 | 类型 | 用途 |
 * |------|------|------|
 * | `signal()` | function | 响应式数据容器 |
 * | `computed()` | function | 衍生信号 |
 * | `effect()` | function | 自动追踪依赖的副作用 |
 * | `batch()` | function | 批量更新（合并多次写入为一次通知）|
 * | `untrack()` | function | 不追踪依赖地读取信号 |
 * | `isSignal()` | function | 判断值是否为 Signal 实例 |
 * | `onMount()` | function | 组件挂载回调 |
 * | `onCleanup()` | function | 组件卸载回调 |
 * | `createApp()` | function | 应用实例（中间件链 + 挂载） |
 * | `createResource()` | function | 异步数据资源（loading/error/data）|
 * | `useForm()` | function | 表单状态管理（字段绑定/验证/提交）|
 * | `ErrorBoundary()` | component | 错误捕获边界 |
 * | `createPortal()` | function | 渲染到指定 DOM 位置 |
 * | `wrap()` | function | 封装三方库为组件 |
 * | `domMount()` | function | 低层 DOM 挂载 |
 * | `createContext()` | function | 类型安全 provide/inject |
 * | `extendCtx()` | function | 扩展上下文 |
 * | `api()` | middleware | HTTP 客户端中间件 |
 * | `auth()` | middleware | 认证状态管理中间件 |
 */

// ── 信号系统 ───────────────────────────────────────────────

/** 创建响应式数据容器。变化时自动通知依赖方。 */
export { signal } from './signal.ts'
/** 基于其他 signal 的衍生值，自动缓存。 */
export { computed } from './signal.ts'
/** 自动追踪 signal 依赖，变化时重跑回调。返回 dispose 函数。 */
export { effect } from './signal.ts'
/**
 * 批量更新 — 将多个信号写入合并为一次通知。
 *
 * ```ts
 * batch(() => {
 *   a.value = 1
 *   b.value = 2
 * })
 * // 只触发一次 effect，而非两次
 * ```
 */
export { batch } from './signal.ts'
/** Signal 类型。 */
export type { Signal } from './signal.ts'
/** 不追踪依赖地读取信号值。 */
export { untrack } from './signal.ts'
/** 判断值是否为 Signal 实例。 */
export { isSignal } from './signal.ts'

// ── JSX Runtime ────────────────────────────────────────────

/** JSX 工厂函数 — 由 esbuild / tsc 自动调用。 */
export { jsx, jsxs, jsxDEV } from './jsx-runtime.ts'
/** 不产生包装元素的片段组件。 */
export { Fragment } from './jsx-runtime.ts'
/**
 * 条件渲染 — when 为 Signal 时响应式切换。
 *
 * ```tsx
 * <Show when={isLoggedIn} fallback={<LoginPage />}>
 *   <Dashboard />
 * </Show>
 * ```
 */
export { Show } from './jsx-runtime.ts'
/**
 * 列表渲染 — each 为 Signal 时响应式更新。支持 keyBy 属性复用 DOM 节点。
 *
 * ```tsx
 * <For each={items} keyBy="id">
 *   {(item) => <div>{item.name}</div>}
 * </For>
 * ```
 */
export { For } from './jsx-runtime.ts'

/**
 * onMount — 组件根元素挂载到 DOM 后执行的回调。
 * 返回函数在组件卸载时自动清理。
 *
 * ```tsx
 * function Chart() {
 *   onMount(() => {
 *     const chart = echarts.init(el)
 *     return () => chart.dispose()
 *   })
 *   return <div ref={el => chartEl = el} />
 * }
 * ```
 */
export { onMount } from './jsx-runtime.ts'
/**
 * onCleanup — 组件卸载时执行的回调（清理定时器、订阅等）。
 *
 * ```tsx
 * function Timer() {
 *   const id = setInterval(tick, 1000)
 *   onCleanup(() => clearInterval(id))
 *   return <div>...</div>
 * }
 * ```
 */
export { onCleanup } from './jsx-runtime.ts'
/** 组件类型签名：(props, ctx) => Node */
export type { Component } from './jsx-runtime.ts'
/**
 * 捕获子组件渲染时的异常并显示 fallback。
 *
 * ```tsx
 * <ErrorBoundary fallback={(e) => <p>出错了: {e.message}</p>}>
 *   {() => <Dashboard />}
 * </ErrorBoundary>
 * ```
 */
export { ErrorBoundary } from './jsx-runtime.ts'
/**
 * Portal — 将组件渲染到父容器之外的 DOM 位置。
 *
 * ```tsx
 * <Show when={show}>
 *   {createPortal(<div class="modal">...</div>, document.body)}
 * </Show>
 * ```
 */
export { createPortal } from './jsx-runtime.ts'
/**
 * wrap — 封装第三方库为组件，自动管理 mount/unmount 生命周期。
 */
export { wrap } from './jsx-runtime.ts'
/** 低层挂载函数，一般用 createApp().mount() */
export { domMount } from './jsx-runtime.ts'

// ── 类型 ────────────────────────────────────────────────────

/** 应用上下文 — 组件通过第二个参数 ctx 访问。 */
export type { WfuiContext } from './types.ts'
/** 中间件签名：(ctx) => ctx */
export type { AppMiddleware } from './types.ts'
/** 路由定义：path / component / auth / title / loader */
export type { RouteDef } from './types.ts'
/**
 * 类型安全的上下文工厂 — 创建 provide/inject 对。
 *
 * ```ts
 * const ThemeCtx = createContext<string>('theme')
 * ThemeCtx.provide(ctx, 'dark')
 * const theme = ThemeCtx.inject(ctx)
 * ```
 */
export { createContext, extendCtx } from './types.ts'


// ── 应用 ────────────────────────────────────────────────────

/**
 * 创建 weifuwu/client 应用实例。
 *
 * ```tsx
 * const app = createApp()
 * app.use(api())
 * app.use(auth())
 * app.use(router({ routes }))
 * await app.mount('#root', AppShell)
 * ```
 */
export { createApp } from './app.ts'

// ── 路由 ────────────────────────────────────────────────────

/**
 * 路由中间件 — 注入 ctx.route / ctx.app.navigate。
 * 支持 hash / history 模式，loader 数据预取，auth 守卫，嵌套布局。
 */
export { router } from './router.ts'
/**
 * RouteView 组件 — 渲染当前路由匹配的组件。
 * 用 `<RouteView />` 放在布局中作为路由出口。
 */
export { RouteView } from './router.ts'
/**
 * Outlet — 嵌套路由出口。
 * 在 layout 组件中使用，渲染当前路由的子路由组件。
 *
 * ```tsx
 * function DashboardLayout(_props: {}, ctx: WfuiContext) {
 *   return (
 *     <div class="flex">
 *       <Sidebar />
 *       <main><Outlet /></main>
 *     </div>
 *   )
 * }
 * ```
 */
export { Outlet } from './router.ts'

// ── 懒加载 ──────────────────────────────────────────────────

/**
 * lazy — 组件懒加载（代码分割）。
 * 配合 esbuild code splitting 使用。
 *
 * ```tsx
 * const AdminPage = lazy(() => import('./pages/AdminPage'))
 * const routes = [{ path: '/admin', component: AdminPage }]
 * ```
 */
export { lazy } from './lazy.ts'
export type { LazyComponentOptions, LazyStatus } from './lazy.ts'

// ── 中间件 ──────────────────────────────────────────────────

/**
 * WebSocket 中间件 — 注入 ctx.ws（send / onMessage / join / leave）。
 * 自动重连，支持房间。
 */
export { ws } from './middleware/ws.ts'

/**
 * API 客户端中间件 — 注入 ctx.api（get/post/put/patch/delete）。
 * 支持 baseURL、请求/响应拦截器。
 *
 * ```ts
 * app.use(api({ baseURL: '/api' }))
 * // 组件中：ctx.api.get<User[]>('/users')
 * ```
 */
export { api } from './middleware/api.ts'
export type { ApiClient, ApiOptions, ApiRequestOptions } from './middleware/api.ts'
export { ApiError } from './middleware/api.ts'

/**
 * 认证状态管理中间件 — 注入 ctx.auth（token/user/login/logout）。
 *
 * ```ts
 * app.use(auth())
 * // 组件中：ctx.auth.token, ctx.auth.isLoggedIn, ctx.auth.login()
 * ```
 */
export { auth } from './middleware/auth.ts'
export type { AuthClient, AuthUser, AuthOptions } from './middleware/auth.ts'

// ── 工具 ────────────────────────────────────────────────────

/**
 * 异步数据资源 — 自动管理 loading/error/data 信号。
 *
 * ```ts
 * const [data, { loading, error, refetch }] = createResource(() => fetch('/api/users'))
 * ```
 */
export { createResource } from './resource.ts'
export type { ResourceOptions, ResourceReturn } from './resource.ts'

/**
 * 表单状态管理 — 字段绑定、验证、提交、重置。
 *
 * ```ts
 * const form = useForm({ initial: { name: '' }, validate: {...}, onSubmit: async (v) => {...} })
 * // <input {...form.field('name')} />
 * ```
 */
export { useForm } from './form.ts'
export type { FormOptions, FormReturn, FormFieldBindings, FormValidators } from './form.ts'

