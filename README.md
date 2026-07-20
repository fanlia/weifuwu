# weifuwu

**全栈框架 — 后端 `(req, ctx) => Response` + 前端 `(props, ctx) => JSX`**

```bash
npm install weifuwu
```

一个包，无上游依赖。后端提供 HTTP 路由、数据库、中间件；前端提供信号驱动的无 VDOM 响应式框架。

---

## 模块总览

| 模块 | 导出 | 用途 | 依赖 |
|------|------|------|------|
| **Router** | `Router` | HTTP 路由 + 中间件链 + WebSocket + GraphQL | — |
| **serve** | `serve` | HTTP 服务器 | `Router` |
| **cors** | `cors` | CORS 跨域中间件 | `Router` |
| **serveStatic** | `serveStatic` | 静态文件服务 | `Router` |
| **postgres** | `postgres` | PostgreSQL 客户端 → `ctx.sql` | `Router` |
| **redis** | `redis` | Redis 客户端 → `ctx.redis` | `Router` |
| **ui** | `ui` | SSR 渲染 + 动态 JS 编译 → `ctx.ui.html/css/js` | `Router` |
| **graphql** | `router.graphql()` | GraphQL 端点 | `Router` |
| **client** | 28 个导出 | 前端响应式框架（见下方表格） | — |

**前端 `weifuwu/client` 模块总览：**

| 类别 | 导出 | 用途 |
|------|------|------|
| **信号系统** | `signal`, `computed`, `effect`, `batch`, `untrack`, `isSignal` | 响应式状态 |
| **JSX 运行时** | `jsx`/`jsxs`/`jsxDEV`, `Fragment` | TSX 编译目标 |
| **控制流** | `Show`, `For` | 条件/列表渲染 |
| **生命周期** | `onMount`, `onCleanup` | 组件挂载/卸载 |
| **应用** | `createApp` | 中间件链 + 挂载 |
| **路由** | `router`, `RouteView`, `lazy` | 嵌套布局 + 代码分割 + 滚动恢复 |
| **中间件** | `ws`, `api`, `auth` | WebSocket / HTTP 客户端 / 认证状态 |
| **工具** | `createResource`, `useForm`, `ErrorBoundary`, `createPortal`, `wrap`, `createContext`, `extendCtx`, `domMount` | 异步数据 / 表单 / 错误边界 / Portal |
| **类型 (19)** | `Signal`, `Component`, `WfuiContext`, `AppMiddleware`, `RouteDef`, `ApiClient`, `AuthClient`, `ResourceState`, `FormReturn`, 等 | — |

---

## 核心理念：`ctx`

前后端共享同一模式：**中间件向 `ctx` 注入字段，handler/组件从 `ctx` 读取。**

```
后端:                               前端:
  Request → Middleware → Handler     createApp() → Middleware → Component
             │                                    │
             ▼                                    ▼
         ctx.sql                              ctx.ws
         ctx.redis                            ctx.route
         ctx.ui                               ctx.api / ctx.auth
```

---

## 快速开始 — 全栈应用

```ts
// server.ts — 同一个 npm 包
import { serve, Router, cors, ui } from 'weifuwu'

const app = new Router()
app.use(cors())
app.use(ui())

// REST API
app.get('/api/posts', async (req, ctx) => {
  const posts = [{ id: 1, title: 'Hello' }]
  return Response.json(posts)
})

// WebSocket
app.ws('/ws', {
  open(ws) { ws.send(JSON.stringify({ type: 'system', body: 'connected' })) },
  message(ws, ctx, data) {
    const msg = JSON.parse(data.toString())
    ws.send(JSON.stringify({ type: 'echo', body: msg.body }))
  },
})

// SPA 入口 — 动态编译前端（零构建步骤）
app.get('/', async (req, ctx) => ctx.ui.html`
  <!DOCTYPE html>
  <html><body><div id="root"></div>
  <script src="/static/app.js"></script></body></html>
