# weifuwu

**全栈框架 — 后端 `(req, ctx) => Response` + 前端 `(props, ctx) => JSX`**

```bash
npm install weifuwu
```

一个包，无上游依赖。后端提供 HTTP 路由、数据库、中间件；前端提供 VDOM + Proxy 驱动的前端框架。

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
| **client** | — | 前端 VDOM + Proxy 框架 | — |
| **layout** | — | 纯 CSS 布局原语 + 主题 Token 系统 | — |

**前端 `weifuwu/client` 模块总览：**

| 类别 | 导出 | 用途 |
|------|------|------|
| **渲染引擎** | `VNode`, `Component` | 虚拟 DOM 节点与组件类型 | — |
| **JSX 运行时** | `jsx`/`jsxs`/`jsxDEV`, `Fragment` | TSX 编译目标 | — |
| **应用** | `createApp` | 中间件链 + 挂载 | — |
| **路由** | `router`, `RouteView` | 嵌套布局路由 | — |
| **中间件** | `ws`, `api`, `auth` | WebSocket / HTTP 客户端 / 认证状态 | — |
| **工具** | `extendCtx` | ctx 扩展 | — |
| **类型** | `WfuiContext`, `AppMiddleware`, `RouteDef`, `VNodeType`, `Component`, `ApiClient`, `AuthClient` | — | — |

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
import { createApp, router, RouteView, ws, api, auth } from 'weifuwu/client'
import type { WfuiContext, RouteDef } from 'weifuwu/client'

// 组件 = (props, ctx) => VNode
function Home(_props: {}, ctx: WfuiContext) {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.items = [{ id: 1, text: 'hello' }] }
  return <div>{$.items.map((i: any) => <div key={i.id}>{i.text}</div>)}</div>
}

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

### 状态管理 — 深度 Proxy

`ctx.ui.$` 是**深度 Proxy**：任何属性/数组/对象层面的写入自动触发渲染，无需手动调用。

```tsx
const $ = ctx.ui.$

// 顶层属性赋值
$.count = 0                                // → 自动渲染
$.user = { name: 'alice' }                 // → 新值自动深度包装

// 数组突变
$.items.push(newItem)                      // → 自动渲染
$.items.pop()                              // → 自动渲染
$.items.splice(i, 1)                       // → 自动渲染

// 对象属性突变（数组内部也支持）
$.items[0].done = true                     // → 自动渲染
$.msgs[idx].content += event.text          // → 自动渲染

// 不可变更新（同样支持）
$.items = [...$.items, newItem]
```

| API | 说明 |
|------|------|
| `ctx.ui.$` | 深度 Proxy 对象，所有写入自动触发渲染 |
| `ctx.ui.dirty()` | ⚠ 极少需要 — 仅当绕过 Proxy 直接操作底层对象时 |

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

### 条件与列表

使用原生 JS 表达式，不需要框架 API：

```tsx
// 条件
{$.loading && <Loading />}
{$.error ? <Error msg={$.error} /> : <Content />}

// 列表
{$.items.map(item => (
  <div key={item.id}>{item.name}</div>
))}
```

| 模式 | 说明 |
|------|------|
| `{cond && <A/>}` | 条件渲染（cond 为 true 时渲染 A） |
| `{cond ? <A/> : <B/>}` | 二选一 |
| `{arr.map(x => <div key={x.id}/>)}` | 列表渲染，必须加 `key` |

### 生命周期

使用 `ref` 回调替代生命周期钩子：

```tsx
<div ref={el => {
  if (el) {
    // 挂载：el 是 DOM 元素
    fetchData()
    el.addEventListener('scroll', handler)
  }
  if (!el) {
    // 卸载：el 为 null
    cleanup()
  }
}} />
```

`ref` 在挂载时传入 DOM 元素，卸载时传入 `null`。一个回调覆盖 mount/unmount 两个场景。

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
const unsub = ctx.ws?.onMessage((data) => { ... })
// 清理在 ref 中处理
ctx.ws?.send({ type: 'chat', body: 'hello' })
{ctx.ws?.isConnected && <span>🟢 已连接</span>}
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
{ctx.auth?.isLoggedIn ? (
  <div>
    <span>{ctx.auth?.user?.name}</span>
    <button onClick={() => ctx.auth?.logout()}>退出</button>
  </div>
) : (
  <Login />
)}

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
| `useState(0)` | `$.count = 0` |
| `useMemo(() => a*2, [a])` | `const doubled = a * 2`（render 时计算） |
| `useEffect(() => f, [])` | `if (!ctx.ui.ready) { f() }` |
| `{cond && <X/>}` | 相同 |
| `{arr.map(i => <X/>)}` | 相同，加 `key` |
| `Suspense` | `{$.loading && <Loading/>}` |
| `useNavigate()` | `ctx.app?.navigate()` |
| `useParams()` | `ctx.route?.params` |
| `axios.get()` | `ctx.api?.get()` |

### 前端类型

`VNode`, `Component`, `WfuiContext`, `AppMiddleware`, `RouteDef`, `ApiClient`, `AuthClient`

---

## 布局 & 主题 (`weifuwu/layout`)

纯 CSS 布局原语 + 主题 Token 系统，不绑定任何 JS 框架。

```bash
npm install weifuwu  # 已包含
```

```ts
// 服务端编译 CSS
app.get('/weifuwu.css', async (req, ctx) => ctx.ui.css('./node_modules/weifuwu/dist/layout/weifuwu-layout.css'))
```

```html
<!-- 或直接引入 -->
<link rel="stylesheet" href="/weifuwu.css">
```

### 33 个布局原语

