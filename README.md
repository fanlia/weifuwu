# weifuwu

**全栈框架 — 后端 `(req, ctx) => Response` + 前端 `(props, ctx) => VNode` + 纯 CSS 布局系统**

```bash
npm install weifuwu
```

一个包，零上游依赖。后端提供 HTTP 路由、数据库、中间件；前端提供 VDOM + Proxy 驱动的前端框架；布局提供纯 CSS 原语 + 主题 Token。

---

## 模块总览

| 模块 | 导入路径 | 用途 | 依赖 |
|------|---------|------|------|
| **Router** | `weifuwu` | HTTP 路由 + 中间件链 + WebSocket + GraphQL | — |
| **serve** | `weifuwu` | HTTP 服务器 | `Router` |
| **cors** | `weifuwu` | CORS 跨域中间件 | `Router` |
| **serveStatic** | `weifuwu` | 静态文件服务 | `Router` |
| **postgres** | `weifuwu` | PostgreSQL 客户端 → `ctx.sql` | `Router` |
| **redis** | `weifuwu` | Redis 客户端 → `ctx.redis` | `Router` |
| **ui** | `weifuwu` | SSR 渲染 + 动态 JS/CSS 编译 → `ctx.ui` | `Router` |
| **graphql** | `weifuwu` | GraphQL 端点 | `Router` |
| **client** | `weifuwu/client` | 前端 VDOM + Proxy 框架 + i18n + ErrorBoundary | — |
| **components** | `weifuwu/components` | 34 个 HTML 原语组件（Button/Table/Modal/...） | `client` |
| **layout** | `weifuwu/layout` | 纯 CSS 布局原语 + 主题 Token | — |

---

## 核心理念

前后端共享同一模式：**中间件向 `ctx` 注入字段，handler/组件从 `ctx` 读取。**

```
后端:                               前端:
  Request → Middleware → Handler     createApp() → Middleware → Component
             │                                    │
             ▼                                    ▼
         ctx.sql                              ctx.ws
         ctx.redis                            ctx.route
         ctx.ui                               ctx.api / ctx.auth
                                             ctx.i18n
```

---

## 快速开始 —— 全栈应用

```ts
import { serve, Router, ui } from 'weifuwu'

const app = new Router()
app.use(ui())

// 前端 TSX → JS bundle（动态编译，零构建步骤）
app.get('/app.js', async (req, ctx) => ctx.ui.js('./src/main.tsx'))

// CSS（PostCSS + Tailwind 编译）
app.get('/style.css', async (req, ctx) => ctx.ui.css('./src/style.css'))

// SPA 入口
app.get('/', async (req, ctx) => ctx.ui.html`
  <!DOCTYPE html>
  <html>
  <head><link rel="stylesheet" href="/style.css"></head>
  <body><div id="root"></div><script src="/app.js"></script></body>
  </html>
`)

serve(app, { port: 3000 })
```

```tsx
// src/main.tsx —— 前端
import { createApp, router, RouteView, i18n } from 'weifuwu/client'
import type { WfuiContext, RouteDef } from 'weifuwu/client'

function Home(_props: {}, ctx: WfuiContext) {
  return <h1>Hello weifuwu</h1>
}

createApp()
  .use(router({ routes: [{ path: '/', component: Home }], mode: 'history' }))
  .mount('#root', () => <Home />)
```

---

## 后端

### Router

```ts
import { Router } from 'weifuwu'

const app = new Router()

// 中间件
app.use(cors())

// 路由
app.get('/api/users', async (req: Request, ctx: Context) => {
  return Response.json(users)
})

app.post('/api/users', async (req: Request, ctx: Context) => {
  const body = await req.json()
  return Response.json({ id: 1, ...body }, { status: 201 })
})

// URL 参数
app.get('/users/:id', async (req: Request, ctx: Context) => {
  const id = ctx.params.id
  return Response.json({ id, name: 'User ' + id })
})
```