`)
app.get('/static/app.js', async (req, ctx) => ctx.ui.js('./src/main.tsx'))

serve(app, { port: 3000 })
```

```tsx
// src/main.tsx — 前端
import {
  signal, computed, Show, For, ErrorBoundary, createPortal, wrap,
  createApp, router, RouteView, lazy,
  ws, api, auth, useForm, createResource,
} from 'weifuwu/client'
import type { WfuiContext, RouteDef } from 'weifuwu/client'

const app = createApp()
app.use(api({ baseURL: '' }))
app.use(auth())
app.use(ws())
app.use(router({
  routes: [
    { path: '/', component: Home },
    {
      path: '/dashboard',
      layout: DashboardLayout,
      children: [
        { path: '/overview', component: lazy(() => import('./Overview')) },
        { path: '/settings', component: lazy(() => import('./Settings')) },
      ],
    },
  ],
  mode: 'hash',
  scrollRestoration: true,
}))
app.mount('#root', AppShell)

function AppShell(_props: {}, ctx: WfuiContext) {
  return (
    <div>
      <nav>{/* ... */}</nav>
      <main><RouteView /></main>
    </div>
  )
}
```

---

## 后端

### Router

```ts
const app = new Router()

// HTTP 方法
app.get(path, ...handlers)
app.post / put / delete / patch / head / options(path, ...handlers)
app.all(path, ...handlers)

// WebSocket / GraphQL
app.ws(path, handler)
app.graphql('/graphql', handler)

// 中间件
app.use(middleware)
app.mount(prefix, subRouter)
app.onError(handler)

// 调试
app.routes()  // 列出所有路由
```

| 方法 | 参数 | 说明 |
|------|------|------|
| `get/post/put/delete/patch/head/options` | `(path, ...handlers)` | 注册 HTTP 路由 |
| `all` | `(path, ...handlers)` | 匹配所有方法 |
| `ws` | `(path, handler)` | WebSocket 端点 |
| `graphql` | `('/path', handler)` | GraphQL 端点 |
| `use` | `(middleware)` | 全局中间件 |
| `mount` | `(prefix, subRouter)` | 子路由挂载 |
| `onError` | `(handler)` | 全局错误处理 |
| `routes` | `()` | 返回路由列表数组 |

### serve — HTTP 服务器

```ts
const srv = serve(app, { port: 3000 })
await srv.stop()   // 程序化停止
// Ctrl+C / SIGTERM — 自动关闭所有连接后退出
```

| 选项 | 默认 | 说明 |
|------|------|------|
| `port` | `0` | 监听端口 |
| `hostname` | `'0.0.0.0'` | 监听地址 |
| `maxBodySize` | `10MB` | 请求体上限 |
| `timeout` | `30000` | Socket 超时 (ms) |
| `shutdown` | `true` | 是否注册 SIGTERM/SIGINT 处理 |

### cors — CORS 中间件

```ts
app.use(cors({
  origin: ['https://example.com'],
  credentials: true,
}))
```

### serveStatic — 静态文件

```ts
app.use(serveStatic('./public', { prefix: '/assets' }))
```

| 选项 | 默认 | 说明 |
|------|------|------|
| `prefix` | `''` | URL 前缀 |
| `index` | `'index.html'` | 默认首页 |

### postgres — PostgreSQL

```ts
app.use(postgres())
// → ctx.sql`SELECT * FROM users`

app.use(postgres({ url: 'postgres://user:pass@host:5432/db' }))
// 默认读取 DATABASE_URL 环境变量
```

| 选项 | 默认 | 说明 |
|------|------|------|
| `url` | `DATABASE_URL` | 连接字符串 |
| `migrations` | `'./migrations'` | 迁移文件目录 |

依赖：需要 `postgres` npm 包。实现 `close(): Promise<void>`。

### redis — Redis