| 类别 | 原语 | 含义 | CSS 实现 |
|------|------|------|---------|
| **排列** | `wf-stack` | 纵向堆叠 | `flex-direction: column + gap` |
| | `wf-stack-reverse` | 反向堆叠 | `flex-direction: column-reverse + gap` |
| | `wf-row` | 横向排列 | `flex + flex-wrap + gap` |
| | `wf-row-reverse` | 反向排列 | `flex-direction: row-reverse` |
| | `wf-nowrap` | 不换行 | `flex-wrap: nowrap` |
| | `wf-cluster` | 换行簇 | `flex-wrap: wrap + justify-content: center` |
| **分布** | `wf-split` | 两端展开 | `justify-content: space-between` |
| | `wf-center` | 居中 | `flex + center both axes` |
| | `wf-right` | 靠右 | `justify-content: flex-end` |
| | `wf-around` | 环绕 | `justify-content: space-around` |
| | `wf-evenly` | 均匀 | `justify-content: space-evenly` |
| **对齐** | `wf-top` | 顶部 | `align-items: flex-start` |
| | `wf-bottom` | 底部 | `align-items: flex-end` |
| | `wf-stretch` | 拉伸 | `align-items: stretch` |
| **弹性** | `wf-fill` | 撑满 | `flex: 1 + min-width: 0` |
| | `wf-fixed` | 固定 | `flex: none` |
| | `wf-auto` | 按内容 | `flex: auto` |
| | `wf-shrink` | 可收缩 | `min-width: 0 / min-height: 0` |
| **Z轴** | `wf-cover` | 全屏覆盖 | `position: fixed + inset: 0` |
| | `wf-pop` | 浮动层 | `position: absolute` |
| | `wf-anchor` | 锚点容器 | `position: relative` |
| | `wf-layer` | 层级控制 | `position: relative + z-index` |
| | `wf-sticky` | 粘性 | `position: sticky` |
| **容器** | `wf-surface` | 基础面 | `border-radius + box-shadow + bg` |
| | `wf-grid` | 网格 | `display: grid + --wf-cols` |
| | `wf-container` | 宽度约束 | `max-width + margin: auto` |
| | `wf-scroll` | 滚动 | `overflow: auto` |
| | `wf-clip` | 裁剪 | `overflow: hidden` |
| **显隐** | `wf-hidden` | 隐藏 | `display: none` |
| | `wf-block` | 块级 | `display: block` |
| | `wf-inline` | 行内 | `display: inline` |
| | `wf-inline-block` | 行内块 | `display: inline-block` |
| | `wf-contents` | 容器抹除 | `display: contents` |

### 72 个主题 Token

| 类别 | Token 示例 | 含义 |
|------|-----------|------|
| 品牌色 | `--wf-color-primary`, `--wf-color-primary-bg` | 品牌色、Hover、背景 |
| 语义色 | `--wf-color-success`, `--wf-color-warning`, `--wf-color-error`, `--wf-color-info` | 状态语义色 |
| 中性色 | `--wf-color-text`, `--wf-color-bg`, `--wf-color-border` | 文字/背景/边框 |
| 字体 | `--wf-font-sans`, `--wf-font-mono` | 字体族 |
| 字号 | `--wf-font-size-xs` ~ `--wf-font-size-5xl`（9 级）| 字号层级 |
| 字重 | `--wf-font-weight-normal` ~ `bold`（4 级）| 字重 |
| 行高 | `--wf-line-height-tight`, `--wf-line-height`, `--wf-line-height-relaxed` | 行高 |
| 字距 | `--wf-letter-spacing`, `--wf-letter-spacing-wide`, `--wf-letter-spacing-wider` | 字符间距 |
| 间距 | `--wf-space-xs` ~ `--wf-space-2xl`（8 级）| margin / padding |
| 间隔 | `--wf-gap-xs` ~ `--wf-gap-2xl`（6 级）| flex / grid gap |
| 圆角 | `--wf-radius-sm` ~ `--wf-radius-xl`（5 级）| border-radius |
| 阴影 | `--wf-shadow-sm` ~ `--wf-shadow-lg`（4 级）| box-shadow |
| 边框 | `--wf-border-width` | 边框宽度 |
| 聚焦 | `--wf-focus-ring` | 聚焦环 |
| 动效 | `--wf-transition-duration`, `--wf-transition-timing` | 过渡时长/曲线 |
| 表单 | `--wf-accent-color`, `--wf-caret-color` | 表单控件主题色 |
| 透明 | `--wf-opacity-disabled`, `--wf-opacity-overlay` | 禁用态/遮罩透明度 |
| 层级 | `--wf-pop-z`, `--wf-cover-z` | z-index |

### 暗色模式

切换 `html` 标签的 `data-theme` 属性即可自动切换全部主题色：

```ts
// weifuwu/client
function toggleTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark'
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark')
}
```

### 基础元素默认样式

引入 `weifuwu/layout` 后，以下 HTML 元素自动绑定主题 Token，无需额外样式：

`body`, `h1`~`h6`, `p`, `a`, `label`, `small`, `input`, `textarea`, `select`, `button`, `table`, `th`, `td`, `hr`, `pre`, `code`

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

Demo 包含：嵌套布局、ctx.ui.$ 待办列表、手动表单、async fetch 数据请求、api + auth 认证、WebSocket 实时通信。

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
│   ├── vnode.ts         VNode 类型 + JSX 工厂
│   ├── render.ts        VDOM 渲染器（render + patchValue）
│   ├── router.ts        路由中间件 + RouteView
│   ├── app.ts           createApp 应用实例
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