| 方法 | 路由 | 说明 |
|------|------|------|
| `app.get(path, handler)` | 任意 | GET 请求 |
| `app.post(path, handler)` | 任意 | POST 请求 |
| `app.put(path, handler)` | 任意 | PUT 请求 |
| `app.patch(path, handler)` | 任意 | PATCH 请求 |
| `app.delete(path, handler)` | 任意 | DELETE 请求 |
| `app.use(middleware)` | 全路由 | 中间件 |
| `app.ws(path, handler)` | 任意 | WebSocket |
| `app.graphql(options)` | 自动 | GraphQL 端点 |
| `app.onError(handler)` | 全局 | 错误处理 |

### serve —— HTTP 服务器

```ts
import { serve, Router } from 'weifuwu'

const router = new Router()
serve(router, { port: 3000 })
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `port` | `number` | `0`（随机端口） | 监听端口 |
| `hostname` | `string` | `'0.0.0.0'` | 监听地址 |
| `timeout` | `number` | `30000` | 连接超时（ms）|
| `maxBodySize` | `number` | `10MB` | 请求体上限 |
| `shutdown` | `boolean` | `true` | 自动注册 SIGTERM/SIGINT |

### cors —— CORS 中间件

```ts
app.use(cors())

app.use(cors({
  origin: ['https://app.example.com'],
  methods: ['GET', 'POST'],
}))
```

| 参数 | 默认值 |
|------|--------|
| `origin` | `*` |
| `methods` | `GET, POST, PUT, PATCH, DELETE, OPTIONS` |
| `allowedHeaders` | `Content-Type, Authorization` |

### serveStatic —— 静态文件

```ts
import { serveStatic } from 'weifuwu'

// 单一路径
app.get('/static/*', serveStatic('./public'))

// 多目录
app.get('/uploads/*', serveStatic('./uploads'))
```

### postgres —— PostgreSQL

```ts
import { postgres } from 'weifuwu'

app.use(postgres())

// 然后在 handler 中使用 ctx.sql
app.get('/users', async (req, ctx) => {
  const users = await ctx.sql`SELECT * FROM users`
  return Response.json(users)
})
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `url` | `string` | `DATABASE_URL` 环境变量 | 连接字符串 |
| `max` | `number` | `10` | 连接池大小 |

### redis —— Redis

```ts
import { redis } from 'weifuwu'

app.use(redis())

// 使用 ctx.redis
app.get('/cache', async (req, ctx) => {
  const cached = await ctx.redis.get('key')
  return Response.json({ cached })
})
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `url` | `string` | `REDIS_URL` 环境变量 | 连接字符串 |

### ui —— SSR + SPA 渲染

```ts
app.use(ui())