```ts
app.use(redis())
// → ctx.redis.get('key')
// → ctx.redis.set('key', 'value')
// 默认读取 REDIS_URL 环境变量
```

依赖：需要 `ioredis` npm 包。实现 `close(): Promise<void>`。

### ui — SSR + SPA 渲染

```ts
app.use(ui())

// SSR 页面
app.get('/blog/:slug', async (req, ctx) => ctx.ui.html`
  <!DOCTYPE html>
  <html><body><h1>${post.title}</h1></body></html>
`)

// 动态 JS 编译（esbuild，零构建步骤）
app.get('/app.js', async (req, ctx) => ctx.ui.js('./src/main.tsx'))

// CSS 编译（PostCSS + Tailwind）
app.get('/style.css', async (req, ctx) => ctx.ui.css('./src/style.css'))
```

| 方法 | 用途 |
|------|------|
| `ctx.ui.html\`...\`` | 渲染 HTML 模板（转义变量防 XSS） |
| `ctx.ui.html.unsafe(str)` | 插入原始 HTML |
| `ctx.ui.js(entryPath)` | 动态编译 TSX → JS bundle |
| `ctx.ui.css(entryPath)` | 编译 CSS (PostCSS + Tailwind) |

### graphql — GraphQL

```ts
app.graphql(async (req, ctx) => ({
  schema: `type Query { hello: String }`,
  resolvers: { Query: { hello: () => 'world' } },
  graphiql: true,
}))
```

### WebSocket

```ts
app.ws('/ws', {
  open(ws, ctx) { ws.send('connected') },
  message(ws, ctx, data) { /* data: string | Buffer */ },
  close(ws, ctx) { /* cleanup */ },
  error(ws, ctx, err) { /* log */ },
})
```

### 错误处理

```ts
app.onError((err, req, ctx) => {
  if (err instanceof HttpError) {
    return new Response(err.message, { status: err.status })
  }
  console.error(err)
  return new Response('Internal Server Error', { status: 500 })
})
```

| 类/常量 | 说明 |
|---------|------|
| `HttpError` | HTTP 错误 `new HttpError(msg, status)` |
| `DEFAULT_MAX_BODY` | 默认请求体上限 10MB |
| `MIGRATIONS_TABLE` | Postgres 迁移表名 |

### 后端类型

`Context`, `Handler`, `Middleware`, `ErrorHandler`, `WebSocket`, `WebSocketHandler`, `ServeOptions`, `Server`, `CORSOptions`, `ServeStaticOptions`, `PostgresOptions`, `PostgresClient`, `PostgresInjected`, `RedisOptions`, `RedisClient`, `RedisInjected`, `GraphQLOptions`, `GraphQLHandler`

---

## 前端 (`weifuwu/client`)

**2750 行源码，28 个运行时导出 + 19 个类型，零外部依赖。**

构建配置（esbuild）：
```js
esbuild.build({
  jsx: 'automatic',
  jsxImportSource: 'weifuwu/client',
  bundle: true,
})
```

### 信号系统

```tsx
const count = signal(0)                    // 创建
const doubled = computed(() => count.value * 2)  // 衍生
effect(() => console.log('count:', count.value))  // 副作用
batch(() => { a.value = 1; b.value = 2 })         // 批量更新
untrack(() => theme.value)                // 不追踪依赖
isSignal(value)                           // 类型判断
```

| 函数 | 签名 | 说明 |
|------|------|------|
| `signal` | `<T>(initial: T) => Signal<T>` | 响应式数据容器 |
| `computed` | `<T>(fn: () => T) => Signal<T>` | 衍生值，自动缓存 |
| `effect` | `(fn: () => void) => dispose()` | 自动追踪依赖，变化时重跑 |
| `batch` | `(fn: () => void) => void` | 合并多次写入为一次通知 |
| `untrack` | `<T>(fn: () => T) => T` | 读取信号但不追踪依赖 |
| `isSignal` | `(value: unknown) => value is Signal` | 判断是否为 Signal |

