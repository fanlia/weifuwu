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
 * | `onMount()` | function | 组件挂载回调 |
 * | `onCleanup()` | function | 组件卸载回调 |
 * | `createApp()` | function | 应用实例（中间件链 + 挂载） |
 */

// ── 信号系统 ───────────────────────────────────────────────

/** 创建响应式数据容器。变化时自动通知依赖方。 */
export { signal } from './signal.ts'
/** 基于其他 signal 的衍生值，自动缓存。 */
export { computed } from './signal.ts'
/** 自动追踪 signal 依赖，变化时重跑回调。返回 dispose 函数。 */
export { effect } from './signal.ts'
/** 检查一个值是否为 Signal 实例。 */
export { isSignal } from './signal.ts'
/** Signal 类型。 */
export type { Signal } from './signal.ts'

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
/** 直接挂载 DOM（低层 API，一般用 createApp().mount()）。 */
export { domMount } from './jsx-runtime.ts'
/**
 * 包装第三方库为组件 — 自动管理挂载/卸载生命周期。
 *
 * ```tsx
 * const PieChart = wrap('div', (el, props, ctx) => {
 *   const chart = echarts.init(el)
 *   return () => chart.dispose()
 * })
 * ```
 */
export { wrap } from './jsx-runtime.ts'
/**
 * Portal — 将节点渲染到目标 DOM 位置（Modal、Dropdown、Tooltip）。
 *
 * ```tsx
 * <Show when={showModal}>
 *   {createPortal(<div class="fixed inset-0 ...">...</div>, document.body)}
 * </Show>
 * ```
 */
export { createPortal } from './jsx-runtime.ts'
/**
 * ErrorBoundary — 捕获子组件渲染时的异常。children 必须是 thunk。
 *
 * ```tsx
 * <ErrorBoundary fallback={(e) => <p>出错: {e.message}</p>}>
 *   {() => <Dashboard />}
 * </ErrorBoundary>
 * ```
 */
export { ErrorBoundary } from './jsx-runtime.ts'
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

// ── 类型 ────────────────────────────────────────────────────

/** 应用上下文 — 组件通过第二个参数 ctx 访问。 */
export type { WfuiContext } from './types.ts'
/** 中间件签名：(ctx) => ctx */
export type { AppMiddleware } from './types.ts'
/** 路由定义：path / component / auth / title / loader */
export type { RouteDef } from './types.ts'
/**
 * 类型安全的上下文工厂 — 相比 ctx.provide('key', value) 的字符串 key 方式，
 * createContext 返回类型化的 provide/inject，拼写错误编译时即被捕获。
 *
 * ```tsx
 * const ThemeCtx = createContext<string>('theme')
 * ThemeCtx.provide(ctx, 'dark')
 * const theme = ThemeCtx.inject(ctx)  // string | null
 * ```
 */
export { createContext } from './types.ts'

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
 * 支持 hash / history 模式，loader 数据预取，auth 守卫。
 */
export { router } from './router.ts'
/**
 * RouteView 组件 — 渲染当前路由匹配的组件。
 * 用 `<RouteView />` 放在布局中作为路由出口。
 */
export { RouteView } from './router.ts'

// ── 中间件 ──────────────────────────────────────────────────

/** HTTP 客户端中间件 — 注入 ctx.api（get / post / put / patch / delete）。 */
export { api } from './middleware/api.ts'
/** ApiClient 类 — 独立于 ctx 的 HTTP 客户端。 */
export { ApiClient } from './middleware/api.ts'
/** ApiError — API 请求失败时抛出的错误，包含 status 字段。 */
export { ApiError } from './middleware/api.ts'
/**
 * 身份认证中间件 — 注入 ctx.user / ctx.login / ctx.logout / ctx.register。
 * 自动管理 localStorage 持久化和 token 验证。
 */
export { auth } from './middleware/auth.ts'
/** 用户记录类型 */
export type { UserRecord } from './middleware/auth.ts'
/**
 * WebSocket 中间件 — 注入 ctx.ws（send / onMessage / join / leave）。
 * 自动重连，支持房间。
 */
export { ws } from './middleware/ws.ts'

// ── 工具 ────────────────────────────────────────────────────

/**
 * 表单状态管理 — 绑定字段信号、验证、提交。
 *
 * ```tsx
 * const form = useForm({
 *   initial: { email: '', password: '' },
 *   validate: { email: (v) => !v.includes('@') && '邮箱格式错误' },
 * })
 * <input {...form.field('email')} placeholder="邮箱" />
 * <button onClick={() => form.submit(data => ctx.login(data))}>登录</button>
 * ```
 */
export { useForm } from './lib/form.ts'

/**
 * 组件级作用域 CSS — 从 CSS-in-JS 对象生成唯一类名，样式自动注入 <head>。
 *
 * ```tsx
 * const s = createStyles({
 *   card: 'background: white; border-radius: 8px;',
 *   title: 'font-size: 18px; color: #333;',
 * })
 * // <div class={s.card}><h2 class={s.title}>...</h2></div>
 * ```
 */
export { createStyles } from './lib/css.ts'

// ── 预置组件 ───────────────────────────────────────────────

/** 登录/注册表单组件。自动切换登录/注册模式。 */
export { LoginForm } from './components/LoginForm.tsx'
/** 实时消息聊天组件。对接后端 messager + agent 模块。 */
export { Chat } from './components/Chat.tsx'
/**
 * 客户端路由导航 Link 组件。
 * 替代原生 <a>，拦截点击走 SPA 路由，支持右键新标签页。
 *
 * ```tsx
 * <Link to="/about">关于</Link>
 * ```
 */
export { Link } from './components/Link.tsx'