// SSR 页面
app.get('/page', async (req, ctx) => ctx.ui.html`
  <h1>${title}</h1>
  <p>${body}</p>
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
| `ctx.ui.js(entryPath)` | 编译 TSX → JS bundle |
| `ctx.ui.css(entryPath)` | 编译 CSS（PostCSS + Tailwind） |

### graphql —— GraphQL

```ts
app.graphql({
  schema: `type Query { hello: String }`,
  resolvers: { Query: { hello: () => 'world' } },
  graphiql: true,
})
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

### 后端类型

`Context`, `Handler`, `Middleware`, `ErrorHandler`, `WebSocket`, `WebSocketHandler`, `ServeOptions`, `Server`, `CORSOptions`, `ServeStaticOptions`, `PostgresOptions`, `PostgresClient`, `PostgresInjected`, `RedisOptions`, `RedisClient`, `RedisInjected`, `GraphQLOptions`, `GraphQLHandler`

---

## 前端 (`weifuwu/client`)

零外部依赖。组件模型：**纯函数 `(props, ctx) => VNode`**。

构建配置（esbuild）：

```js
esbuild.build({
  jsx: 'automatic',
  jsxImportSource: 'weifuwu/client',
  bundle: true,
})
```

### 组件

```tsx
// 组件 = 纯函数 (props, ctx) => VNode
function Greeting(props: { name: string }, _ctx: WfuiContext) {
  return <div>Hello, {props.name}!</div>
}

// 使用
<Greeting name="world" />
```

### 状态 —— 深度 Proxy

`ctx.ui.$` 是**深度 Proxy**：任何属性/数组/对象写入自动触发渲染，无需手动调用。

```tsx
function Counter(_props: {}, ctx: WfuiContext) {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) $.count = 0

  return (
    <div>
      <span>{$.count}</span>
      <button onClick={() => $.count++}>+</button>
    </div>
  )
}
```

| API | 说明 |
|------|------|
| `ctx.ui.$` | 深度 Proxy，所有写入自动触发渲染 |
| `$.x = val` | 顶层属性赋值 → 自动渲染 |
| `$.items.push(val)` | 数组突变 → 自动渲染 |
| `$.items[0].x = val` | 对象属性突变 → 自动渲染 |
| `ctx.ui.dirty()` | 仅当绕过 Proxy 直接操作底层对象时使用 |

### 条件与列表

使用原生 JS 控制流：

```tsx
// 条件
{cond ? <A /> : <B />}
{cond && <A />}

// 列表
{items.map(item => <div key={item.id}>{item.name}</div>)}
```

### 生命周期 —— ref 回调

`ref` 回调在 mount 时触发，接收 DOM 元素。返回的清理函数在 unmount 时由框架保证调用。

```tsx
function MyComponent(_props: {}, ctx: WfuiContext) {
  return (
    <div ref={el => {
      // mount: el 是 DOM 元素
      el.addEventListener('scroll', handler)
      // 返回清理函数，unmount 时框架保证调用
      return () => el.removeEventListener('scroll', handler)
    }} />
  )
}
```

| 场景 | 写法 |
|------|------|
| 事件监听 | `ref={el => { el.addEventListener(...); return () => el.removeEventListener(...) }}` |
| 定时器 | `ref={el => { const t = setInterval(f, 1000); return () => clearInterval(t) }}` |
| 第三方库 | `ref={el => { const c = new Chart(el); return () => c.destroy() }}` |
| 仅 mount | `ref={el => { init(el) }}` |

### 应用 —— createApp

```tsx
import { createApp } from 'weifuwu/client'

const app = createApp()
app.use(middleware1)
app.use(middleware2)
app.mount('#root', RootComponent)
app.destroy()
```

### 路由 —— router + RouteView

```tsx
import { router, RouteView } from 'weifuwu/client'

createApp()
  .use(router({
    routes: [
      { path: '/', component: Home },
      { path: '/users', component: UserList },
      { path: '/users/:id', component: UserDetail },
    ],
    notFound: NotFound,
    mode: 'history',  // 或 'hash'
  }))
  .mount('#root', AppShell)

// 嵌套布局
const routes = [
  {
    path: '/dashboard',
    layout: DashboardLayout,  // 持久布局
    children: [
      { path: '/overview', component: Overview },
      { path: '/settings', component: Settings },
    ],
  },
]

// 在 layout 中放置 RouteView 渲染子路由
function DashboardLayout(_props: {}, ctx: WfuiContext) {
  return (
    <div class="wf-split">
      <aside>sidebar</aside>
      <main><RouteView /></main>
    </div>
  )
}
```

| API | 说明 |
|------|------|
| `ctx.route.path` | 当前路由路径 |
| `ctx.route.params` | URL 参数（如 `:id`）|
| `ctx.route.query` | 查询参数对象 |
| `ctx.app.navigate(path)` | 编程式导航 |

### 中间件

**ws —— WebSocket 客户端**

```tsx
app.use(ws())

// 发送消息
ctx.ws?.send({ type: 'chat', body: 'hello' })

// 接收消息
ctx.ws?.onMessage((msg) => { console.log(msg) })
```

**api —— HTTP 客户端**

```tsx
app.use(api({ baseURL: '/api' }))

// 自动携带 Authorization header
const user = await ctx.api?.get('/users/1')
const res = await ctx.api?.post('/users', { name: 'Alice' })
```

| 方法 | 说明 |
|------|------|
| `ctx.api.get(url, opts?)` | GET |
| `ctx.api.post(url, body?, opts?)` | POST |
| `ctx.api.put(url, body?, opts?)` | PUT |
| `ctx.api.patch(url, body?, opts?)` | PATCH |
| `ctx.api.delete(url, opts?)` | DELETE |

**auth —— 认证状态管理**

```tsx
app.use(auth())

// 登录
ctx.auth?.login(token, user)

// 登出
ctx.auth?.logout()

// 状态
if (ctx.auth?.isLoggedIn) { ... }
```

| API | 说明 |
|------|------|
| `ctx.auth.token` | JWT token |
| `ctx.auth.user` | 用户对象 |
| `ctx.auth.isLoggedIn` | 是否已登录 |
| `ctx.auth.login(token, user, refreshToken?)` | 登录 |
| `ctx.auth.logout()` | 登出 |

### ErrorBoundary

```tsx
import { ErrorBoundary } from 'weifuwu/client'

<ErrorBoundary fallback={<p>出错了</p>}>
  <UserProfile />
</ErrorBoundary>
```

### 工具

| 函数 | 用途 |
|------|------|
| `extendCtx(ctx, fields)` | 创建新 ctx，继承原 ctx 的 getter |

### 国际化 — `ctx.i18n`

`i18n()` 中间件注入 `ctx.i18n`，支持运行时语言切换：

```ts
import { createApp, i18n } from 'weifuwu/client'

createApp()
  .use(i18n({
    locale: 'zh-CN',
    messages: { 'users.title': '用户管理' },
  }))
  .mount('#root', () => <App />)

// 页面中使用
ctx.i18n?.t('users.title')      // → '用户管理'

// 运行时切换
ctx.i18n?.setLocale('en-US')    // → 自动触发重渲染
```

内置语言包：`zh-CN`（默认）、`en-US`。组件文案（Button 的 `加载中...`、FileUpload 的 `点击或拖拽上传文件`）随语言自动切换。组件通过 `ctx.i18n?.components?.ComponentName.field` 读取，支持 `props.locale` 局部覆盖。

```ts
import { i18n, zhCN, enUS } from 'weifuwu/client'
```

### 前端类型

`VNode`, `VNodeType`, `Component`, `WfuiContext`, `AppMiddleware`, `RouteDef`, `ApiClient`, `ApiOptions`, `ApiRequestOptions`, `ApiError`, `AuthClient`, `AuthOptions`, `ErrorBoundaryProps`, `I18nOptions`, `I18nState`, `LocalePackage`

---

## 布局 & 主题 (`weifuwu/layout`)

纯 CSS 布局原语 + 主题 Token。不绑定任何 JS 框架。

```ts
// 服务端编译
app.get('/layout.css', async (req, ctx) => ctx.ui.css('./node_modules/weifuwu/dist/layout/weifuwu-layout.css'))
```

```html
<!-- 或直接引入 -->
<link rel="stylesheet" href="/layout.css">
```

### 使用示例

```html
<div class="wf-stack" style="--wf-gap: 24px">
  <div class="wf-split">
    <h2 style="color: var(--wf-color-text)">仪表盘</h2>
    <button style="background: var(--wf-color-primary); color: #fff; border-radius: var(--wf-radius)">+ 新建</button>
  </div>
  <div class="wf-row" style="--wf-gap: 16px">
    <div class="wf-fill wf-surface wf-stack" style="padding: 20px; background: var(--wf-color-bg); --wf-gap: 4px">
      <span style="color: var(--wf-color-text-secondary)">总用户</span>
      <span style="font-size: var(--wf-font-size-4xl); font-weight: var(--wf-font-weight-bold); color: var(--wf-color-text)">1,234</span>
    </div>
  </div>
</div>
```

### 33 个布局原语

| 类别 | 原语 | 含义 | CSS 实现 |
|------|------|------|---------|
| **排列** | `wf-stack` | 纵向堆叠 | `flex-direction: column + gap` |
| | `wf-stack-reverse` | 反向堆叠 | `flex-direction: column-reverse` |
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
| **弹性** | `wf-fill` | 撑满剩余空间 | `flex: 1 + min-width: 0` |
| | `wf-fixed` | 固定不伸缩 | `flex: none` |
| | `wf-auto` | 按内容撑满 | `flex: auto` |
| | `wf-shrink` | 可收缩 | `min-width: 0 + min-height: 0` |
| **Z轴** | `wf-cover` | 全屏覆盖 | `position: fixed + inset: 0` |
| | `wf-pop` | 浮动层 | `position: absolute` |
| | `wf-anchor` | 锚点容器 | `position: relative` |
| | `wf-layer` | 层级控制 | `position: relative + z-index` |
| | `wf-sticky` | 粘性定位 | `position: sticky` |
| **容器** | `wf-surface` | 基础面 | `border-radius + box-shadow + bg` |
| | `wf-grid` | 二维网格 | `display: grid + --wf-cols` |
| | `wf-container` | 宽度约束 | `max-width + margin: auto` |
| | `wf-scroll` | 可滚动 | `overflow: auto` |
| | `wf-clip` | 溢出裁剪 | `overflow: hidden` |
| **显隐** | `wf-hidden` | 隐藏 | `display: none` |
| | `wf-block` | 块级 | `display: block` |
| | `wf-inline` | 行内 | `display: inline` |
| | `wf-inline-block` | 行内块 | `display: inline-block` |
| | `wf-contents` | 容器抹除 | `display: contents` |

### 72 个主题 Token

| 类别 | Token 示例 | 值/层级 |
|------|-----------|---------|
| 品牌色 | `--wf-color-primary`, `--wf-color-primary-bg` | 品牌色 + Hover + 背景 |
| 语义色 | `--wf-color-success/warning/error/info` | 各带 `-bg` 背景变体 |
| 中性色 | `--wf-color-text/text-secondary/text-tertiary/text-disabled` | 4 级文字色 |
| | `--wf-color-bg/bg-secondary/bg-tertiary` | 3 级背景色 |
| | `--wf-color-border/border-light/border-dark` | 3 级边框色 |
| 字体 | `--wf-font-sans`, `--wf-font-mono` | 字体族 |
| 字号 | `--wf-font-size-xs/sm/base/lg/xl/2xl/3xl/4xl/5xl` | 9 级字号 |
| 字重 | `--wf-font-weight-normal/medium/semibold/bold` | 4 级字重 |
| 行高 | `--wf-line-height-tight/normal/relaxed` | 3 级行高 |
| 字距 | `--wf-letter-spacing/wide/wider` | 3 级字符间距 |
| 间距 | `--wf-space-xs/sm/md/lg/xl/2xl` | 8 级 margin/padding |
| 间隔 | `--wf-gap-xs/sm/md/lg/xl/2xl` | 6 级 flex/grid gap |
| 圆角 | `--wf-radius-sm/md/lg/xl` | 5 级 border-radius |
| 阴影 | `--wf-shadow-sm/md/lg` | 4 级 box-shadow |
| 边框 | `--wf-border-width` | 边框宽度 |
| 聚焦 | `--wf-focus-ring` | 聚焦环（box-shadow）|
| 动效 | `--wf-transition-duration/timing` | 过渡时长 + 曲线 |
| 表单 | `--wf-accent-color`, `--wf-caret-color` | 控件主题色 + 光标色 |
| 透明 | `--wf-opacity-disabled`, `--wf-opacity-overlay` | 禁用态 + 遮罩透明度 |
| 层级 | `--wf-pop-z`, `--wf-cover-z` | z-index 层 |

### 暗色模式

切换 `html` 的 `data-theme` 属性即可自动切换全部主题色：

```ts
document.documentElement.setAttribute('data-theme', 'dark')
// → 全部引用 var(--wf-*) 的元素自动变色
```

### 基础元素默认样式

引入 weifuwu/layout 后，以下 HTML 元素自动绑定主题 Token：

`body`, `h1`~`h6`, `p`, `a`, `label`, `small`, `input`, `textarea`, `select`, `button`, `table`, `th`, `td`, `hr`, `pre`, `code`

---

## 组件库 — `weifuwu/components`

29 个 **HTML 原语**，覆盖 90% 的 SaaS 页面 HTML 需求。每个组件是 `(props, ctx) => VNode` 纯函数，引用 `weifuwu/layout` 的 CSS 变量做主题。

```ts
import { Button, Input, Table, Modal, Toast } from 'weifuwu/components'
import 'weifuwu/components/style.css'
```

### 模块总览

| 类别 | 组件 | 用途 |
|------|------|------|
| **表单核心** | `Button` `Input` `Textarea` `Select` | 4 个最常用的表单元素 |
| **表单核心** | `InputNumber` | 数字输入，带自定义步进按钮 (`showStepper`) |
| **表单选择** | `Checkbox` `Switch` `RadioGroup` `Slider` | 选择类输入 |
| **表单增强** | `Form` `Field` `FileUpload` `SearchInput` `ProgressBar` | 文件上传、搜索、进度 |
| **数据展示** | `Table` `Card` `Badge` `Tag` `Avatar` `StatCard` `PageHeader` | 数据展示与页面标题 |
| **数据反馈** | `Modal` `Drawer` `Tooltip` `Toast` `Alert` `Loading` `EmptyState` | 弹窗、抽屉、提示 |
| **导航组件** | `Breadcrumb` `Tabs` `Dropdown` `Pagination` `Steps` `Accordion` | 面包屑、标签页、分页 |
| **布局** | `Divider` | 分割线 (水平/垂直/带文字) |

### 状态管理说明

`ctx.ui.$` 是**组件级**状态——每个组件实例有独立的 Proxy（基于 `vnode._$`），同名变量不会冲突：

```tsx
// 组件 A
const $ = ctx.ui.$
$.open = true  // 只影响组件 A

// 组件 B（在同一页面）
const $ = ctx.ui.$
$.open = false // 只影响组件 B，不影响 A
```

跨组件共享状态请使用 `ctx` 直接挂载属性（延续中间件模式）：

```ts
ctx.theme = 'dark'          // 所有组件可读
ctx.toast?.success('成功')   // 如已注入 toast 中间件
```

### 页面模板 — `docs/pages/`

| 模板 | 文件 | 用途 |
|------|------|------|
| **列表页** | `docs/pages/list-page.md` | 搜索 + 表格 + 分页 + 加载/空/错误状态 |
| **表单页** | `docs/pages/form-page.md` | 表单 + 字段 + 校验 + 提交 |
| **详情页** | `docs/pages/detail-page.md` | 信息展示 + Tabs + 操作 |
| **设置页** | `docs/pages/settings-page.md` | 分组设置 + 独立保存 |
| **仪表盘** | `docs/pages/dashboard-page.md` | KPI 卡片 + 图表 + 列表 |
| **认证页** | `docs/pages/auth-page.md` | 居中卡片 + 表单 + 错误提示 |
| **应用壳** | `docs/pages/app-layout.md` | 侧边栏 + 导航菜单 + 认证守卫 |

每个模板标注了「改这里」——复制代码后改 API 路径、字段定义、操作按钮、导航项即可使用。

---

## 环境变量

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | — |
| `REDIS_URL` | Redis 连接字符串 | — |

---

## 项目结构

```
src/
├── index.ts               # 统一导出
├── types.ts               # 后端类型
├── request.ts             # 请求解析
├── response.ts            # 响应工具
├── core/
│   ├── router.ts          # HTTP 路由
│   ├── serve.ts           # HTTP 服务器
│   └── ws.ts              # WebSocket
├── middleware/
│   ├── cors.ts
│   └── static.ts
├── postgres/
├── redis/
├── graphql.ts
├── ui/                    # SSR + JS/CSS 编译
├── client/                # 前端 VDOM 框架
│   ├── index.ts
│   ├── vnode.ts
│   ├── app.ts
│   ├── render.ts
│   ├── router.ts
│   ├── types.ts
│   ├── error-boundary.ts
│   └── middleware/
│       ├── api.ts
│       ├── auth.ts
│       └── ws.ts
├── components/            # 29 个 HTML 原语组件
│   ├── index.ts
│   ├── Button/            # Button.ts + .css + .test.ts
│   ├── Input/
│   ├── ...
│   └── PageHeader/
└── layout/                # 纯 CSS 布局 + 主题
    ├── weifuwu-layout.css
    ├── _tokens.css
    ├── _dark.css
    ├── _base.css
    └── _*.css             # 33 个原语
```

---

## 开发

```bash
# 构建
npm run build

# 类型检查
npm run typecheck

# 测试
npm test

# 发布
node scripts/release.mjs <version>
```

## 设计原则

- **后端为工具箱** —— 提供 HTTP 路由、数据库、中间件原语，不捆绑业务模块
- **全栈单包** —— `npm install weifuwu` = 后端 + 前端 + 布局
- **Web 标准优先** —— 所有 handler 使用 `(req: Request, ctx: Context) => Response`
- **零外部依赖** —— 前端和布局没有任何 npm 运行时依赖
- **LLM 友好** —— 模块总览表 + 一致格式 + 清晰依赖链