### JSX 运行时

```tsx
// 自动由 esbuild 调用（无需手动导入）
<div class="foo">hello</div>
<Fragment>...</Fragment>
```

| 导出 | 说明 |
|------|------|
| `jsx` / `jsxs` / `jsxDEV` | JSX 编译目标 |
| `Fragment` | `<></>` 片段组件 |

**Signal 属性自动绑定：** `<input value={signalVal} />` — 信号变化时只更新对应 DOM 属性。

### 控制流

```tsx
<Show when={isLoggedIn} fallback={<Login />}>
  <Dashboard />
</Show>

<For each={items} keyBy="id">
  {(item) => <div>{item.name}</div>}
</For>
```

| 组件 | 属性 | 说明 |
|------|------|------|
| `Show` | `when: boolean \| Signal<boolean>`, `fallback?`, `children?` | 条件渲染，Signal 响应式切换 |
| `For` | `each: T[] \| Signal<T[]>`, `children: (item, index) => Node`, `keyBy?` | 列表渲染，支持 keyed 复用 |

### 生命周期

```tsx
onMount(() => {
  init()
  return () => cleanup()  // 自动清理
})
onCleanup(() => clearInterval(id))
```

| 函数 | 说明 |
|------|------|
| `onMount(fn)` | 组件挂载后执行，返回函数在卸载时自动清理 |
| `onCleanup(fn)` | 组件卸载时执行 |

### 应用

```tsx
const app = createApp()
app.use(middleware1)
app.use(middleware2)
await app.mount('#root', AppShell)
```

| 方法 | 说明 |
|------|------|
| `use(mw)` | 注册中间件，返回 `this` 支持链式 |
| `mount(selector, RootComponent)` | 挂载到 DOM |
| `hydrate(selector, Component, props?)` | 在 SSR 内容上附加组件 |
| `ctx` | 当前上下文 |

### 路由

```tsx
// 路由定义
const routes: RouteDef[] = [
  { path: '/', component: HomePage },
  {
    path: '/dashboard',
    layout: DashboardLayout,    // 嵌套布局
    children: [
      { path: '/overview', component: Overview },  // 子路由
      { path: '/settings', component: Settings },
    ],
  },
  { path: '/user/:id', component: UserPage, title: '用户' },
]

// 注册路由中间件
app.use(router({
  routes,
  notFound: NotFound,
  mode: 'hash',                // 'hash' | 'history'
  scrollRestoration: true,
}))

// 路由出口 — 根层级和嵌套层级用同一个组件
function AppShell() {
  return <main><RouteView /></main>   // 根出口
}
function DashboardLayout() {
  return (
    <div class="flex">
      <Sidebar />
      <main><RouteView /></main>      // 嵌套出口（同一组件）
    </div>
  )
}
```

| RouteDef 字段 | 类型 | 说明 |
|---------------|------|------|
| `path` | `string` | 路由路径，支持 `/:param` |
| `component` | `Component` | 路由组件 |
| `layout` | `Component` | 嵌套布局（渲染 `<RouteView />` 显示子路由）|
| `children` | `RouteDef[]` | 子路由（与 layout 配合使用）|
| `auth` | `boolean` | 是否需要登录 |
| `title` | `string` | 页面标题（自动设置 `document.title`）|
| `loader` | `(ctx) => Promise<data>` | 数据预取 → `ctx.route.data` |
| `transition` | `string` | 页面切换过渡动画 CSS class 前缀 |

| RouterOptions | 默认 | 说明 |
|---------------|------|------|
| `mode` | `'hash'` | 路由模式 |
| `notFound` | — | 404 组件 |
| `scrollRestoration` | `true` | 历史模式时恢复滚动位置 |
| `transition` | — | 全局过渡动画 |

**`ctx.route` 注入：**

```tsx
ctx.route.path       // '/user/42'
ctx.route.params     // { id: '42' }
ctx.route.query      // { tab: 'profile' }
ctx.route.component  // 当前路由组件
ctx.route.data       // loader 返回的数据
ctx.route.loading    // loader 是否加载中
ctx.app.navigate('/path')
```

### 代码分割

```tsx
const AdminPage = lazy(() => import('./pages/AdminPage'), {
  fallback: () => <div>加载中...</div>,
})

const routes = [
  { path: '/admin', component: AdminPage },
]
```

需 esbuild `splitting: true` + `outdir`。

### 中间件

#### ws — WebSocket 客户端

```tsx
app.use(ws({ url: '/ws' }))

// 组件中：
onMount(() => {
  const unsub = ctx.ws.onMessage((data) => { ... })
  onCleanup(() => unsub())
})
ctx.ws.send({ type: 'chat', body: 'hello' })
<Show when={ctx.ws.isConnected}>🟢 已连接</Show>
```

| `ctx.ws` | 类型 | 说明 |
|----------|------|------|
| `send` | `(data: unknown) => void` | 发送消息 |
| `onMessage` | `(handler) => dispose()` | 注册消息监听 |
| `isConnected` | `Signal<boolean>` | 连接状态信号 |

| 选项 | 默认 | 说明 |
|------|------|------|
| `url` | `'/ws'` | WebSocket 地址 |
| `reconnectInterval` | `3000` | 重连间隔 (ms) |
| `maxReconnect` | `10` | 最大重连次数 |

#### api — HTTP 客户端

```tsx
app.use(api({ baseURL: '/api' }))

// 组件中：
await ctx.api.get<User[]>('/users')
await ctx.api.post<User>('/users', body)
await ctx.api.put<User>('/users/1', body)
await ctx.api.patch<User>('/users/1', body)
await ctx.api.delete('/users/1')
```

| `ctx.api` | 签名 | 说明 |
|-----------|------|------|
| `get` | `<T>(url, opts?) => Promise<T>` | GET 请求 |
| `post` | `<T>(url, body?, opts?) => Promise<T>` | POST 请求 |
| `put` | `<T>(url, body?, opts?) => Promise<T>` | PUT 请求 |
| `patch` | `<T>(url, body?, opts?) => Promise<T>` | PATCH 请求 |
| `delete` | `<T>(url, opts?) => Promise<T>` | DELETE 请求 |

| 选项 | 说明 |
|------|------|
| `baseURL` | API 基础路径 |
| `headers` | 默认请求头 |
| `onRequest` | 请求拦截器 `({url, init}) => {url, init}` |
| `onResponse` | 响应拦截器 `(res) => Promise<T>` |

错误类型：`ApiError` — 包含 `status` 和 `body`。

#### auth — 认证状态管理

```tsx
app.use(auth())

// 组件中：
<Show when={ctx.auth.isLoggedIn} fallback={<Login />}>
  <span>{ctx.auth.user.value?.name}</span>
  <button onClick={() => ctx.auth.logout()}>退出</button>
</Show>

// 登录
ctx.auth.login('jwt-token', { id: 1, name: 'Alice' })
// 退出
ctx.auth.logout()
```

| `ctx.auth` | 类型 | 说明 |
|-----------|------|------|
| `token` | `Signal<string \| null>` | 当前 token |
| `user` | `Signal<AuthUser \| null>` | 当前用户 |
| `isLoggedIn` | `Signal<boolean>` | 是否已登录（computed）|
| `login` | `(token, user) => void` | 存储 token + 用户到 localStorage |
| `logout` | `() => void` | 清除 token + 用户 |
| `setUser` | `(user) => void` | 更新用户信息 |
| `authorizationHeader` | `Signal<string \| null>` | `'Bearer xxx'` 或 `null` |

| 选项 | 默认 | 说明 |
|------|------|------|
| `storage` | `localStorage` | 存储方式 |
| `tokenKey` | `'weifuwu_token'` | token 存储 key |
| `userKey` | `'weifuwu_user'` | 用户信息存储 key |

### 工具

#### useForm — 表单管理

```tsx
const form = useForm({
  initial: { name: '', email: '' },
  validate: {
    name: (v) => !v ? '请输入姓名' : null,
    email: [
      (v) => !v ? '请输入邮箱' : null,
      (v) => !v.includes('@') ? '邮箱格式错误' : null,
    ],
  },
  onSubmit: async (values) => {
    await ctx.api.post('/users', values)
  },
})

// JSX：
<form onSubmit={form.handleSubmit}>
  <input {...form.field('name')} />
  <span>{form.errors.value.name}</span>
  <button disabled={form.submitting}>提交</button>
</form>
```

| 返回值 | 类型 | 说明 |
|--------|------|------|
| `values` | `Signal<T>` | 表单值 |
| `errors` | `Signal<Partial<Record<keyof T, string\|null>>>` | 验证错误 |
| `submitting` | `Signal<boolean>` | 提交状态 |
| `touched` | `Signal<Partial<Record<keyof T, boolean>>>` | 触碰字段 |
| `handleSubmit` | `(e: Event) => void` | 提交处理（绑定到 `<form>`）|
| `field` | `(name) => { value, onInput, error }` | 字段绑定对象 |
| `setValue` | `(name, value) => void` | 设字段值 |
| `reset` | `() => void` | 重置表单 |
| `validateAll` | `() => boolean` | 触发全部验证 |

#### createResource — 异步数据

```tsx
const [data, { loading, error, refetch }] = createResource(
  () => fetch('/api/posts').then(r => r.json()),
  { initialValue: [] }
)

// JSX：
<Show when={loading}><p>加载中...</p></Show>
<Show when={error}><p>错误: {error.value?.message}</p></Show>
<Show when={computed(() => !loading.value && !error.value)}>
  <For each={data}>{(item) => <div>{item.title}</div>}</For>
</Show>
```

| 返回值 | 类型 | 说明 |
|--------|------|------|
| `data` (元组第一项) | `Signal<T \| undefined>` | 数据信号 |
| `loading` | `Signal<boolean>` | 加载状态 |
| `error` | `Signal<Error \| undefined>` | 错误信号 |
| `refetch` | `() => void` | 手动重新加载 |

#### ErrorBoundary — 错误捕获

```tsx
<ErrorBoundary
  fallback={(e) => <p>出错了: {e.message}</p>}
  onError={(e) => console.error(e)}
>
  {() => <Dashboard />}   {/* 必须用 thunk */}
</ErrorBoundary>
```

#### createPortal — 渲染到指定位置

```tsx
<Show when={showModal}>
  {createPortal(<Modal />, document.body)}
</Show>
```

#### wrap — 封装三方库为组件

```tsx
const Chart = wrap('div', (el, props: { data: any }, ctx) => {
  const chart = echarts.init(el)
  chart.setOption(props.data)
  effect(() => chart.setOption(props.data))
  return () => chart.dispose()  // 卸载时自动清理
})

// 使用：
<Chart data={salesData} />
```

#### createContext / extendCtx — 上下文扩展

```tsx
// 类型安全的 provide/inject
const ThemeCtx = createContext<string>('theme')
ThemeCtx.provide(ctx, 'dark')
const theme = ThemeCtx.inject(ctx)  // 'dark' | null

// 中间件注入
function myMiddleware(): AppMiddleware {
  return (ctx) => extendCtx(ctx, { myField: 'hello' })
}
```

### React 对照表

| React | weifuwu/client |
|-------|----------------|
| `useState(0)` | `signal(0)` |
| `useMemo(() => a*2, [a])` | `computed(() => a.value * 2)` |
| `useEffect(() => f, [])` | `onMount(f)` |
| `useEffect(() => f, [dep])` | `effect(f)` |
| `{cond && <X/>}` | `<Show when={cond}><X/></Show>` |
| `{arr.map(i => <X/>)}` | `<For each={arr}>{(i) => <X/>}</For>` |
| `Suspense` | `<Show when={!loading}>` |
| `ErrorBoundary` | `<ErrorBoundary>` |
| `createPortal` | `createPortal` |
| `useNavigate()` | `ctx.app.navigate()` |
| `useParams()` | `ctx.route.params` |
| `useFormik()` | `useForm()` |
| `axios.get()` | `ctx.api.get()` |
| `useSWR()` | `createResource()` |
| `React.lazy()` | `lazy()` |
| `useContext()` | `createContext()` |

### 前端类型

`Signal`, `Component`, `WfuiContext`, `AppMiddleware`, `RouteDef`, `ApiClient`, `ApiOptions`, `ApiRequestOptions`, `AuthClient`, `AuthUser`, `AuthOptions`, `ResourceOptions`, `ResourceState`, `FormOptions`, `FormReturn`, `FormFieldBindings`, `FormValidators`, `LazyComponentOptions`, `LazyStatus`

---

## 全栈模式

### 认证流程

```ts
// 后端
app.post('/api/login', async (req, ctx) => {
  const { email } = await req.json()
  return Response.json({
    token: 'jwt_' + Math.random().toString(36),
    user: { id: 1, name: email.split('@')[0], email },
  })
})

// 前端
app.use(api({ baseURL: '' }))
app.use(auth())

// 登录
const res = await ctx.api.post('/api/login', { email, password })
ctx.auth.login(res.token, res.user)
```

### 异步数据 + SSR

```ts
// 后端 — 同路径既支持 SSR 也支持 API
app.get('/api/posts', async (req, ctx) => {
  return Response.json(posts)
})

// 前端 — 客户端获取
const [posts, { loading }] = createResource(
  () => ctx.api.get('/api/posts')
)
```

### 嵌套布局 + 代码分割

```tsx
const routes = [
  {
    path: '/dashboard',
    layout: DashboardLayout,   // 侧边栏等 UI 保持挂载
    children: [
      { path: '/overview', component: lazy(() => import('./Overview')) },
      { path: '/settings', component: lazy(() => import('./Settings')) },
    ],
  },
]
```

---

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `DATABASE_URL` | `postgres://root:123456@localhost:5432/demo` | Postgres 连接字符串 |
| `REDIS_URL` | `redis://localhost:6379` | Redis 连接字符串 |

---

## Demo

```bash
cd apps/demo
node server.ts
# http://localhost:3000
```

Demo 包含：嵌套布局、signal 待办列表、useForm 表单、createResource 数据请求、api + auth 认证、WebSocket 实时通信。

---

## 项目结构

```
src/
├── index.ts             入口，导出所有后端模块
├── types.ts             Context, Handler, Middleware 等类型
├── core/                Router, serve, WebSocket upgrade
├── middleware/           cors, serveStatic
├── postgres/            PostgreSQL 客户端
├── redis/               Redis 客户端
├── ui/                  SSR 渲染 + 动态编译
├── graphql.ts           GraphQL
├── client/
│   ├── index.ts         前端导出入口
│   ├── signal.ts        响应式系统
│   ├── jsx-runtime.ts   JSX → DOM, Show/For/ErrorBoundary/Portal
│   ├── router.ts        路由中间件 + RouteView
│   ├── app.ts           createApp 应用实例
│   ├── resource.ts      createResource 异步数据
│   ├── form.ts          useForm 表单
│   ├── lazy.ts          组件懒加载
│   ├── types.ts         前端类型
│   └── middleware/
│       ├── ws.ts        WebSocket 客户端
│       ├── api.ts       HTTP 客户端
│       └── auth.ts      认证状态管理
├── test/                测试
apps/demo/               全栈 demo
```

```bash
npm run build       # esbuild → dist/
npm run typecheck   # tsc --noEmit
npm test            # 运行所有测试
```
