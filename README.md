# weifuwu

**全栈框架 — 后端 HTTP 路由 + 前端 VDOM 框架 + 纯 CSS 布局系统**

```bash
npm install weifuwu
```

一个包 = 后端 (`weifuwu`) + 前端 (`weifuwu/client`) + 组件库 (`weifuwu/components`) + 布局系统 (`weifuwu/layout`)。

> ⚠️ **注意：前后端都有 `ctx.ui`，但用途完全不同**
> - **后端** `ctx.ui`（SSR/编译）：`ctx.ui.html`（HTML 模板）、`ctx.ui.js`（TSX→JS 动态编译）、`ctx.ui.css`（CSS 编译）、`ctx.ui.ssr`（组件 SSR）、`ctx.ui.ssrData`（数据序列化）
> - **前端** `ctx.ui`（渲染引擎）：`ctx.ui.$()`（响应式状态）、`ctx.ui.render()` / `dirty()`（渲染控制）、`useMedia()` / `useBreakpoint()` / `usePopupPosition()`（浏览器事件监听）
> 后端的是「把页面和代码交给浏览器」，前端的是「在浏览器里驱动 UI」。

---

## 设计理念

**零运行时依赖** — 前端无 npm 运行时依赖（自研 VDOM，不引入 Virtual DOM 库、rxjs、immer 等）。后端仅依赖 `esbuild`（TSX→JS 编译）+ `graphql` + `ws`（语言/协议本身）——**数据库客户端（PostgreSQL/Redis 协议）、GraphQL schema 工具全部自研**。esbuild 作为运行时依赖随 `npm install weifuwu` 自动安装，`ctx.ui.js()` 开箱即用。

**两阶段组件模型** — 组件 = `(initProps, ctx) => (props) => VNode`。外层函数只执行一次（mount），内层函数每次状态/props 变化时执行（render）。无 class、无 `this`、无 Hook。

**Proxy 驱动渲染** — `ctx.ui.$()` 返回深度 Proxy，`$.x = val` 自动触发当前组件的 VDOM patch。也支持手动 `ctx.ui.render()` 精确控制渲染时机。无需手动调用 `useState`/`useEffect`。

**中间件注入一切** — 后端和前端共用同一理念：中间件向 `ctx` 注入能力（`ctx.sql` / `ctx.redis` / `ctx.api` / `ctx.auth` / `ctx.i18n` 等），Handler/组件从 `ctx` 读取。

**自研数据层** — `ctx.sql`（PG v3 协议）与 `ctx.redis`（RESP2 协议）为**自研客户端**：确定性输出、行为可预测、统一错误模型。jsonb 自动解码、TTL 安全 API、schema 写前校验——高频痛点（双重编码/parseRow 样板/`'EX'` 参数顺序）从根上消除。

**SSR + 动态编译** — 后端 `ctx.ui.js()` 用 esbuild 实时编译 TSX，开发时改代码即刷即用，零构建步骤。

**async 工厂组件** — `async (ctx) => (initProps, ctx) => (props) => VNode`：工厂层声明数据（`await ctx.data.get`）、mount 初始化状态（`$`）、render 输出视图。异步只在工厂边界，mount/render 保持同步；数据经闭包注入，写数据像写同步代码。

**SPA/SSR/Hydration 统一透明** — 同一份路由定义（`routes`）一个组件形态三场景自动适配：后端 `uiSsr({ routes })` 匹配即自动 SSR（完整 HTML + `__DATA__`），客户端 `router({ routes })` + `RouteView` + `mount(..., { hydrate: true })` 按 URL 同源匹配并收养服务端 HTML（不重建、无闪跳）。`ctx.data.get` 一个 API：SSR 预取 / hydration 命中（不重复请求）/ SPA 触发 fetch。服务端直接用 `.tsx`（`weifuwu/dev` Node loader），前后端同一 JSX 运行时。

---

## 快速开始

两种模式，**组件和路由的写法完全一样**，差异只有后端/客户端入口两行：

| 模式 | 适用场景 | 后端 | 客户端入口 |
|------|---------|------|-----------|
| **SPA** | 应用页（Dashboard、工具、后台） | HTML 外壳 | `mount('#root', RouteView)` |
| **SSR + Hydration** | 内容页（博客、营销，需要 SEO/首屏） | `uiSsr` 一行 | `mount('#root', RouteView, { hydrate: true })` |

### 先写共享部分（两种模式都一样）

```tsx
// routes.tsx —— 页面声明（前后端共用）
import type { RouteDef } from 'weifuwu/client'
import { asyncComponent } from 'weifuwu/client'

// async 工厂组件：await 数据 → 返回视图（两阶段：外层初始化，内层渲染）
const Home = asyncComponent(async (ctx) => {
  const msg = await ctx.data.get('/api/hello')   // 数据管道：一个 API 三场景
  return (_init, ctx) =>
    (props) => <h1>{msg.msg}</h1>
})

export const routes: RouteDef[] = [{ path: '/', component: Home }]
```

### 模式 A：纯 SPA

```ts
// server.ts
import { serve, Router, ui, cors } from 'weifuwu'

const app = new Router()
app.use(cors())
app.use(ui())   // 注入 ctx.ui.html / ctx.ui.js / ctx.ui.css

// SPA 外壳（空 root + 前端 bundle）
app.get('/', (req, ctx) => ctx.ui.html`
  <!doctype html><html><body>
    <div id="root"></div>
    <script src="/static/app.js"></script>
  </body></html>
`)
app.get('/static/app.js', (req, ctx) => ctx.ui.js('./src/client.ts'))
app.get('/api/hello', () => Response.json({ msg: 'world' }))

serve(app, { port: 3000 })
```

```ts
// src/client.ts —— 纯客户端渲染
import { createApp, router, RouteView } from 'weifuwu/client'
import { routes } from './routes.tsx'

createApp().use(router({ routes })).mount('#root', RouteView)
```

### 模式 B：SSR + Hydration（内容页/SEO）

同一份 `routes`、同一个组件，差异只在**后端加 `uiSsr` 一行、客户端加 `hydrate` 参数**：

```ts
// server.ts —— 完整版（与模式 A 的差异：uiSsr 中间件 + 一条样式路由）
import { serve, Router, ui, uiSsr, cors } from 'weifuwu'
import { routes } from './routes.tsx'

const app = new Router()
app.use(cors())
app.use(ui())

// 路由级 SSR：GET 匹配 routes → 注入 ctx.route.params → await 组件工厂
// → 完整 HTML + __DATA__ + bundle/styles 引用（无需手写页面 handler）
app.use(uiSsr({ routes, bundle: '/static/app.js', styles: ['/static/style.css'] }))

app.get('/static/app.js', (req, ctx) => ctx.ui.js('./src/client.ts'))
app.get('/static/style.css', (req, ctx) => ctx.ui.css('./src/style.css'))
app.get('/api/hello', () => Response.json({ msg: 'world' }))

serve(app, { port: 3000 })
```

```ts
// src/client.ts —— 与模式 A 的唯一差异：hydrate: true（收养服务端 HTML，无闪跳）
import { createApp, router, RouteView } from 'weifuwu/client'
import { routes } from './routes.tsx'

createApp().use(router({ routes })).mount('#root', RouteView, { hydrate: true })
```

### 启动（两种模式都一样）

```json
// package.json —— 服务端直接跑 .tsx（零构建）
{ "scripts": { "dev": "node --import weifuwu/dev server.ts" } }
```

- 访问页面：SPA 客户端渲染；SSR 页面内容直接进 HTML（`curl /` 可见，SEO）
- 改组件刷新即生效，无需构建步骤
- 完整可运行示例见 `apps/demo`（博客页 = SSR + Hydration，SPA 页 = 纯客户端）

> 想**零后端、零构建**最快跑起来？直接跳到下面的「CDN 快速原型」。

---

## CDN 快速原型（零构建、纯 HTML）

不需要 Node.js 或构建工具，直接在浏览器中用 CDN 使用 weifuwu。创建一个 `.html` 文件即可开始，适合快速原型、Codepen、简单的演示页面。

```html
<!-- cdn-counter.html -->
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Weifuwu CDN 示例</title>

  <!-- 组件样式（可选，如只用 weifuwu/client 则不需要） -->
  <link
    rel="stylesheet"
    href="https://unpkg.com/weifuwu@latest/dist/components/style.css"
  />
</head>
<body>
  <div id="root"></div>

  <!-- Import Map — 将 weifuwu 包名映射到 CDN 地址 -->
  <script type="importmap">
    {
      "imports": {
        "weifuwu/client": "https://unpkg.com/weifuwu@latest/dist/client/index.js",
        "weifuwu/components": "https://unpkg.com/weifuwu@latest/dist/components/index.js"
      }
    }
  </script>

  <script type="module">
    import { createApp, h } from 'weifuwu/client'
    import { Card, Button, Badge } from 'weifuwu/components'

    // 组件 = (initProps, ctx) => (props) => VNode
    const Counter = (_props, ctx) => {
      const $ = ctx.ui.$()
      $.count = 0 // mount 初始化

      return () =>
        h(Card, { variant: 'default', padding: 'lg' },
          h('h2', { style: { textAlign: 'center', margin: 0 } }, '⚡ Weifuwu'),
          h('div', { style: { fontSize: '4rem', fontWeight: 600, textAlign: 'center' } },
            String($.count)),
          h('div', { style: { textAlign: 'center', marginTop: '1rem' } },
            h(Badge, {
              variant: $.count % 2 === 0 ? 'success' : 'warning'
            }, $.count % 2 === 0 ? '偶数' : '奇数')),
          h('hr', { style: { margin: '1rem 0', border: 'none', borderTop: '1px solid #eee' } }),
          h('div', { style: { display: 'flex', gap: '0.5rem', justifyContent: 'center' } },
            h(Button, { variant: 'secondary', onClick: () => $.count-- }, '➖ 减 1'),
            h(Button, { variant: 'danger', onClick: () => $.count = 0 }, '↺ 重置'),
            h(Button, { variant: 'primary', onClick: () => $.count++ }, '➕ 加 1'),
          ),
        )
    }

    createApp().mount('#root', Counter)
  </script>
</body>
</html>
```

将此 HTML 保存到本地用浏览器打开即可运行。完整的 CDN 示例见 [`apps/html/test.html`](./apps/html/test.html)。

### CDN 资源地址说明

| 资源 | CDN 地址 | 说明 |
|------|---------|------|
| `weifuwu/client` | `https://unpkg.com/weifuwu@latest/dist/client/index.js` | 客户端核心（createApp, h, 路由, 状态管理等） |
| `weifuwu/components` | `https://unpkg.com/weifuwu@latest/dist/components/index.js` | 43 个 UI 组件（Button, Card, Table, Modal 等） |
| 组件样式 | `https://unpkg.com/weifuwu@latest/dist/components/style.css` | 组件 CSS + 91 个主题 Token + 35 个布局原语 |
| 独立布局系统 | `https://unpkg.com/weifuwu@latest/dist/layout/weifuwu-layout.css` | 仅 CSS 布局，不依赖 JS |


---

## 模块总览

| 导入路径 | 模块 | 用途 | 依赖 |
|---------|------|------|------|
| `weifuwu` | **Router** | Trie 路由 + 中间件链 + WebSocket + GraphQL | — |
| `weifuwu` | **serve** | HTTP 服务器 | Router |
| `weifuwu` | **cors** | CORS 跨域中间件 | Router |
| `weifuwu` | **serveStatic** | 静态文件服务（ETag/304/目录索引） | Router |
| `weifuwu` | **postgres** | PostgreSQL 客户端（自研 PG v3 协议）→ `ctx.sql` | Router, DATABASE_URL |
| `weifuwu` | **redis** | Redis 客户端（自研 RESP2 协议）→ `ctx.redis` | Router, REDIS_URL |
| `weifuwu` | **ui** | SSR 渲染 + esbuild JS/CSS 动态编译 → `ctx.ui` | Router |
| `weifuwu` | **uiSsr** | 路由级 SSR：匹配 routes → 自动完整 HTML + `__DATA__` + bundle | Router, ui |
| `weifuwu` | **rateLimit** | 限流中间件（fixed/sliding，redis 多实例原子）→ `ctx.limit` | Router, redis |
| `weifuwu` | **email** | 邮件发送（Resend/SMTP 自研/自定义适配器）→ `ctx.email` | Router |
| `weifuwu` | **userSystem** | 用户系统（scrypt 密码哈希 + 混合会话）→ `ctx.user` / `ctx.auth` + `/api/auth/*` | Router, postgres |
| `weifuwu` | **queue** | 可靠任务队列（Redis Streams，at-least-once + DLQ）→ `ctx.queue` | Router, redis |
| `weifuwu` | **ai** | LLM 对话（自研 OpenAI 兼容协议 + 自研 SSE 解码，默认 DeepSeek）→ `ctx.ai` + `aiStream` | Router |
| `weifuwu/dev` | **dev loader** | Node loader：服务端直接跑 `.ts/.tsx`（`--import weifuwu/dev`） | esbuild |
| `weifuwu` | **graphql** | GraphQL 端点（支持 GraphiQL） | Router |
| `weifuwu` | **createMiddleware** | 类型安全中间件工厂 | — |
| `weifuwu` | **ok / badRequest / …** | HTTP 响应辅助函数（ok/badRequest/... 等 12 个） | — |
| `weifuwu` | **parseBody** | JSON 请求体安全解析 | — |
| Router 方法 | **app.graphql()** | GraphQL 端点（支持 GraphiQL），Router 实例方法（无需单独 import） | Router |
| `weifuwu/client` | **createApp** | 应用引导 + VDOM 渲染引擎 | — |
| `weifuwu/client` | **router / RouteView** | 前端路由（history/hash 模式） | createApp |
| `weifuwu/client` | **asyncComponent** | async 工厂组件（形态 C）：工厂层声明数据，mount/render 同步 | — |
| `weifuwu/client` | **ctx.data** | 数据管道：SSR 预取 / hydration 命中 / SPA fetch（`ctx.data.get`） | createApp |
| `weifuwu/client` | **api / auth / ws** | HTTP 客户端 / 认证 / WebSocket 中间件 | createApp |
| `weifuwu/client` | **i18n** | 国际化中间件（运行时切换语言） | createApp |
| `weifuwu/client` | **ErrorBoundary** | 错误边界组件 | createApp |
| `weifuwu/client` | **lockScroll/trapFocus** | 滚动锁定 / 焦点陷阱工具 | — |
| `weifuwu/client` | **popup** | 弹层 fixed 定位工具（`computeFixedPos` / `computeFixedPosRect`） | — |
| `weifuwu/components` | **43 个组件** | Button/Table/Modal/Confirm/Toast/... + `confirm()` / `toast()` 命令式中间件 | weifuwu/client |
| `weifuwu/layout` | **CSS 布局** | 35 个布局原语 + 91 个主题 Token（也支持 `weifuwu/layout/style.css`） | — |

---

## 核心概念

### 两阶段组件（新手必读：为什么是两层）

组件 = `(initProps, ctx) => (props) => VNode`——**外层 = 初始化（只执行一次），内层 = 渲染（每次状态/props 变化时执行）**。类比：外层是对象的构造函数，内层是它的 render 方法。

```tsx
const Counter = (_init, ctx) => {
  // 外层（mount）：只跑一次——初始化状态、订阅、定时器
  const $ = ctx.ui.$()
  $.count = 0
  return (props) =>
    // 内层（render）：每次变化执行——读状态输出视图
    <button onClick={() => $.count++}>{$.count}</button>
}
```

> 为什么不是单层函数（React 风格）？单层函数每次渲染都执行整个函数体，需要 hooks 记忆机制来区分"初始化"和"渲染"；两阶段用**位置即语义**——外层天生只跑一次，没有 hooks 规则、没有依赖数组、没有闭包陷阱。
> 异步数据用 `asyncComponent` 工厂（见下文）：`async (ctx) => await ctx.data.get(...)` → 返回两阶段组件，数据经闭包注入。

### 中间件模式（前后端一致）

```
后端:  app.use(cors())
       app.use(postgres())
       app.get('/users', (req, ctx) => { ctx.sql`SELECT *` })
       // ctx 已注入 ctx.sql

前端:  createApp()
         .use(api({ baseURL: '/api' }))
         .use(auth())
         .mount('#root', App)
       // ctx 已注入 ctx.api, ctx.auth
```

### 状态管理

| 模式 | 后端 | 前端 |
|------|------|------|
| 注入 | 中间件注入 ctx.field | 中间件注入 ctx.field |
| 读取 | handler 读取 ctx | 组件读取 ctx |
| 渲染 | 返回 Response | `ctx.ui.render()` / `ctx.ui.dirty()` / `$.x = val` 触发局部 VDOM patch |

### Closeable 接口

所有有状态模块（postgres、redis）实现 `close(): Promise<void>`，serve 关闭时自动调用。

---

# 后端 API (`weifuwu`)

> 以下为完整 API 参考，按需查阅。新手建议先阅读上文的「核心概念」和「快速开始」。

## Router

Trie 路由，支持 URL 参数、通配符、中间件链、WebSocket、GraphQL。

```ts
import { Router } from 'weifuwu'

const app = new Router()
```

### 路由方法

每个路由方法接受 `path, ...middlewares[], handler`：

```ts
app.get('/users', handler)
app.post('/users', handler)
app.put('/users/:id', handler)
app.patch('/users/:id', handler)     // PATCH
app.delete('/users/:id', handler)    // DELETE
app.head('/users', handler)          // HEAD
app.options('/users', handler)       // OPTIONS
app.all('/users', handler)           // 所有 HTTP 方法
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `path` | `string` | 路由路径，支持 `:param` 和 `*` 通配符 |
| `...middlewares` | `Middleware[]` | 路由级中间件（可选） |
| `handler` | `Handler` 或 `Router` | 处理器或子路由器 |

### 路由级中间件

```ts
declare module 'weifuwu' { interface Context { auth: { userId: string } } }

const requireAuth: Middleware = (req, ctx, next) => {
  if (!req.headers.get('authorization')) return new Response('Unauthorized', { status: 401 })
  ;(ctx as any).auth = { userId: '123' }
  return next(req, ctx)
}

app.get('/users/:id', requireAuth, (req, ctx) => {
  return Response.json({ id: ctx.params.id, auth: ctx.auth })
})
```

### 参数与查询

```ts
app.get('/posts/:category/:slug', (req, ctx) => {
  ctx.params.category  // URL 参数
  ctx.params.slug      // URL 参数
  ctx.query.page       // 查询参数 ?page=1
  return Response.json(ctx.params)
})
```

### 通配符

```ts
app.get('/files/*', (req, ctx) => {
  ctx.params['*']  // 剩余路径 "a/b/c.txt"
  return Response.json({ path: ctx.params['*'] })
})
```

### 子路由挂载

```ts
const users = new Router()
users.get('/', listUsers)
users.get('/:id', getUser)

app.mount('/api/users', users)
// → GET /api/users, GET /api/users/:id
```

### 插件模式

```ts
app.plugin(app => {
  app.get('/health', () => Response.json({ ok: true }))
  app.use(cors())
})
```

### 类型安全中间件工厂

```ts
import { createMiddleware } from 'weifuwu'
declare module 'weifuwu' { interface Context { greeting: string } }

const greet = createMiddleware({
  injects: ['greeting'],           // 注入的 ctx 字段
  depends: ['sql'],                // 前置依赖（可选）
  setup: async (ctx) => ({
    greeting: 'Hello ' + ctx.params.name
  }),
})

app.use(greet)
app.get('/hello/:name', (req, ctx) => Response.json({ msg: ctx.greeting }))
```

`createMiddleware` 自动生成 `__meta` 元数据用于运行时依赖检查。

### 查看路由表

```ts
console.log(app.routes())
// → [
//   "GET      /users",
//   "POST     /users",
//   "WS       /chat",
//   "MIDDLEWARE  [2 global]"
// ]
```

### 路由方法速查

| 方法 | 说明 |
|------|------|
| `app.get(path, ...mws, handler)` | GET |
| `app.post(path, ...mws, handler)` | POST |
| `app.put(path, ...mws, handler)` | PUT |
| `app.patch(path, ...mws, handler)` | PATCH |
| `app.delete(path, ...mws, handler)` | DELETE |
| `app.head(path, ...mws, handler)` | HEAD |
| `app.options(path, ...mws, handler)` | OPTIONS |
| `app.all(path, ...mws, handler)` | 任意方法 |
| `app.use(mw)` | 全局中间件 |
| `app.ws(path, ...mws, handler)` | WebSocket |
| `app.graphql(path?, handler)` | GraphQL |
| `app.mount(path, subRouter)` | 挂载子路由 |
| `app.plugin(fn)` | 插件扩展现有 Router |
| `app.onError(handler)` | 全局错误处理 |
| `app.wsHub(hub)` | 注入自定义 Hub（多进程 WebSocket） |
| `app.onClose(closeable)` | 注册关闭回调 |
| `app.routes()` | 打印路由表 |
| `app.close()` | 关闭所有注册的 Closeable 资源 |

---

## serve — HTTP 服务器

```ts
import { serve, Router } from 'weifuwu'

const app = new Router()
const server = serve(app, { port: 3000 })

// 等待就绪
await server.ready
console.log(server.port) // 实际端口

// 停止
await server.close()
// 或
await server.stop(2000)  // 超时毫秒
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `port` | `number` | `0`（随机） | 监听端口 |
| `hostname` | `string` | `'0.0.0.0'` | 监听地址 |
| `signal` | `AbortSignal` | — | 通过信号停止 |
| `maxBodySize` | `number` | `10MB` | 请求体上限（0=无限） |
| `timeout` | `number` | `30000` | Socket 超时（ms） |
| `keepAliveTimeout` | `number` | `5000` | Keep-Alive 超时 |
| `headersTimeout` | `number` | `6000` | 请求头超时 |
| `shutdown` | `boolean` | `true` | 自动注册 SIGTERM/SIGINT |

| 属性/方法 | 类型/签名 | 说明 |
|-----------|----------|------|
| `server.port` | `number` | 实际监听端口（未就绪时 0） |
| `server.hostname` | `string` | 监听地址 |
| `server.ready` | `Promise<void>` | 服务器就绪 |
| `server.close(timeoutMs?)` | `() => Promise<void>` | 优雅关闭 |
| `server.stop(timeoutMs?)` | `() => Promise<void>` | `close` 别名 |

`sig-server` 自动注册 SIGTERM/SIGINT → `server.closeAllConnections()` → `router.close()` → `process.exit(0)`。

---

## cors — CORS 中间件

```ts
import { cors } from 'weifuwu'

// 默认：允许所有来源
app.use(cors())

// 自定义
app.use(cors({
  origin: 'https://app.example.com',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  exposedHeaders: ['X-Total-Count'],
  maxAge: 86400,
}))
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `origin` | `string \| string[] \| (origin) => string` | `'*'` | `credentials: true` 时自动回显请求 origin |
| `methods` | `string[]` | `GET,HEAD,PUT,PATCH,POST,DELETE` | 允许的方法 |
| `allowedHeaders` | `string[]` | `Content-Type, Authorization` | 允许的请求头 |
| `exposedHeaders` | `string[]` | — | 暴露的响应头 |
| `credentials` | `boolean` | — | 是否允许凭据 |
| `maxAge` | `number` | — | 预检缓存秒数 |

---

## serveStatic — 静态文件服务

```ts
import { serveStatic } from 'weifuwu'

// 作为全局中间件（未匹配到文件时走下一个中间件）
app.use(serveStatic('./public'))

// 或挂载到特定路径
app.get('/assets/*', serveStatic('./assets', {
  index: 'index.html',
  maxAge: 31536000,
  immutable: true,
}))
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `index` | `string` | `'index.html'` | 目录索引文件名 |
| `maxAge` | `number` | `0` | Cache-Control max-age（秒） |
| `immutable` | `boolean` | — | 添加 `immutable` 指令（需 maxAge） |

特性：
- ETag/304 缓存协商（`if-none-match` + `if-modified-since`）
- MIME 类型自动检测（支持 30+ 扩展名）
- 目录遍历保护（`..` / symlink 逃逸 → 403）
- 目录自动跳转到 index 文件

---

## postgres — PostgreSQL 客户端（自研）

> **自研 PG v3 协议**（零第三方依赖）——支持 SCRAM-SHA-256 认证、扩展查询（参数化）、类型映射（int8 超范围自动 string 防丢精度）、事务、连接池（acquire 超时防饿死）、schema 写前校验、statement_timeout 慢查询保护。

```ts
import { postgres } from 'weifuwu'

// 注入 ctx.sql（懒连接池）
app.use(postgres())

// ① tagged template —— 插值自动参数化（防注入）
app.get('/users', async (req, ctx) => {
  const users = await ctx.sql`SELECT * FROM users WHERE id = ${ctx.params.id}`
  return Response.json(users)
})

// ② jsonb 对象直传——自动序列化，不再有双重编码/parseRow 样板
app.post('/decks', async (req, ctx) => {
  const deck = await req.json()
  await ctx.sql`INSERT INTO decks (title, deck_json) VALUES (${deck.title}, ${deck})`
  // 读回来自动是对象：rows[0].deck_json === { slides: [...] }（不是字符串）
})

// ③ 事务（postgres.js 兼容 begin）
app.post('/transfer', async (req, ctx) => {
  await ctx.sql.begin(async sql => {
    await sql`UPDATE accounts SET balance = balance - 100 WHERE id = 1`
    await sql`UPDATE accounts SET balance = balance + 100 WHERE id = 2`
  })
})
```

### 类型映射（自动）

| 数据库类型 | 返回 JS 类型 |
|-----------|-------------|
| json / jsonb | `object`（自动 JSON.parse） |
| int2 / int4 / int8（安全范围内） | `number` |
| **int8（超出安全范围）** | **`string`**（防静默丢精度，金额/ID 关键） |
| float / numeric | `number` |
| boolean | `boolean` |
| text / varchar / uuid / date | `string` |
| NULL | `null` |

### 类型层（查询泛型 + schema 写前校验）

```ts
// ① 查询结果泛型（编译期类型，无需手写 interface + 断言）
interface Deck { id: number; title: string; deck_json: { slides: unknown[] } }
const decks = await ctx.sql.query<Deck>('SELECT id, title, deck_json FROM decks')

// ② schema 注册 → insert 写前校验（脏数据源头拦截）
ctx.sql.register('decks', {
  title: { type: 'text', required: true },
  status: { type: 'enum', values: ['outline', 'ready'] },
  deck_json: { type: 'jsonb' },
})
await ctx.sql.insert('decks', { title: 'x', status: 'INVALID' }) // → ValidationError
```

### 方法面

| 方法 | 说明 |
|------|------|
| `ctx.sql\`...\`` | tagged template → 参数化查询（插值=参数，表名需硬编码） |
| `ctx.sql.query<T>(sql, params?)` | 参数化查询 + 泛型 |
| `ctx.sql.unsafe(sql, params?)` | 原生 SQL（DDL / 动态表名） |
| `ctx.sql.begin(fn)` | 事务（回调收到 tagged template sql） |
| `ctx.sql.transaction(fn)` | 事务（回调收到 `{ query }`） |
| `ctx.sql.register(table, schema)` | 注册表结构（写前校验） |
| `ctx.sql.insert(table, row)` | schema 校验 + 参数化插入 |
| `ctx.sql\`...\` 内嵌片段` | 条件 SQL 片段（嵌套过滤，参数自动重编号） |
| `ctx.sql.close()` | 关闭连接池 |

### 条件片段（嵌套过滤）

```ts
const status = req.query.status // 可能为空
const rows = await ctx.sql`
  SELECT * FROM orders WHERE amount > ${100}
    ${status ? ctx.sql`AND status = ${status}` : ctx.sql``}
`
// 空片段内联为空，参数自动重编号——同一 SQL 无论条件多少都安全参数化
```

### 选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `connection` | `string` | `DATABASE_URL` | 连接字符串 |
| `max`（或 `poolSize`） | `number` | `10` | 连接池大小 |
| `acquireTimeoutMs` | `number` | `30000` | 池全忙时 acquire 超时（防饿死，0=无限） |
| `statementTimeoutMs`（或 `statementTimeout`） | `number` | `0` | 语句超时（慢查询保护，0=禁用） |
| `onQuery` | `(sql, durationMs, rowCount) => void` | — | 查询观测钩子（慢查询日志/审计） |

### 幂等迁移（内置）

`postgres()` 返回的中间件自带迁移跟踪（`_weifuwu_migrations` 表），模块启动时检查-执行-记录三步幂等：

```ts
const db = postgres()
await db.migrate()        // ① 建迁移跟踪表（幂等）

if (!(await db.isMigrated('users'))) {       // ② 检查是否已迁移
  await db.sql.unsafe(`CREATE TABLE users (...)`)
  await db.markMigrated('users')             // ③ 记录（幂等，重复调用无害）
}

app.use(db)
```

> 多副本部署时天然安全：`markMigrated` 用 `ON CONFLICT DO NOTHING`，两个实例同时迁移也不会重复执行。

### 错误映射（自动）

`ctx.sql` 查询错误自动映射为 `HttpError`，业务无需手写 catch：

| 错误码 | 含义 | HTTP |
|--------|------|------|
| `23505` | 唯一约束冲突 | **409** |
| `23503` / `23502` / `23514` | 外键 / 非空 / 检查约束 | **400** |
| `22P02` / `22003` | 类型 / 数值错误 | **400** |

> 未映射的错误码原样抛出（带 `code` 属性，如 `42P01` 表不存在）。

> **裁剪声明**：逻辑复制 / 大对象 / 显式游标 / 二进制 COPY 不支持（明确抛 `ProtocolError('unsupported')`，而非静默出错）。

---

## redis — Redis 客户端（自研）

> **自研 RESP2 协议**（零第三方依赖）——连接/重连（断线 pending 拒绝、指数退避）/离线队列/管道/Pub-Sub（订阅断线自动重放）+ 消除 ioredis 高频痛点（TTL 参数顺序、JSON 手动序列化、缓存样板）。**二进制安全**：`getBuffer(key)` 原样返回字节（缓存序列化 payload 不损坏）。

```ts
import { redis } from 'weifuwu'

app.use(redis())

// ① TTL 安全 —— 直接传秒，不会写错
app.post('/cache/:key', async (req, ctx) => {
  const { value } = await req.json()
  await ctx.redis.set(ctx.params.key, value, 3600)  // ioredis 要 set(k, v, 'EX', 3600)
})

// ② JSON 零样板 —— 自动序列化（AI 缓存场景）
app.get('/cache/:key', async (req, ctx) => {
  const val = await ctx.redis.jsonGet(ctx.params.key)  // 自动 JSON.parse
  return Response.json(val ?? { miss: true })
})

// ③ 缓存便捷 —— 读-算-写一体，null 不缓存（防穿透）
app.get('/llm/:id', async (req, ctx) => {
  const result = await ctx.redis.cache(`llm:${ctx.params.id}`, async () => {
    return await generateLLM(ctx.params.id)  // miss 才执行
  }, 3600)
  return Response.json(result)
})

// ④ Pub/Sub —— 发布用 ctx.redis，订阅用独立连接（回调式，断线自动重连恢复订阅）
app.post('/events', async (req, ctx) => {
  await ctx.redis.publish('events', JSON.stringify({ type: 'deck.created' }))
})

const sub = ctx.redis.createSubscriber()
await sub.connect()
await sub.subscribe('events', (channel, message) => {
  // 收到实时消息
})
await sub.psubscribe('jobs:*', (channel, message) => {
  // 模式匹配订阅
})

// ⑤ 任意命令透传 + keyPrefix 隔离
await ctx.redis.command('LRANGE', 'list', '0', '-1')

app.use(redis({ keyPrefix: 'api:' }))  // 之后所有 key 自动加前缀
await ctx.redis.set('user', 1)         // 实际写入 'api:user'
```

### 方法面

| 方法 | 说明 |
|------|------|
| `get / set(key, val, ttl?) / del / incr / expire / ttl` | 基础命令（set 直接传秒） |
| `jsonGet / jsonSet(key, val, ttl?)` | JSON 自动序列化 |
| `cache(key, fn, ttl)` | 缓存读-算-写（null 不缓存防穿透） |
| `publish(channel, msg)` | Pub-Sub 发布 |
| `createSubscriber()` | 独立订阅连接（`subscribe`/`psubscribe` 回调式） |
| `command(name, ...args)` | 底层命令透传 |
| `close()` | 关闭连接池 |

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `url` | `string` | `REDIS_URL` 环境变量 | 连接字符串 |
| `poolSize` | `number` | `5` | 连接池大小 |
| `keyPrefix` | `string` | `''` | 所有 key 自动加前缀（多应用隔离） |

> **裁剪声明**：集群（MOVED 路由）/ 哨兵 / 自动管道不支持（standalone 优先）。

---

## ui — SSR 渲染 + JS/CSS 编译

```ts
import { ui } from 'weifuwu'

app.use(ui())
```

| ctx 注入 | 签名 | 说明 |
|----------|------|------|
| `ctx.ui.html` | `` (strings, ...values) => Response `` | HTML 模板 (转义防 XSS) |
| `ctx.ui.html.unsafe(str)` | `(string) => string` | 插入原始 HTML |
| `ctx.ui.js(entryPath)` | `(string) => Promise<Response>` | esbuild 编译 TSX → JS bundle |
| `ctx.ui.css(entryPath)` | `(string) => Promise<Response>` | 读取 CSS 文件 → CSS Response（如安装 postcss + @tailwindcss/postcss 则自动编译） |
| `ctx.ui.ssr(Comp, props?, { data })` | `(Component, props, opts?) => Promise<string>` | 服务端渲染组件 → HTML 片段（async 工厂自动 await；HtmlSafe 内联不二次转义） |
| `ctx.ui.ssrData(data)` | `(Map) => string` | 序列化 SSR 数据 → `<script>window.__DATA__=...</script>`（`<` 转义防 XSS） |

### ctx.ui.html — HTML 模板

模板插值自动转义（`& < > "` → 实体），防 XSS：

```ts
app.get('/page', (req, ctx) => ctx.ui.html`
  <h1>${title}</h1>          <!-- 自动转义 -->
  <div>${ctx.ui.html.unsafe(richHtml)}</div>  <!-- 不转义 -->
`)
```

### ctx.ui.js — 编译 TSX → JS

```ts
app.get('/app.js', (req, ctx) => ctx.ui.js('./src/main.tsx'))   // 相对路径
app.get('/app.js', (req, ctx) => ctx.ui.js('weifuwu/client'))   // 或包名
```

使用 esbuild 编译：
- `bundle: true`, `format: 'esm'`, `platform: 'browser'`
- `jsx: 'automatic'`, `jsxImportSource: 'weifuwu/client'`
- 带 mtime 缓存验证（开发时编辑文件后自动失效）

### ctx.ui.css — CSS 编译

```ts
app.get('/style.css', (req, ctx) => ctx.ui.css('./src/style.css'))               // 相对路径
app.get('/style.css', (req, ctx) => ctx.ui.css('weifuwu/components/style.css'))   // 或包名
```

- 无编译工具时直接返回原始 CSS
- 检测到已安装 `postcss` + `@tailwindcss/postcss` 时自动编译 Tailwind CSS
- 支持包名（`weifuwu/layout/style.css`, `weifuwu/components/style.css`）或文件路径
- 带 mtime 缓存验证（开发时编辑文件后自动失效）

### ctx.ui.ssr — SSR 渲染组件 → HTML

将组件（含 async 工厂组件）在服务端渲染为完整 HTML 片段，数据经 `ctx.data` 预取并序列化进 `window.__DATA__`（客户端 hydration 时同步命中，不重跑请求）：

```ts
const BlogPage = asyncComponent(async (ctx) => {
  const post = await ctx.data.get(`/api/posts/${ctx.params.slug}`, fetchPost)
  return (_init, ctx) => () =>
    h('article', {},
      h('h1', {}, post.title),
      h('div', { innerHTML: post.body }),
    )
})

app.get('/blog/:slug', async (req, ctx) => {
  const data = new Map()
  const html = await ctx.ui.ssr(BlogPage, {}, { data })   // HtmlSafe：模板内联不二次转义
  return ctx.ui.html`
    <!DOCTYPE html>
    <html><body>
      <div id="root">${html}</div>
      ${ctx.ui.ssrData(data)}
      <script src="/static/app.js"></script>
    </body></html>
  `
})
```

- 事件处理器/ref 剥离，文本自动转义（XSS），`class`/`style` 对象序列化，`innerHTML` 原样输出
- Fragment/Portal 子节点就地内联
- `ctx.ui.ssrData(data)` 输出 `<script>window.__DATA__=...</script>`（JSON `<` 转义防 XSS）
- 服务端 ctx shim：`$`（dirty no-op）、`ctx.data` 预取去重、`selfId` 请求级隔离

### Hydration — 客户端收养服务端 HTML

服务端 HTML + `window.__DATA__`（ctx.data 种子）到达客户端后，`mount(..., { hydrate: true })` **收养现有 DOM**（不重建、不闪跳），只接线事件/ref/$：

```ts
import { createApp } from 'weifuwu/client'

createApp()
  .mount('#root', BlogPage, { hydrate: true })   // 容器已有服务端 HTML
```

- **游标收养**：元素/文本按位置匹配现有 DOM；tag 不匹配 → 局部替换；文本不一致 → 就地修正；服务端多余节点 → 收尾清理
- **async 工厂 hydration**：工厂 `ctx.data.get` 从 `__DATA__` 同步命中（不重跑请求）→ 渲染与服务端一致 → 收养
- hydration 后 `$`/dirty/事件全量可用（与纯 SPA 无差别）
- 诚实裁剪：Portal 内容就地收养（不移动到 `#__wf_portal`）；渲染期非确定性（Date/random）会导致 mismatch（dev 警告）

### uiSsr — 路由级 SSR（声明即渲染）

共享路由定义，前后端同一份声明——后端匹配即自动 SSR，无需手写 handler/模板/序列化：

```tsx
// routes.tsx —— 前后端共用
import type { RouteDef } from 'weifuwu/client'
import { BlogPage } from './pages/BlogPage.tsx'

export const routes: RouteDef[] = [
  { path: '/blog/:slug', component: BlogPage, title: '博客' },
]

// server.ts —— 一行中间件：GET 匹配 → 注入 ctx.route.params → await 组件工厂 → 完整 HTML + __DATA__ + bundle
import { uiSsr } from 'weifuwu'
app.use(uiSsr({ routes, bundle: '/static/blog.js' }))

// blog-hydrate.ts —— 客户端：同一份 routes，router() 注入 ctx.route.params（两端同源）
createApp()
  .use(router({ routes }))
  .mount('#root', routes[0].component, { hydrate: true })
```

- 组件工厂读 `ctx.route.params`（`/blog/:slug` → `ctx.route.params.slug`）——后端 uiSsr / 前端 router **同源注入**
- 未匹配 → next()（交给 API/静态/404）；非 GET → next()
- 可自定义 `title` / `template`

### weifuwu/dev — 服务端直接跑 .tsx

Node 原生 TS 只剥离类型（不支持 JSX）。`weifuwu/dev` 注册 esbuild loader，服务端直接跑 `.tsx`（零构建）：

```json
{
  "scripts": {
    "dev": "node --import weifuwu/dev server.ts",
    "start": "node --import weifuwu/dev server.ts"
  }
}
```

- 前后端同一 JSX 运行时（`jsxImportSource: weifuwu/client`）→ 两端 VNode 一致 → hydration 可靠
- 与 `ctx.ui.js` 前端动态编译同一理念：无构建、无产物、改代码即生效

---

## graphql — GraphQL 端点

> **SDL + resolvers 绑定为自研实现**（`makeExecutableSchema`，56 行替代 @graphql-tools/schema）——支持根类型与嵌套类型字段 resolver、默认属性查找。

```ts
import type { GraphQLHandler } from 'weifuwu'

const handler: GraphQLHandler = async (req, ctx) => ({
  schema: `
    type Query {
      hello: String
      users: [User]
    }
    type User { id: ID, name: String }
  `,
  resolvers: {
    Query: {
      hello: () => 'world',
      users: () => [{ id: 1, name: 'Alice' }],
    },
  },
  rootValue: {},
  context: (req, ctx) => ({ user: ctx.user }),
  graphiql: true,
  maxDepth: 10,
  timeout: 30000,
})

// 挂载到 /
app.graphql(handler)

// 或挂载到自定义路径
app.graphql('/graphql', handler)
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `schema` | `string \| GraphQLSchema` | — | SDL 字符串或 Schema 对象 |
| `resolvers` | `any` | — | 解析器（schema 为字符串时必填）|
| `rootValue` | `any` | — | 根值 |
| `context` | `(req, ctx) => object` | — | 上下文工厂 |
| `graphiql` | `boolean` | — | 启用 GraphiQL IDE |
| `maxDepth` | `number` | `10` | 查询深度限制（0=关闭）|
| `timeout` | `number` | `30000` | 执行超时（ms，0=关闭）|

GET 请求支持 query 参数查询；POST 支持 JSON body。启用 `graphiql: true` 时，GET 无 `?query=` 参数返回 GraphiQL IDE 页面。

---

## WebSocket

```ts
app.ws('/chat/:room', {
  open(ws, ctx) {
    ws.send(`欢迎加入 ${ctx.params.room} 房间`)
    ctx.hub?.join(ctx.params.room, ws)
  },
  message(ws, ctx, data) {
    // data: string | Buffer
    ctx.hub?.send(ctx.params.room, `用户: ${data}`)
  },
  close(ws, ctx) {
    ctx.hub?.leave(ws)
  },
  error(ws, ctx, error) {
    console.error('WS error:', error)
  },
})
```

| 回调 | 参数 | 说明 |
|------|------|------|
| `open(ws, ctx)` | `WebSocket`, `Context` | 连接建立 |
| `message(ws, ctx, data)` | `WebSocket`, `Context`, `string \| Buffer` | 收到消息 |
| `close(ws, ctx)` | `WebSocket`, `Context` | 连接关闭 |
| `error(ws, ctx, error)` | `WebSocket`, `Context`, `Error` | 错误 |

### Hub — WebSocket 房间

```ts
// 注入 hub → ctx.hub
app.ws('/chat/:room', {
  open(ws, ctx)  { ctx.hub.join(ctx.params.room, ws) },
  message(ws, ctx, data) { ctx.hub.send(ctx.params.room, String(data)) },
  close(ws, ctx) { ctx.hub.leave(ws) },
})

// 自定义 Hub（Redis 后端）
import type { Hub } from 'weifuwu'
const redisHub: Hub = { ... }
app.wsHub(redisHub)
```

| Hub 方法 | 说明 |
|----------|------|
| `join(key, ws)` | WebSocket 加入房间 |
| `leave(ws)` | WebSocket 离开所有房间 |
| `send(key, message)` | 向房间广播消息 |
| `close()` | 关闭 Hub |

WebSocket 原生 `ws.send()` 发送，`ws.on('message', cb)` WebSocket 接收。

---

## HttpError — HTTP 错误

```ts
import { HttpError } from 'weifuwu'

app.get('/secure', () => {
  if (!condition) throw new HttpError('Forbidden', 403)
  // serve() 自动捕获并返回对应状态码
})
```

| API | 说明 |
|-----|------|
| `new HttpError(msg, status)` | 创建 HTTP 错误，name = 'HttpError' |
| `DEFAULT_MAX_BODY` | `10 * 1024 * 1024` (10MB) |

---

## 响应辅助函数

> 以下为完整 API 参考，按需查阅。四个 SaaS 地基模块（rateLimit / email / userSystem / queue）见文末「SaaS 地基模块」章节。

消除 `Response.json(...)` 重复模式：

```ts
import { ok, created, noContent, badRequest, unauthorized, forbidden, notFound, conflict, unprocessable, tooManyRequests, serverError, redirect } from 'weifuwu'

app.get('/users/:id', async (req, ctx) => {
  const user = await findUser(ctx.params.id)
  if (!user) return notFound('用户不存在')
  return ok(user)
})

app.post('/users', async (req, ctx) => {
  const body = await parseBody(req)
  const user = await createUser(body)
  return created(user)
})
```

| 函数 | 状态码 | Content-Type |
|------|--------|-------------|
| `ok(data, init?)` | 200 | `application/json` |
| `created(data, init?)` | 201 | `application/json` |
| `noContent(init?)` | 204 | — |
| `badRequest(msg?)` | 400 | `application/json` |
| `unauthorized(msg?)` | 401 | `application/json` |
| `forbidden(msg?)` | 403 | `application/json` |
| `notFound(msg?)` | 404 | `application/json` |
| `conflict(msg?)` | 409 | `application/json` |
| `unprocessable(msg?)` | 422 | `application/json` |
| `tooManyRequests(msg?)` | 429 | `application/json` |
| `serverError(msg?)` | 500 | `application/json` |
| `redirect(url, status?)` | 302 (默认) | — |

---

## parseBody — 请求体解析

```ts
import { parseBody } from 'weifuwu'

app.post('/users', async (req, ctx) => {
  const body = await parseBody<{ name: string; email: string }>(req)
  // JSON 解析失败自动 throw HttpError(400)
  return ok(body)
})
```

| 行为 | 说明 |
|------|------|
| JSON 格式正确 | 返回解析后的数据 |
| JSON 格式错误 | `throw new HttpError('Invalid JSON body', 400)` |
| GET/HEAD 请求 | 返回 `{}` |

---

## 后端类型

```ts
import type { Context, Handler, Middleware, ErrorHandler, User, Closeable } from 'weifuwu'
import type { HttpError } from 'weifuwu'
import type { ServeOptions, Server } from 'weifuwu'
import type { Hub, WebSocketHandler } from 'weifuwu'
import type { WebSocket } from 'weifuwu'
import type { CORSOptions } from 'weifuwu'
import type { ServeStaticOptions } from 'weifuwu'
import type { PostgresOptions, PostgresClient, PostgresInjected } from 'weifuwu'
import type { RedisOptions, RedisClient, RedisInjected } from 'weifuwu'
import type { GraphQLOptions, GraphQLHandler } from 'weifuwu'
```

| 类型 | 签名 | 说明 |
|------|------|------|
| `Context` | `interface` | `{ params, query, mountPath, user, loaderData?, env?, [key]: unknown }` |
| `Handler<T>` | `(req: Request, ctx: T) => Response \| Promise<Response>` | 请求处理器 |
| `Middleware<In, Out>` | `(req, ctx: In, next) => Response` | 中间件，含 `__meta` |
| `ErrorHandler<T>` | `(error, req, ctx: T) => Response` | 错误处理器 |
| `Closeable` | `interface` | `{ close(): Promise<void> }` |
| `User` | `interface` | `{ id, role?, tenant?, [key]: unknown }` |
| `HttpError` | `class` | `extends Error`，含 `status` 属性 |

---

# 前端 API (`weifuwu/client`)

> 以下为完整 API 参考，按需查阅。新手建议先阅读上文的「组件模型」和「状态管理」。

零外部 npm 运行时依赖。组件签名：`(initProps, ctx) => (props) => VNode`（两阶段模型，外层 mount 只一次，内层 render 每次变化时执行）。无状态组件可简写为 `() => () => VNode`。

构建配置（esbuild）：

```js
esbuild.build({
  jsx: 'automatic',
  jsxImportSource: 'weifuwu/client',
  bundle: true,
})
```

---

## createApp — 应用引导

```tsx
import { createApp } from 'weifuwu/client'

const app = createApp()

// 注册中间件
app.use(middleware1)
app.use(middleware2)

// 挂载到 DOM
app.mount('#root', RootComponent)

// 获取当前 ctx
console.log(app.ctx)

// 销毁
app.destroy()
```

| 方法 | 说明 |
|------|------|
| `createApp()` | 创建应用实例 |
| `app.use(mw)` | 注册 AppMiddleware |
| `app.mount(selector, RootComponent)` | 挂载到 DOM |
| `app.destroy()` | 卸载应用 |
| `app.ctx` | 当前 WfuiContext |

---

## 组件模型

```tsx
import type { Component, WfuiContext } from 'weifuwu/client'

// 两阶段组件：mount（只一次）→ render（每次 dirty/props 变化）
const Counter: Component = (_init, ctx) => {
  // ── mount ──
  let count = 0

  // ── render ──
  return (props) =>
    h('button', { onClick: () => { count++; ctx.ui.render() } }, count)
}

// 无状态组件：只有 render
const Badge: Component = () =>
  (props) => h('span', { class: `badge-${props.variant}` }, props.children)
```

### 类型流（props 泛型 + ctx 注入）

```tsx
import type { Component } from 'weifuwu/client'
import type { ApiInjected, RouteInjected } from 'weifuwu/client'

// ① props 泛型：JSX 使用时自动类型检查（传错类型编译期报错）
interface DeckCardProps { title: string; pages: number }
const DeckCard: Component<DeckCardProps> = (_init, ctx) =>
  (props) => <div>{props.title} / {props.pages} 页</div>
// <DeckCard title="x" pages={8} />     ✓
// <DeckCard title="x" pages="8" />     ✗ 编译期报错

// ② ctx 注入声明：use(api()).use(router()) 后组件声明依赖，ctx 直接访问
const Home: Component<{}, ApiInjected & RouteInjected> = (_init, ctx) => {
  ctx.api.get('/users')   // ✓ 有类型
  ctx.app.navigate('/x')  // ✓ 有类型
  return () => <h1>Home</h1>
}
// 未声明的注入字段编译期报错——注入从"文档约定"变成"类型保证"

createApp()
  .use(api())                    // 注入 ctx.api
  .use(router({ routes }))       // 注入 ctx.route / ctx.app
  .mount('#root', Home)          // mount 时类型累积完整
```

> 各中间件的注入接口：`api()` → `ApiInjected`、`auth()` → `AuthInjected`、`ws()` → `WsInjected`、`i18n()` → `I18nInjected`、`router()` → `RouteInjected`（均可从 `weifuwu/client` 导入）。

| 规则 | 说明 |
|------|------|
| 组件签名 | `(initProps: P, ctx: WfuiContext) => (props: P) => VNode \| null` |
| mount 阶段 | 外层函数只执行一次，初始化状态 |
| render 阶段 | 内层函数每次 dirty/props 变化时执行，返回 VNode |
| 无 class | 无 `this`，无实例方法 |
| 无 hook | 无 `useState` / `useEffect` / `useMemo` |
| 状态 | 闭包变量 + `ctx.ui.render()` 手动触发，或 `ctx.ui.$()` 响应式容器 |
| ref 引用 | `ref={el => { if (el) init; else cleanup }}` 获取 DOM |

### JSX 工厂

```tsx
// 由 esbuild 自动调用（jsxImportSource: 'weifuwu/client'）
import { h, jsx, jsxs, jsxDEV, Fragment } from 'weifuwu/client'

// h 支持 variadic children
h('div', { class: 'x' }, child1, child2)

// Fragment
<><div>A</div><div>B</div></>
```

| 导出 | 用途 |
|------|------|
| `h(type, props, ...children)` | hyperscript |
| `jsx` / `jsxs` / `jsxDEV` | JSX 编译目标 |
| `Fragment` | 片段 |
| `Portal` / `createPortal(children, portalKey?)` | 渲染到 `document.body#__wf_portal` 独立容器（弹层/对话框，脱离父级 overflow 裁剪） |

```tsx
import { createPortal } from 'weifuwu/client'

// 内容渲染到 body 下的独立容器（不在父组件的 DOM 树内）
const Tooltip = (_init, ctx) =>
  (props) => createPortal(
    <div class="tooltip">{props.text}</div>
  )

// 配合 ctx.ui.selfId('name') 可从任何地方精准刷新 portal 内容
ctx.ui.render(['name'])
```

---

## 状态管理

### ctx.ui 方法速查

| 方法 | 签名 | 一句话说明 |
|------|------|-----------|
| `$()` | `$(): Record<string, any>` | 深度 Proxy 响应式状态容器，赋值自动触发渲染（**推荐首选**） |
| `render()` | `render(ids?: string[])` | 同步强制渲染；无参 = 当前组件，传参 = 指定组件列表 |
| `dirty()` | `dirty(ids?: string[])` | 异步渲染（微任务批处理合并）；`$` 内部就是调它 |
| `selfId()` | `selfId(name: string)` | 注册组件自定义 ID，配合 `render(['id'])` 跨组件精准刷新 |
| `useMedia()` | `useMedia(query, cb)` | 响应式媒体查询，断点变化时自动回调 |
| `useBreakpoint()` | `useBreakpoint(cb \| bps, cb?)` | 命名断点 mobile/tablet/desktop |
| `usePopupPosition()` | `usePopupPosition(opts)` | 弹层坐标跟随：scroll/resize 时自动重算 fixed 坐标 |

> 每个方法的完整说明见下文对应章节。

### Render 机制总览

| API | 触发时机 | 渲染方式 | 作用域 | 使用场景 |
|------|---------|---------|--------|---------|
| `$.x = val` | 赋值后自动 | 微任务批量（异步） | 当前组件 | **日常 UI 状态** — 表单输入、切换开关、异步数据加载等 |
| `ctx.ui.dirty()` | 主动调用 | 微任务批量（异步） | 当前/指定 | **绕过 Proxy 后手动标记** |
| `ctx.ui.render()` | 主动调用 | 立即同步 | 当前/指定 | **需要立即拿到最新 DOM** — DOM 测量、动画触发 |
| `ctx.ui.render(['id'])` | 主动调用 | 立即同步 | 指定组件 | **跨组件精准刷新** — 全局事件、Portal 远程控制 |
| `ctx.ui.useMedia()` | 注册监听 | 浏览器事件驱动 | 当前组件 | **响应式媒体查询** — 断点变化时自动 dirty |
| `ctx.ui.useBreakpoint()` | 注册监听 | 浏览器事件驱动 | 当前组件 | **命名断点** — mobile/tablet/desktop 自动 dirty |
| `ctx.ui.usePopupPosition()` | 注册监听 | 浏览器事件驱动 | 当前组件 | **弹层坐标跟随** — scroll/resize 时自动重算 fixed 坐标 |

`render()` 和 `dirty()` 无参 = 当前组件，传参 = 指定组件列表。三套 API 同一 scope 机制。

### 闭包变量 + `ctx.ui.render()`（简单场景）

```tsx
const Counter: Component = (_init, ctx) => {
  let count = 0
  return (props) =>
    h('button', { onClick: () => { count++; ctx.ui.render() } }, count)
}
```

适合状态极少的简单组件。每次修改后手动调用 `ctx.ui.render()` 同步刷新 DOM。

### `ctx.ui.$()` — 响应式 Proxy（推荐首选）

`ctx.ui.$()` 返回**深度 Proxy** 容器。任意层级赋值操作自动触发渲染（微任务批量合并）：

```tsx
const FormPage: Component = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.email = ''
  $.loading = false
  return (props) =>
    h('input', {
      value: $.email,
      onInput: (e: any) => { $.email = e.target.value }
    })
}
```

**深度 Proxy 拦截**：
- `$.x = val` → 自动排队重渲染
- `$.obj.a = 1` → 自动 dirty（嵌套对象递归包装）
- `$.arr.push(val)` / `$.arr[0].x = y` → 自动 dirty（数组变异 + 嵌套属性拦截）
- `delete $.x` → 自动 dirty
- 每个组件实例独立 Proxy，同名变量不冲突

**注意**：mount/render 中 `$.x = val` **不触发渲染**，仅事件/timer/Promise.then 中生效。这是有意设计——初始化和 mount 阶段设置状态不应触发额外渲染。

**何时用 `$`**：所有需要触发 UI 重新渲染的状态。90% 以上的场景用 `$` 就够。

**何时不用**：
- 不需要触发渲染的内部缓存（用闭包变量 `let`）
- 简单组件只有一两个状态变量（闭包变量 + `render()` 更轻量）

### 响应式自适应组件

#### `ctx.ui.useMedia(query, callback)` — 响应式媒体查询

注册媒体查询监听，值变化时自动调用 callback（callback 内赋值 `$` 触发 dirty）：

```tsx
const Card = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.isMobile = false
  // 立即回调一次（取当前值），之后变化时自动重新回调
  ctx.ui.useMedia('(max-width: 640px)', (v) => { $.isMobile = v })

  return (props) => (
    <div class={$.isMobile ? 'wf-stack' : 'wf-row'}>
      {!$.isMobile && <Sidebar />}
      <Content />
    </div>
  )
}
```

`callback` 在 mount 时立即执行一次，之后断点变化时再次执行。赋值给 `$` 的属性自动触发渲染。

#### `ctx.ui.useBreakpoint(callback)` — 命名断点

预设三个断点名称：`mobile`（<640px）、`tablet`（640-1023px）、`desktop`（≥1024px）：

```tsx
const Layout = (_init, ctx) => {
  const $ = ctx.ui.$()
  ctx.ui.useBreakpoint((vp) => { $.vp = vp })

  return (props) =>
    <div class={`sidebar-${$.vp}`}>
      {$.vp === 'mobile' ? <BottomNav /> : <SideNav />}
      {$.vp === 'mobile' ? <MobileContent /> : <Content />}
    </div>
}
```

也支持自定义断点：

```tsx
ctx.ui.useBreakpoint(
  { narrow: '(max-width: 480px)', wide: '(min-width: 1200px)' },
  (vp) => { $.size = vp },
)
```

#### `ctx.ui.usePopupPosition(options)` — 弹层坐标跟随

解决弹出层（Popover / Tooltip / Dropdown / DatePicker 等）在 **页面滚动 / 窗口缩放后不跟随触发元素** 的问题。基于 `position: fixed` + `getBoundingClientRect()`（视口坐标）的弹层，滚动后坐标需要重算——本 API 用全局 scroll/resize 监听（rAF 节流）自动重算并精准刷新当前组件。

```tsx
const DatePicker = (_init, ctx) => {
  let show = false
  let inputEl: HTMLElement | null = null
  let prevOpen = false

  // mount 阶段注册：scroll/resize 时自动重算 pos
  const pos = ctx.ui.usePopupPosition({
    el: () => inputEl,                  // 锚定元素（ref 保存）
    isOpen: () => show,                 // 弹层是否显示
    compute: (r) => ({ top: r.bottom + 4, left: r.left }),  // rect → 坐标
  })

  return (props) => {
    const isOpen = show
    // 打开瞬间算一次初始坐标（受控/非受控统一覆盖）
    if (isOpen && !prevOpen) pos.refresh()
    prevOpen = isOpen

    return h('div', {}, [
      h('input', {
        ref: (el) => { inputEl = el as HTMLElement },
        onClick: () => { show = !show; ctx.ui.render() },
      }),
      isOpen ? h('div', { style: { top: pos.top, left: pos.left } }) : null,
    ].filter(Boolean))
  }
}
```

要点：

- `pos` 是稳定对象，render 闭包直接读取 `top/left/width`，滚动重算原地更新，无需重新绑定
- `pos.refresh()` 只重算不渲染——配合打开路径上已有的 `render()`，避免重复渲染
- 监听是**全局单例**（capture 捕获所有嵌套滚动容器 + rAF 节流），按组件 selfId 注册，组件多时开销 O(1)
- `compute` 是纯函数（rect → 坐标），可单独单测

已内置接入的组件：**Popover / Tooltip / Dropdown / DatePicker / Chart**（tooltip）——它们的弹出层在页面滚动、嵌套容器滚动、窗口缩放时都会自动跟随触发元素，无需额外配置。

#### `ctx.ui.selfId(name)` — 跨组件精准刷新

用于全局事件通知、Portal 远程控制、兄弟组件协调等场景——绕过多层 props 传递，直接按 ID 刷新目标组件：

```tsx
// 组件 A：mount 阶段注册自定义 ID
const StatsPanel = (_init, ctx) => {
  ctx.ui.selfId('stats')
  const $ = ctx.ui.$()
  $.data = []
  return (props) => h('div', {}, String($.data.length))
}

// 组件 B（或其他任何地方）用 ID 精准刷新
ctx.ui.render(['stats'])        // 同步刷新
// 或：ctx.ui.dirty(['stats'])   // 异步批处理版本
```

**语义**：

- 必须在 **mount 阶段**调用（组件初始化时），注册后组件即可被 `render(['id'])` / `dirty(['id'])` 精准定位
- **同名冲突直接抛错**，每个自定义 ID 必须全局唯一
- 配合 `selfId` 注册的组件在跨组件场景下无需把刷新逻辑层层传 props

#### CSS 层响应式（不碰 JS）

配合 `weifuwu/layout` 的断点变体，纯 CSS 实现布局方向切换：

```html
<!-- 小屏堆叠，桌面并排 -->
<div class="wf-stack wf-stack@md"></div>

<!-- 小屏隐藏侧栏 -->
<aside class="wf-hidden wf-block@md"></aside>
```

可用断点变体：

| 原语 | 变体 | 效果 |
|------|------|------|
| `wf-stack` | `@sm` `@md` `@lg` | 断点以上改为横向排列 |
| `wf-row` | `@sm` `@md` `@lg` | 断点以上保持横向 |
| `wf-hidden` | `@sm` `@md` `@lg` | 断点以上隐藏 |
| `wf-block` | `@sm` `@md` `@lg` | 断点以上显示 |

断点尺寸：`--wf-bp-sm: 640px` / `--wf-bp-md: 768px` / `--wf-bp-lg: 1024px` / `--wf-bp-xl: 1280px`

### `ctx.ui.dirty()` — 异步标记脏

异步版本，无参 = 当前组件，传参 = 指定组件列表。多次调用合并为一次微任务渲染。`$` 内部就是调 `dirty()`。

与 `render()` 的区别：`dirty()` 是**异步**（微任务批量合并，同帧多次调用只渲染一次），`render()` 是**同步**（立即执行 VDOM diff + patch）。日常 UI 状态用 `$` 或 `dirty()`，需要立即拿到最新 DOM（测量/动画/第三方库）时用 `render()`。

### `ctx.ui.render()` — 同步强制渲染

与 `dirty()` 的微任务批量不同，`render()` 是**同步执行**的。调用后立即执行 VDOM diff + patch，DOM 立刻更新。无参时只刷新当前组件，传参时可精准刷新指定组件。

**何时必须用 `render()`**：

```tsx
// 1. DOM 测量（读取 offsetHeight/scrollWidth 等）
// 用 ref 在 DOM 创建后操作
ref: (el) => {
  if (!el) return
  el.style.height = 'auto'
  ctx.ui.render()
  const h = el.offsetHeight
  el.style.height = h + 'px'
}

// 2. 动画触发（需要确保上一帧 DOM 已提交）
function startAnimation() {
  $.animating = true
  ctx.ui.render()                // 同步刷新 DOM
  el.startViewTransition(...)    // 拿到最新 DOM 启动动画
}

// 3. 第三方库需要在事件回调中读取最新 DOM
onClick: () => {
  $.selected = !$.selected
  ctx.ui.render()                // 确保 DOM 已更新
  thirdPartyLib.measure(el)      // 读取最新状态
}
```

**规则**：能用 `$` 就用 `$`。只有当你**必须同步拿到最新 DOM 状态**时才用 `render()`。

### 三种方式速查

```tsx
// 自动：$.x = val — 微任务批量，绑定当前组件
const $ = ctx.ui.$()
$.count++
$.name = 'hello'         // 多次赋值合并为一次渲染

// 手动：ctx.ui.render() — 同步，无参=当前，传参=指定
let count = 0
count++
ctx.ui.render()          // DOM 立刻更新
ctx.ui.render(['stats']) // 精准刷新指定组件

// 异步：ctx.ui.dirty() — 微任务批量，同 render() 作用域
ctx.ui.dirty()
ctx.ui.dirty(['stats'])  // 批处理合并
```

**性能说明**：
- `$.x = val` 和 `dirty()` 都是微任务批量合并
- `render()` 从 dirty 组件**向下**遍历（scope render），兄弟组件不遍历
- **三态 skip 自动优化**：组件重新渲染时，框架自动检查三个维度：
  - **props**（含 children 元素级比较）——值没变则不渲染
  - **`$` 状态**——没被 dirty 标记则不渲染
  - **ctx 版本**——ctx 没变化则不渲染
  三个条件全部满足时跳过整个子树（零 `_render` 调用、零 `patchValue` 遍历）
- **lastIndex keyed diff**：列表 diff 采用正向 lastIndex 算法（React 同款），顺序不变时零 `insertBefore`。对比传统的逆序循环全量移动，DOM 修改从 O(N) 降到 O(0)。
- 示例：DemoButton 点击一次，DOM 修改从 34 次降到 **1 次**（仅变更文本节点的 `textContent`）

### 实践建议

**组件库**（可分享组件）推荐手动模式：

```tsx
const DatePicker = (_init, ctx) => {
  let show = false             // let 不触发渲染
  return (props) =>
    h('input', {
      onClick: () => { show = true; ctx.ui.render() }
    })
}
```

行为只由 `render()` 显式控制，不依赖 `$`，测试中 `render()` 直接 mock 为空函数。

**业务层**推荐自动模式：

```tsx
const OrderPage = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.orders = []                // $ 赋值自动触发渲染
  $.loading = false
  return (props) => h('div', {}, $.loading ? h(Spinner) : h(OrderList, { orders: $.orders }))
}
```

省事、安全、`$` 绑定所属组件不波及兄弟。

同一个组件内可以按变量混用两种模式：需要渲染的用 `$`，不需要的用 `let`。

### VDOM diff 优化机制

weifuwu 的 VDOM 在每次 render 时自动执行**三态 skip 判定**，减少不必要的组件渲染和 DOM 操作：

```
canSkip = (props 没变) AND ($ 没脏) AND (ctx 版本一致)
          ↑ 值级浅比较    ↑ VNode dirty 标记  ↑ 全局版本号
```

三个维度各自独立判断，AND 合并。任何一个维度说

---

## 条件与列表

使用原生 JS 控制流：

```tsx
// 条件
{cond ? <A /> : <B />}
{cond && <A />}

// 列表 — 必须指定 key
{items.map(item => (
  <div key={item.id}>{item.name}</div>
))}
```

---

## ref 管理 DOM

使用 `ref` prop 获取元素引用，适合管理第三方库或读取 DOM：

```tsx
const Timer: Component = (_init, ctx) => {
  let timer: ReturnType<typeof setInterval> | undefined

  return (props) =>
    h('div', {
      ref: (el) => {
        if (el) {
          timer = setInterval(() => console.log('tick'), 1000)
        } else {
          clearInterval(timer)
        }
      },
    }, 'Timer')
}
```

`ref` 在元素创建时调用 `ref(el)`，元素移除时调用 `ref(null)`。
`ref` 不接受返回值，清理逻辑直接在 `else` 分支处理。

对于**内嵌元素**（非根元素），直接在目标元素上放 `ref`：

```tsx
return h('div', {},
  h('input', {
    type: 'text',
    ref: (el) => el?.focus(),
  })
)
```

### 异步组件

在 mount 阶段发起请求，数据通过 `$.x = val` 自动触发渲染：

```tsx
const UserProfile: Component = (initProps, ctx) => {
  const $ = ctx.ui.$()
  $.loading = true

  fetch(`/api/user/${initProps.id}`)
    .then(r => r.json())
    .then(user => { $.user = user; $.loading = false })

  return (props) =>
    $.loading
      ? h('div', {}, '加载中...')
      : h('div', {}, $.user?.name ?? '')
}
```

### asyncComponent 工厂（形态 C）— 同步式数据声明

`async (ctx) => (initProps, ctx) => (props) => VNode` — 工厂层（async，只执行一次并缓存）声明数据/加载代码，mount/render 保持同步。数据经闭包注入组件，渲染无 loading 分支：

```tsx
import { asyncComponent } from 'weifuwu/client'

const UserProfile = asyncComponent(async (ctx) => {
  const user = await ctx.data.get(`/api/user/${ctx.params.id}`)
  return (_init, ctx) => {
    const $ = ctx.ui.$()
    $.liked = false                        // 客户端状态（交互后变化）
    return (props) =>
      h('div', {},
        h('p', {}, user.name),             // 服务端状态（闭包，SSR 进 HTML）
        h('button', { onClick: () => $.liked = !$.liked }, $.liked ? '❤️' : '🤍'),
      )
  }
})
```

- **客户端**：首次渲染占位 → 工厂 resolve 后整树重渲染补全（SPA）；数据经 `ctx.data` 缓存（hydration 时从 `__DATA__` 同步命中，不重跑请求）
- **服务端**：`ctx.ui.ssr()` 直接 await 工厂 → 数据进 HTML（无占位）
- 工厂缓存绑定页面上下文：路由导航/登录登出时自动失效，工厂以新 ctx 重新执行
- 会变的数据：初始值 seed 自服务端数据（`$.count = data.count`），交互改 `$`；初始状态必须确定性（禁止 `window.innerWidth` 直接初始化 → SSR/hydration mismatch）

---

## router + RouteView — 前端路由

```tsx
import { createApp, router, RouteView } from 'weifuwu/client'
import type { RouteDef, WfuiContext } from 'weifuwu/client'

const routes: RouteDef[] = [
  { path: '/', component: Home },
  { path: '/users', component: UserList },
  { path: '/users/:id', component: UserDetail },
]

createApp()
  .use(router({
    routes,
    mode: 'history',  // 或 'hash'
    notFound: NotFoundPage,
  }))
  .mount('#root', () => () => <RouteView />)  // 根组件也要两阶段：外层返回 render 函数
```

### 嵌套布局

```tsx
const routes = [
  {
    path: '/dashboard',
    layout: DashboardLayout,      // 持久布局（包含 RouteView）
    children: [
      { path: '/overview', component: Overview },
      { path: '/settings', component: Settings },
    ],
  },
]

function DashboardLayout(_props: {}, ctx: WfuiContext) {
  return (props) => (
    <div style="display:flex">
      <aside>导航菜单</aside>
      <main><RouteView /></main>  {/* 渲染子路由 */}
    </div>
  )
}
```

### 编程式导航

```tsx
// 在任意组件中
ctx.app?.navigate('/users/123?tab=profile')
```

| ctx 注入 | 类型 | 说明 |
|----------|------|------|
| `ctx.route.path` | `string` | 当前路由路径 |
| `ctx.route.params` | `Record<string, string>` | URL 参数 |
| `ctx.route.query` | `Record<string, string>` | 查询参数 |
| `ctx.app.navigate(path)` | `(string) => void` | 编程式导航 |

| RouterOptions | 类型 | 默认值 | 说明 |
|---------------|------|--------|------|
| `routes` | `RouteDef[]` | — | 路由定义 |
| `mode` | `'history' \| 'hash'` | `'history'` | 路由模式 |
| `notFound` | `Component` | — | 404 页面 |

| RouteDef | 类型 | 说明 |
|----------|------|------|
| `path` | `string` | 路径（支持 `:param`） |
| `component` | `Component` | 页面组件 |
| `layout` | `Component` | 布局组件（内含 `<RouteView />`） |
| `children` | `RouteDef[]` | 子路由 |
| `auth` | `boolean` | 是否需要认证（配合 auth 中间件） |
| `title` | `string` | 页面标题（自动设置 `document.title`） |

---

## api — HTTP 客户端中间件

```tsx
import { createApp, api } from 'weifuwu/client'

createApp()
  .use(api({ baseURL: '/api' }))
  .mount('#root', App)

// 在组件中使用
async function loadUsers(ctx: WfuiContext) {
  const users = await ctx.api?.get<User[]>('/users')
  const user = await ctx.api?.get<User>('/users/1')
  const created = await ctx.api?.post<User>('/users', { name: 'Alice' })
  await ctx.api?.put('/users/1', { name: 'Bob' })
  await ctx.api?.patch('/users/1', { name: 'Bob' })
  await ctx.api?.delete('/users/1')
}
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `baseURL` | `string` | `''` | API 基础路径 |
| `headers` | `Record<string, string>` | `{ 'Content-Type': 'application/json' }` | 默认请求头 |
| `onRequest` | `(req) => { url, init }` | — | 请求拦截器 |
| `onResponse` | `(res) => Promise<T>` | — | 响应拦截器 |
| `timeout` | `number` | `0`（无超时） | 请求超时（ms）|

| ctx.api 方法 | 签名 | 说明 |
|-------------|------|------|
| `api.get(url, opts?)` | `<T>(string, ApiRequestOptions?) => Promise<T>` | GET |
| `api.post(url, body?, opts?)` | `<T>(string, unknown?, ApiRequestOptions?) => Promise<T>` | POST |
| `api.put(url, body?, opts?)` | `<T>(string, unknown?, ApiRequestOptions?) => Promise<T>` | PUT |
| `api.patch(url, body?, opts?)` | `<T>(string, unknown?, ApiRequestOptions?) => Promise<T>` | PATCH |
| `api.delete(url, opts?)` | `<T>(string, ApiRequestOptions?) => Promise<T>` | DELETE |

```ts
// 错误处理
try {
  await ctx.api!.get('/users')
} catch (e) {
  if (e instanceof ApiError) {
    console.log(e.status, e.body)  // e.g. 404, 'Not Found'
  }
}
```

`ApiError`：`{ status: number, body: string }`，继承 `Error`。

| ApiRequestOptions | 类型 | 说明 |
|-------------------|------|------|
| `headers` | `Record<string, string>` | 本次请求自定义请求头 |
| `signal` | `AbortSignal` | 取消请求 |

---

## auth — 认证中间件

```tsx
import { createApp, auth } from 'weifuwu/client'

createApp()
  .use(auth())
  .mount('#root', App)

// 在组件中
function Profile(_props: {}, ctx: WfuiContext) {
  return (props) => {
    if (!ctx.auth?.isLoggedIn) return <p>请登录</p>
    return <p>欢迎, {ctx.auth?.user?.name}</p>
  }
}

// 登录
ctx.auth?.login(token, { id: 1, name: 'Alice' }, refreshToken)

// 登出
ctx.auth?.logout()

// 更新用户信息
ctx.auth?.setUser({ id: 1, name: 'Bob' })

// 刷新 token
await ctx.auth?.refresh()  // → boolean
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `storage` | `Storage` | `localStorage` | 存储方式 |
| `tokenKey` | `string` | `'weifuwu_token'` | Token 存储 key |
| `userKey` | `string` | `'weifuwu_user'` | 用户信息存储 key |
| `refreshTokenKey` | `string` | `'weifuwu_refresh'` | Refresh token 存储 key |
| `refreshEndpoint` | `string` | `'/api/auth/refresh'` | 刷新端点 |

| ctx.auth | 类型 | 说明 |
|----------|------|------|
| `.token` | `string \| null` | JWT token |
| `.user` | `any` | 用户对象 |
| `.isLoggedIn` | `boolean` | 是否已登录（基于 token 存在） |
| `.login(token, user, refreshToken?)` | `void` | 登录 |
| `.logout()` | `void` | 登出（清除存储） |
| `.setUser(user)` | `void` | 更新用户信息 |
| `.refresh()` | `Promise<boolean>` | 刷新 token（自动检测过期） |

启动时自动检测 token 是否过期（JWT `exp` 提前 30 秒），过期则自动调用 `refresh()`。

---

## ws — WebSocket 客户端中间件

```tsx
import { createApp, ws } from 'weifuwu/client'

createApp()
  .use(ws({ url: '/ws' }))
  .mount('#root', App)

// 发送消息
ctx.ws?.send({ type: 'chat', body: 'hello' })

// 接收消息 — 返回 unsubscribe 函数
const unsubscribe = ctx.ws?.onMessage((msg) => {
  console.log('收到:', msg)
})

// 清理
unsubscribe?.()
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `url` | `string` | `'/ws'` | WebSocket 连接地址 |
| `reconnectInterval` | `number` | `3000` | 重连间隔（ms） |
| `maxReconnect` | `number` | `10` | 最大重连次数 |
| `pingInterval` | `number` | `30000` | 心跳发送间隔 |
| `pingTimeout` | `number` | `10000` | 心跳超时断开 |

| ctx.ws | 类型 | 说明 |
|--------|------|------|
| `.send(msg)` | `(unknown) => void` | 发送 JSON 消息 |
| `.onMessage(fn)` | `(fn) => () => void` | 订阅消息，返回 unsubscribe |
| `.isConnected` | `boolean` | 连接状态 |
| `.close()` | `() => void` | 断开连接 |

自动重连（指数退避）、心跳保活、JSON 序列化/反序列化。

---

## i18n — 国际化中间件

```tsx
import { createApp, i18n } from 'weifuwu/client'

createApp()
  .use(i18n({
    locale: 'zh-CN',
    messages: {
      'title': '仪表盘',
      'welcome': '欢迎, {name}',
    },
  }))
  .mount('#root', App)

// 组件中使用
<h1>{ctx.i18n?.t('title')}</h1>
<p>{ctx.i18n?.t('welcome')}</p>

// 运行时切换语言
ctx.i18n?.setLocale('en-US')
// → 自动触发根组件重渲染（所有组件使用新语言文案）
```

| I18nOptions | 类型 | 默认值 | 说明 |
|-------------|------|--------|------|
| `locale` | `string` | `'zh-CN'` | 初始语言 |
| `messages` | `Record<string, string>` | `{}` | 翻译键值对 |
| `components` | `Record<string, Record<string, string>>` | `{}` | 组件文案覆盖 |

| ctx.i18n | 类型 | 说明 |
|----------|------|------|
| `.t(key, fallback?)` | `(string, string?) => string` | 翻译 |
| `.locale` | `string` | 当前语言 |
| `.setLocale(lang)` | `(string) => void` | 切换语言（触发重渲染） |
| `.components` | `Record<string, Record<string, string>>` | 组件文案映射 |

内置语言包：

```ts
import { zhCN, enUS } from 'weifuwu/client'
```

- `zh-CN`：默认中文
- `en-US`：英文

组件文案（Button 的 `加载中...`、FileUpload 的 `点击或拖拽上传文件` 等）随语言自动切换。组件内部通过 `ctx.i18n?.components?.ComponentName.field` 读取。

组件支持 `props.locale` 局部覆盖语言。

---

## ErrorBoundary — 错误边界

```tsx
import { ErrorBoundary } from 'weifuwu/client'

<ErrorBoundary fallback={<p>出错了，请刷新页面</p>}>
  <UserProfile />
</ErrorBoundary>

// fallback 也可以是一个接收 error 的函数
<ErrorBoundary fallback={({ error }) => (
  <div>
    <p>出错了: {String(error)}</p>
    <button onClick={() => location.reload()}>重试</button>
  </div>
)}>
  <UserProfile />
</ErrorBoundary>
```

| ErrorBoundaryProps | 类型 | 默认值 | 说明 |
|--------------------|------|--------|------|
| `fallback` | `VNode \| ((props: { error }) => VNode) \| null` | `null` | 错误时渲染的内容 |
| `children` | `any` | — | 子组件 |

捕获子组件 render 时的错误 → 渲染 fallback。清除 `error` 即可重试。

---

## confirm — 确认对话框

两种用法，共享同一视觉与行为（基于 Modal 封装）：

**① 命令式 `ctx.confirm()`（推荐，操作前询问）**

```tsx
import { createApp } from 'weifuwu/client'
import { confirm } from 'weifuwu/components'

createApp()
  .use(confirm())
  .mount('#root', App)

// 任意代码中（组件事件、async 逻辑）
async function handleDelete(ctx: WfuiContext) {
  const ok = await ctx.confirm?.('确定删除这条记录？', {
    title: '确认删除',
    confirmText: '删除',
    cancelText: '取消',
    variant: 'danger',  // 'primary' | 'danger'
  })
  if (ok) {
    // 执行删除...
  }
}
```

**② 声明式 `<Confirm>`（需要受控状态时）**

```tsx
import { Confirm } from 'weifuwu/components'

<Confirm
  open={confirming}
  title="确认删除"
  message="确定删除这条记录？"
  confirmText="删除"
  variant="danger"
  onConfirm={() => doDelete()}
  onCancel={() => setConfirming(false)}
/>
```

| ConfirmOptions | 类型 | 默认值 | 说明 |
|----------------|------|--------|------|
| `title` | `string` | `'确认操作'` | 对话框标题 |
| `confirmText` | `string` | `'确定'` | 确认按钮文字 |
| `cancelText` | `string` | `'取消'` | 取消按钮文字 |
| `variant` | `'primary' \| 'danger'` | `'primary'` | 按钮样式变体 |
| `width` | `string` | Modal 默认 | 对话框宽度 |

- `ctx.confirm()` 返回 `Promise<boolean>`，ESC / 点击遮罩 / 取消 → resolve(false)
- 组件化渲染（Modal + portal），自动锁定滚动 + 焦点陷阱，i18n 文案可配置
- 多次调用各自独立渲染（叠放语义），互不干扰

---

## toast — 命令式消息提示

`ctx.toast()` 是 `<Toast>` 组件的全局命令式封装：任意代码中一行调用，自动消失、自动清理，无需宿主状态。

```tsx
import { createApp } from 'weifuwu/client'
import { toast } from 'weifuwu/components'

createApp()
  .use(toast({ position: 'top-right', duration: 3000, max: 3 }))
  .mount('#root', App)

// 任意代码中（组件事件、api 拦截器、WS 回调、定时器）
ctx.toast?.('保存成功', 'success')
ctx.toast?.('请求失败', 'error')
ctx.toast?.('普通消息')          // 默认 type = 'info'
```

| ToastOptions | 类型 | 默认值 | 说明 |
|-------------|------|--------|------|
| `position` | `ToastPosition` | `'top-right'` | 容器位置 |
| `duration` | `number` | `3000` | 默认自动消失时间（ms），0 = 不消失 |
| `max` | `number` | `3` | 最大显示条数，超出移除最早 |

单条可覆盖自动消失时间：`ctx.toast('慢一点消失', 'info', 5000)`。

与声明式 `<Toast toasts={...}/>` 共存：声明式用于局部列表（合并消息、自定义布局），命令式用于全局一次性反馈。

---

## ScrollLock / FocusTrap

```tsx
import { lockScroll, unlockScroll } from 'weifuwu/client'
import { trapFocus } from 'weifuwu/client'

// 锁定/解锁滚动（支持嵌套计数）
lockScroll()
unlockScroll()

// 焦点陷阱 — 返回 cleanup 函数
const cleanup = trapFocus(containerElement)
cleanup()  // 恢复之前的焦点
```

| API | 说明 |
|-----|------|
| `lockScroll()` | 锁定 body 滚动（iOS 兼容） |
| `unlockScroll()` | 解锁滚动，恢复滚动位置 |
| `trapFocus(el)` | Tab/Shift+Tab 在容器内循环，返回 cleanup |

---

## extendCtx — 上下文扩展

```tsx
import { extendCtx } from 'weifuwu/client'

// 在 AppMiddleware 中创建新 ctx，原 ctx getter 通过原型链继承
function myMw(ctx: WfuiContext): WfuiContext {
  return extendCtx(ctx, { myField: 'value' })
}
```

`extendCtx` 使用 `Object.create(ctx)` 保持原型链，再用 `Object.assign` 添加新字段。保证 getter 不被快照化。

---

## 前端类型

```tsx
import type { VNode, VNodeType, Component, WfuiContext, AppMiddleware, RouteDef } from 'weifuwu/client'
import type { ApiClient, ApiOptions, ApiRequestOptions, ApiError } from 'weifuwu/client'
import type { AuthClient, AuthOptions } from 'weifuwu/client'
import type { ErrorBoundaryProps } from 'weifuwu/client'
import type { I18nOptions, I18nState, LocalePackage } from 'weifuwu/client'
import type { PopupPositionOptions, PopupPosition } from 'weifuwu/client'
import type { ConfirmProps, ConfirmOptions } from 'weifuwu/components'
import type { ToastOptions, ToastPosition } from 'weifuwu/components'
import type { RouterOptions } from 'weifuwu/client'
```

| 类型 | 说明 |
|------|------|
| `VNode` | `{ type, props, key? }` |
| `VNodeType` | `string \| Component \| typeof Fragment` |
| `Component<P>` | `(initProps: P, ctx: WfuiContext) => (props: P) => VNode \| null` |
| `WfuiContext` | `{ ui, route?, app?, ws?, api?, auth?, i18n?, confirm?, toast?, [key]: unknown }` |
| `AppMiddleware` | `(ctx: WfuiContext) => WfuiContext` |
| `RouteDef` | `{ path, component?, layout?, children?, auth?, title? }` |
| `ApiClient` | `{ get, post, put, patch, delete }` |
| `ApiError` | `class { status, body } extends Error` |
| `AuthClient` | `{ token, user, isLoggedIn, login, logout, setUser, refresh }` |
| `I18nOptions` | `{ locale?, messages?, components? }` |
| `I18nState` | `{ locale, t, setLocale, components }` |
| `ErrorBoundaryProps` | `{ fallback?, children? }` |
| `ConfirmProps` | `{ open?, title?, message?, confirmText?, cancelText?, variant?, width?, onConfirm?, onCancel? }` |
| `ConfirmOptions` | `{ title?, confirmText?, cancelText?, variant?, width? }` — 命令式 ctx.confirm 选项 |
| `ToastOptions` | `{ position?, duration?, max? }` — 命令式 ctx.toast 配置 |
| `PopupPositionOptions` | `{ el, isOpen, compute }` — 弹层位置跟踪配置（见 usePopupPosition） |
| `PopupPosition` | `{ top, left, width?, refresh }` — 弹层位置跟踪器 |

---

# 组件库 (`weifuwu/components`)

43 个 HTML 原语组件。每个是 `(_init, ctx) => (props) => VNode`（两阶段组件，与前端框架同一模型），引用 `--wf-*` CSS 变量做主题。另含 `confirm()` / `toast()` 命令式中间件。

```ts
import { Button, Input, Table, Modal, Toast } from 'weifuwu/components'
import 'weifuwu/components/style.css'   // 包含 Token + 35 布局原语 + 组件样式，一次性引入
```

### 使用示例

```tsx
// ├─ 按钮
<Button variant="primary" onClick={() => alert('提交')}>提交</Button>
<Button variant="ghost" loading>加载中</Button>
<Button variant="danger" size="lg" block>删除</Button>

// ├─ 输入框
<Input placeholder="请输入邮箱" />
<Input label="用户名" name="username" required error="必填" />
<Input type="password" hint="至少6位" />
<Input name="email" type="email" disabled placeholder="name@example.com" />

// ├─ 选择器
<Select options={[{ value: 'a', label: '选项A' }]} placeholder="请选择" />
<Select searchable options={options} onChange={v => setVal(v)} />

// ├─ 复选框 / 开关 / 单选
<Checkbox checked={agree} onChange={setAgree} label="同意协议" />
<Switch checked={enabled} onChange={setEnabled} />
<RadioGroup options={[{ value: '1', label: '男' }, { value: '2', label: '女' }]} value={gender} />

// ├─ 表格
<Table columns={[{ key: 'id', label: 'ID', sortable: true }, { key: 'name', label: '名称' }]}
       data={rows} sortKey="id" sortOrder="asc" onSort={(k, o) => setSort(k, o)} />

// ├─ 模态框 / 确认框 / 抽屉
<Modal open={show} title="提示" onClose={() => setShow(false)} width="500px" closable>
  <p>确认删除？</p>
</Modal>
<Confirm open={confirming} message="确定删除？" variant="danger" onConfirm={doDelete} onCancel={() => setConfirming(false)} />
// 命令式：await ctx.confirm?.('确定删除？') —— 组件里直接调用
<Drawer open={open} title="详情" onClose={() => setOpen(false)} position="right">内容</Drawer>

// ├─ 消息提示
<Toast toasts={items} position="top-right" max={5} onRemove={id => remove(id)} />
<Alert variant="warning" closable>注意：磁盘空间不足</Alert>

// ├─ 标签 / 徽标 / 头像
<Badge count={5}>消息</Badge>
<Badge variant="success">通过</Badge>
<Tag variant="blue" closable onClose={() => {}}>标签</Tag>
<Avatar name="张三" size="lg" />

// ├─ 卡片 / 统计卡片
<Card title="卡片标题" extra={<a href="#">更多</a>}>卡片内容</Card>
<StatCard title="总用户" value="1,234" trend={12.5} variant="primary" />

// ├─ 标签页 / 下拉菜单
<Tabs items={[{ key: 'a', label: '标签A' }, { key: 'b', label: '标签B' }]} activeKey="a" onChange={setTab} />
<Dropdown items={[{ label: '编辑', onClick: () => {} }, { label: '删除', danger: true }]}>操作</Dropdown>

// ├─ 分页 / 步骤条
<Pagination total={100} page={1} pageSize={10} onChange={setPage} />
<Steps items={[{ title: '第一步' }, { title: '第二步' }]} current={1} />

// ├─ 滑块 / 进度条
<Slider min={0} max={100} value={50} onChange={setValue} />
<ProgressBar value={75} variant="success" label="75%" />

// ├─ 面包屑 / 分割线
<Breadcrumb items={[{ label: '首页' }, { label: '用户管理' }]} />
<Divider />
<Divider orientation="left">分割文字</Divider>

// ├─ 加载 / 空状态 / 骨架屏
<Loading text="加载中..." />
<EmptyState title="暂无数据" description="请先创建一条记录" action={<Button>新建</Button>} />
<Skeleton variant="text" lines={3} />
<Skeleton variant="table" lines={5} cols={4} />
<Skeleton variant="avatar" />
<Skeleton variant="image" />

// ├─ 表单验证
<Form validation={{ email: [{ required: true, message: '请输入邮箱' }] }}
      onSubmit={values => ctx.api?.post('/login', values)}   // ctx.api 由中间件注入
      onError={errors => setErrors(errors)}>
  <Field label="邮箱" error={errors.email}>
    <Input name="email" />
  </Field>
  <Button type="submit">登录</Button>
</Form>
```

> 所有组件引用 `--wf-*` CSS 变量做主题，详见下文的「样式定制指南」。

### 生命周期映射

组件没有生命周期函数。每个阶段对应到代码的明确位置：

```
mount ──────────────────────────────────────────
  const Counter = (_init, ctx) => {       ← mount（只一次）
    let count = 0                           ← 初始化状态
    return (props) => {                     ← render 函数
      // ...                                 ← 每次 dirty/props 变化执行
    }
  }

ref ────────────────────────────────────────────
  h('div', {
    ref: (el) => {
      if (el) { /* 元素已创建 */ }           ← 相当于 onmounted
      else     { /* 元素已移除 */ }           ← 相当于 onunmount
    }
  })

props 变化 ─────────────────────────────────────
  return (props) => {
    // 每次 render 都收到最新 props           ← 相当于 onupdate
    if (props.value !== prevValue) { ... }
  }
```

| 旧概念 | 新写法 |
|--------|--------|
| `onmount` | mount 外层函数直接写 |
| `onmounted` | `ref` 的 `if (el)` 分支 |
| `onunmount` | `ref` 的 `else` 分支 |
| `onupdate` | render 内层函数收新 props 自行比较 |
| `全局刷新` | `ctx.ui.render(['_wf_root'])` |
| `局部刷新` | `ctx.ui.render()` 或 `$.x = val` |
| `跨组件刷新` | `ctx.ui.selfId('name')` + `render(['name'])` |

## 组件列表

### 表单核心

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| Button | `Button` | `variant`, `size`, `loading`, `disabled`, `block`, `type` | 按钮 |
| Input | `Input` | `label`, `name`, `type`, `value`, `placeholder`, `required`, `disabled`, `error`, `hint`, `onInput`, `onChange` | 输入框 |
| Textarea | `Textarea` | `rows`, `resize`, `maxLength`, `error` | 文本域 |
| Select | `Select` | `options: SelectOption[]`, `placeholder`, `searchable` | 下拉选择 |

### 表单选择

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| Checkbox | `Checkbox` | `checked`, `label`, `indeterminate` | 复选框 |
| Switch | `Switch` | `checked`, `size` | 开关 |
| RadioGroup | `RadioGroup` | `options: RadioOption[]`, `value`, `name` | 单选组 |
| Slider | `Slider` | `min`, `max`, `step`, `value`, `range` | 滑块 |

### 表单增强

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| Form | `Form` | `onSubmit`, `validation` | 表单容器 |
| Field | `Field` | `label`, `error`, `required`, `help` | 字段包装 |
| FileUpload | `FileUpload` | `accept`, `multiple`, `maxSize`, `onFiles` | 文件上传 |
| SearchInput | `SearchInput` | `value`, `placeholder`, `onSearch`, `loading` | 搜索框 |
| ProgressBar | `ProgressBar` | `value`, `max`, `variant`, `size`, `label` | 进度条 |

### 数据展示

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| Table | `Table` | `columns: TableColumn[]`, `data`, `loading`, `sortable`, `selectable` | 表格 |
| Card | `Card` | `title`, `extra`, `shadow`, `padding` | 卡片 |
| Badge | `Badge` | `variant: BadgeVariant`, `count`, `dot`, `max` | 徽标 |
| Tag | `Tag` | `variant`, `closable`, `onClose` | 标签 |
| Avatar | `Avatar` | `src`, `name`, `size`, `shape` | 头像 |
| StatCard | `StatCard` | `title`, `value`, `trend`, `icon`, `variant` | 统计卡片 |
| PageHeader | `PageHeader` | `title`, `subtitle`, `actions`, `onBack`, `breadcrumb` | 页面标题 |
| Img | `Img` | `src`, `alt`, `fallback`, `lazy`, `fit` | 图片（含 fallback） |
| InView | `InView` | `once`, `threshold`, `rootMargin`, `placeholder`, `onEnter` | 进入视窗后懒加载内容 |

### 数据反馈

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| Modal | `Modal` | `open`, `title`, `onClose`, `width`, `footer`, `closable` | 模态框 |
| Confirm | `Confirm` | `open`, `message`, `confirmText`, `cancelText`, `variant`, `onConfirm`, `onCancel` | 确认对话框（同 `ctx.confirm()` 命令式） |
| Drawer | `Drawer` | `open`, `title`, `onClose`, `position: DrawerPosition`, `width` | 抽屉 |
| Tooltip | `Tooltip` | `content`, `position: TooltipPosition`, `disabled` | 工具提示（hover/focus 触发） |
| Popover | `Popover` | `content`, `position: PopoverPosition`, `trigger`, `open`, `onOpenChange`, `disabled` | 弹出层 |
| Toast | `Toast` | `items: ToastItem[]`, `position`, `max` | 消息提示 |
| Alert | `Alert` | `variant: AlertVariant`, `title`, `closable`, `icon` | 警告提示 |
| Loading | `Loading` | `size`, `text`, `fullscreen` | 加载中 |
| EmptyState | `EmptyState` | `title`, `description`, `action`, `icon` | 空状态 |
| Skeleton | `Skeleton` | `variant: SkeletonVariant`, `lines`, `cols`, `width`, `height` | 骨架屏 |

### 导航组件

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| Breadcrumb | `Breadcrumb` | `items: BreadcrumbItem[]` | 面包屑 |
| Tabs | `Tabs` | `items: TabItem[]`, `activeKey`, `onChange`, `type` | 标签页 |
| Dropdown | `Dropdown` | `trigger`, `items: DropdownItem[]`, `open` | 下拉菜单 |
| Pagination | `Pagination` | `total`, `page`, `pageSize`, `onChange` | 分页 |
| Steps | `Steps` | `items: StepItem[]`, `current`, `direction`, `size` | 步骤条 |
| Accordion | `Accordion` | `items: AccordionItem[]`, `multiple`, `defaultActive` | 手风琴 |

### 图表

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| Chart | `Chart` | `type: ChartType`, `data`, `options`, `title`, `area` | SVG 图表（line/bar/pie）|
| DatePicker | `DatePicker` | `mode: DatePickerMode`, `value`, `onChange`, `placeholder`, `disabled` | 日期选择器（date/datetime/time/range）|
| Editor | `Editor` | `value`, `onChange`, `toolbar`, `placeholder`, `disabled` | 富文本编辑器，零依赖 |

### 布局

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| Divider | `Divider` | `orientation`, `plain` | 分割线（水平/垂直/带文字） |

### 全局工具

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| ThemeSwitch | `ThemeSwitch` | `mode: 'auto'\|'light'\|'dark'`, `onChange`, `storageKey` | 主题切换（auto/light/dark，localStorage 持久化）；另有 `applyTheme()` / `getTheme()` 命令式工具 |

---

# 布局系统 (`weifuwu/layout`)

纯 CSS 布局原语 + 91 个主题 Token。不绑定任何 JS 框架。

> **全栈 weifuwu 项目**：`weifuwu/components/style.css` 已包含布局系统，一条 import 就够了，无需单独引用本页。
> 本页仅适用于**非 weifuwu 项目**或**只需 CSS 布局**的场景。

```html
<link rel="stylesheet" href="/node_modules/weifuwu/layout">
```

或在 weifuwu 服务端通过 `ctx.ui.css` 直接引用包名（`ctx.ui.css` 自动解析 exports map）：

```ts
// 方案 A：组件 + 布局全部搞定（推荐）
app.get('/style.css', (req, ctx) => ctx.ui.css('weifuwu/components/style.css'))

// 方案 B：只用布局
app.get('/layout.css', (req, ctx) => ctx.ui.css('weifuwu/layout'))
```

也支持相对路径：`ctx.ui.css('./src/style.css')`。
```

## 35 个布局原语

| 类别 | 原语 | 效果 |
|------|------|------|
| **排列** | `wf-stack` `wf-stack@sm/md/lg` | 纵向 flex + gap（断点变体→横向） |
| | `wf-stack-reverse` `@sm/md/lg` | 纵向反向 |
| | `wf-row` `wf-row@sm/md/lg` | 横向 flex + wrap + gap |
| | `wf-row-reverse` `@sm/md/lg` | 横向反向 |
| | `wf-nowrap` | flex-wrap: nowrap |
| | `wf-cluster` | 换行居中簇 |
| **分布** | `wf-split` | justify-content: space-between |
| | `wf-center` | 双轴居中 |
| | `wf-right` | justify-content: flex-end |
| | `wf-around` | space-around |
| | `wf-evenly` | space-evenly |
| **对齐** | `wf-top` | align-items: flex-start |
| | `wf-bottom` | align-items: flex-end |
| | `wf-stretch` | align-items: stretch |
| **弹性** | `wf-fill` | flex: 1 + min-width: 0 |
| | `wf-fixed` | flex: none |
| | `wf-auto` | flex: auto |
| | `wf-shrink` | min-width/height: 0 |
| **Z轴** | `wf-cover` | position: fixed + inset: 0 |
| | `wf-pop` | position: absolute |
| | `wf-anchor` | position: relative |
| | `wf-layer` | position: relative + z-index |
| | `wf-sticky` | position: sticky |
| **容器** | `wf-surface` | 基础面（border-radius + shadow + bg） |
| | `wf-grid` | display: grid + --wf-cols |
| | `wf-container` | max-width + margin: auto |
| | `wf-scroll` | overflow: auto |
| | `wf-clip` | overflow: hidden |
| **显隐** | `wf-hidden` `wf-hidden@sm/md/lg` | display: none |
| | `wf-block` `wf-block@sm/md/lg` | display: block |
| | `wf-inline` | display: inline |
| | `wf-inline-block` | display: inline-block |
| | `wf-contents` | display: contents |

## 91 个主题 Token

```css
/* 品牌色 */
--wf-color-primary / --wf-color-primary-hover / --wf-color-primary-bg
--wf-color-secondary / --wf-color-secondary-bg

/* 语义色 */
--wf-color-success / --wf-color-success-bg
--wf-color-warning / --wf-color-warning-bg
--wf-color-error / --wf-color-error-bg
--wf-color-info / --wf-color-info-bg

/* 文字色 */
--wf-color-text / --wf-color-text-secondary / --wf-color-text-tertiary / --wf-color-text-disabled

/* 背景色 */
--wf-color-bg / --wf-color-bg-secondary / --wf-color-bg-tertiary

/* 边框色 */
--wf-color-border / --wf-color-border-light / --wf-color-border-dark

/* 字体 */
--wf-font-sans / --wf-font-mono

/* 字号: xs sm base lg xl 2xl 3xl 4xl 5xl */
--wf-font-size-*

/* 字重: normal medium semibold bold */
--wf-font-weight-*

/* 行高: tight normal relaxed */
--wf-line-height-*

/* 字距: normal wide wider */
--wf-letter-spacing-*

/* 间距: xs sm md lg xl 2xl */
--wf-space-*

/* 间隔: xs sm md lg xl 2xl */
--wf-gap-*

/* 圆角: sm md lg xl */
--wf-radius-*

/* 阴影: sm md lg */
--wf-shadow-*

/* 其他 */
--wf-border-width / --wf-focus-ring
--wf-transition-duration / --wf-transition-timing
--wf-accent-color / --wf-caret-color
--wf-opacity-disabled / --wf-opacity-overlay
--wf-pop-z / --wf-cover-z
```

### 暗色模式

两种激活方式（显式 `data-theme` 优先级更高）：

```ts
// 1. 手动切换
// document.documentElement.setAttribute('data-theme', 'dark')
// document.documentElement.setAttribute('data-theme', 'light') // 强制亮色

// 2. 自动：系统暗色偏好（无需任何代码）
// 系统为暗色时自动生效；加 data-theme="light" 可强制亮色
```

---

# 样式定制指南

## 全局主题变量

所有组件引用 `--wf-*` CSS 变量。在根元素覆盖即可定制主题：

```css
:root {
  --wf-color-primary: #6366f1;
  --wf-color-primary-hover: #4f46e5;
  --wf-radius: 8px;
  --wf-font-sans: 'Inter', system-ui, sans-serif;
}
```

## 暗色模式

两种激活方式（显式 `data-theme` 优先级高于系统偏好）：

```ts
// 手动切换
document.documentElement.setAttribute('data-theme', 'dark')

// 强制亮色（系统为暗色时也保持亮色）
document.documentElement.setAttribute('data-theme', 'light')
```

未设置 `data-theme` 时，自动跟随系统偏好：`@media (prefers-color-scheme: dark)` 下自动切换暗色。

所有 `--wf-*` 变量在暗色下自动切换。可自定义暗色变量：

```css
[data-theme="dark"] {
  --wf-color-bg: #1a1a2e;
  --wf-color-text: #e0e0e0;
  --wf-color-border: #2a2a4a;
}

/* 自定义系统自动暗色的变量（需与上面同步） */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --wf-color-bg: #1a1a2e;
    --wf-color-text: #e0e0e0;
    --wf-color-border: #2a2a4a;
  }
}
```

## 组件级覆盖

```css
/* 覆盖 Button 主色 */
.wf-btn--primary {
  background: #06b6d4;
  border-color: #06b6d4;
}

/* 覆盖 Modal 圆角 */
.wf-modal-content {
  border-radius: 16px;
}
```

## 作用域主题

```html
<div style="--wf-color-primary: #f59e0b;">
  <!-- 此区域内组件使用金色主题，外部不受影响 -->
  <button class="wf-btn wf-btn--primary">金色按钮</button>
</div>
```

CSS 变量会沿 DOM 树继承，利用这一点可实现多主题共存。

---

# 组合场景示例

## 登录表单

```tsx
const LoginPage = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.errors = {}
  $.submitting = false

  return (props) =>
    h('div', { class: 'wf-stack', style: { maxWidth: 400, margin: '40px auto' } },
      h(Card, { shadow: 'md' },
        h('div', { class: 'wf-stack', style: { gap: 'var(--wf-space-md)' } },
          h('h2', {}, '登录'),
          h(Form, {
            validation: {
              email: [{ required: true, pattern: /@/, message: '请输入有效邮箱' }],
              password: [{ required: true, minLength: 6, message: '密码至少6位' }],
            },
            onSubmit: async (values) => {
              $.submitting = true
              await ctx.api?.post('/login', values)   // api 客户端由中间件注入 ctx.api
              $.submitting = false
            },
            onError: (errors) => { $.errors = errors },
          }, [
            h(Field, { label: '邮箱', error: $.errors.email },
              h(Input, { name: 'email', type: 'email', placeholder: 'name@example.com' })),
            h(Field, { label: '密码', error: $.errors.password },
              h(Input, { name: 'password', type: 'password' })),
            h(Button, { type: 'submit', loading: $.submitting, block: true }, '登录'),
          ])
        )
      )
    )
}
```

## 数据列表 + 搜索

```tsx
const UserList = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.keyword = ''
  $.sortKey = 'name'
  $.sortOrder = 'asc'
  const users = [
    { id: 1, name: '张三', email: 'zhang@example.com', role: '管理员' },
    { id: 2, name: '李四', email: 'li@example.com', role: '编辑' },
  ]

  return (props) => {
    // 派生数据必须在 render 内计算（每次 render 读最新 $.keyword）
    const filtered = users.filter(u =>
      !$.keyword || u.name.includes($.keyword) || u.email.includes($.keyword)
    )

    return h('div', { class: 'wf-stack', style: { gap: 'var(--wf-space-md)' } },
      h('div', { class: 'wf-row', style: { justifyContent: 'space-between', alignItems: 'center' } },
        h(SearchInput, { placeholder: '搜索用户...', value: $.keyword, onSearch: (v: string) => { $.keyword = v } }),
        h(Button, { variant: 'primary' }, '新建用户'),
      ),
      h(Table, {
        columns: [
          { key: 'id', label: 'ID', width: 60 },
          { key: 'name', label: '姓名', sortable: true },
          { key: 'email', label: '邮箱', sortable: true },
          { key: 'role', label: '角色' },
        ],
        data: filtered,
        sortKey: $.sortKey,
        sortOrder: $.sortOrder,
        onSort: (key, order) => { $.sortKey = key; $.sortOrder = order },
        emptyText: '无匹配用户',
      }),
      h(Pagination, { total: filtered.length, page: 1, pageSize: 10, onChange: (p: number) => {} }),
    )
  }
}
```

## 消息提示

```tsx
// 在任意组件中调用
let toastId = 0

function showToast(ctx: WfuiContext, type: ToastType, message: string) {
  // 通过 ctx 管理 Toast 列表
  const $ = ctx.ui.$()
  $.toasts = $.toasts ?? []
  const id = String(++toastId)
  $.toasts = [...$.toasts, { id, type, message }]

  // 自动消失
  if (type !== 'error') {
    setTimeout(() => {
      $.toasts = $.toasts.filter((t: any) => t.id !== id)
    }, 3000)
  }
}

// 页面中使用
const App = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.toasts = []

  return (props) =>
    h('div', {}, [
      h(Button, {
        onClick: () => showToast(ctx, 'success', '操作成功'),
      }, '显示提示'),
      h(Toast, {
        toasts: $.toasts,
        position: 'top-right',
        max: 3,
        onRemove: (id) => { $.toasts = $.toasts.filter((t: any) => t.id !== id) },
      }),
    ])
}
```

---

# 环境变量

| 变量 | 用途 | 模块 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgres()` |
| `REDIS_URL` | Redis 连接字符串 | `redis()` |

---

# 开发命令

```bash
npm run build       # 构建 dist/
npm run typecheck   # TypeScript 类型检查
npm test            # 运行 node --test
node scripts/release.mjs <version>   # 发布
```

```bash
# 测试前启动依赖服务
docker compose up -d
```

---

# SaaS 地基模块（rateLimit / email / userSystem / queue）

四个内建模块组成一个"基本 SaaS 底座"：认证、异步任务、限流、邮件——零新增依赖
（只依赖已自研的 redis / postgres 客户端与 node 标准库）。

## rateLimit — 限流

```ts
import { rateLimit } from 'weifuwu'

app.use(redis())                                        // 依赖 ctx.redis
app.use(rateLimit({ windowMs: 60_000, max: 100 }))      // 全局限流（默认固定窗口）

app.get('/api/search', async (req, ctx) => {
  await ctx.limit('search', { max: 30, windowMs: 60_000 })  // 手动限流，超限抛 429
})

// 登录防爆破（配合 userSystem）：组合键 ip:email
app.use(rateLimit({ key: (req) => `login:${req.ip}:${req.email}`, max: 5, windowMs: 15 * 60_000 }))
```

| 选项 | 默认 | 说明 |
|------|------|------|
| `windowMs` | `60000` | 时间窗口 |
| `max` | `100` | 窗口内最大请求 |
| `key` | X-Forwarded-For | 限流键（生产环境配置反向代理注入） |
| `algorithm` | `fixed` | `fixed`（INCR+EXPIRE，原子）\| `sliding`（ZSET，仅 redis） |
| `store` | `redis` | `redis`（多实例一致）\| `memory`（仅单实例/开发） |

- 响应自动带 `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset` / `Retry-After`
- 多实例共享计数：计数在 redis，水平扩展天然一致

## email — 邮件发送

```ts
import { email } from 'weifuwu'

app.use(email({ from: 'no-reply@your.app', adapter: 'resend', resend: { apiKey: process.env.RESEND_API_KEY } }))
// 或 adapter: 'smtp' + smtp: { host, port, user, pass }（自研 SMTP 客户端，零依赖）

app.post('/api/notify', async (req, ctx) => {
  await ctx.email.send({ to: 'user@x.com', subject: '通知', html: '<h1>hi</h1>' })
})
```

- 适配器：`resend`（默认，一个 POST）/ `smtp`（自研 node:net + node:tls：EHLO/STARTTLS/AUTH PLAIN/DATA/dot-stuffing，非 ASCII subject 自动 RFC2047 编码）/ 自定义函数
- 裁剪：附件、退信/送达率（服务商职责）、批量营销不支持

## userSystem — 用户系统

```ts
import { userSystem } from 'weifuwu'

const db = postgres()
await db.migrate()
const users = userSystem({ sql: db.sql, secret: process.env.AUTH_SECRET })
await users.migrate()          // 幂等建表（users + sessions）
app.use(db)
app.use(users)                 // 注入 ctx.user / ctx.auth
users.routes(app)              // POST /api/auth/register|login|logout|refresh + GET /api/auth/me

app.get('/me', (req, ctx) => ok(ctx.user))        // 已注入
app.post('/secure', (req, ctx) => { ctx.auth.requireAuth(); ... })
```

- **安全基线**：scrypt 密码哈希（per-user salt + timing-safe，异步不阻塞）；access token = HMAC-SHA256 JWT（与 `weifuwu/client` 的 `auth()` 天然配对）；refresh token = 不透明随机串，DB 只存哈希，logout/轮换即撤销
- **防枚举**：登录失败统一 401（不泄露邮箱是否存在）
- **`ctx.auth` 方法面**：`register` / `login` / `logout` / `requireAuth` / `setPassword(userId, newPwd)` / `createToken(type, payload, { ttlSeconds })`（邮箱验证/密码重置自接）
- **裁剪**：OAuth、邮箱验证邮件（给底层 API 自接）、多因素、RBAC 权限引擎（只留 `role` 字段）、多租户语义（tenant-ready：`tenant` 字段 + token claim 已预留）

## queue — 可靠任务队列

```ts
import { queue } from 'weifuwu'

const q = queue()              // 默认 REDIS_URL
app.use(q)                     // 注入 ctx.queue

app.post('/api/generate', async (req, ctx) => {
  await ctx.queue.add('llm.batch', { prompt: '...' }, { attempts: 3 })
  return new Response(null, { status: 202 })  // 立即 202，任务后台执行
})

// 消费者（独立进程或同进程均可，多开安全）
const worker = q.worker('llm.batch', async (job) => {
  await runLLM(job.data)       // 失败自动重试 → 用尽进 DLQ（q:llm.batch:dead）
}, { concurrency: 5, visibilityTimeout: 30_000 })
await worker.start()
await worker.stop()            // 优雅停止
```

- **语义**：at-least-once（handler 可能重复执行——幂等由业务保证）；Redis Streams 消费组，多 worker 实例不重复消费
- **可靠性**：失败 → 延迟重试（间隔 = `visibilityTimeout`，ZSET 延迟队列）→ attempts 用尽 → DLQ；worker 崩溃 → pending 由其他实例 `XAUTOCLAIM` 接管
- 裁剪：延迟调度（除重试外）、cron、优先级、指数退避、速率限制不支持

## ai — LLM 对话（自研协议 + 零依赖客户端）

```ts
import { ai } from 'weifuwu'

const a = ai()          // DEEPSEEK_API_KEY / BASE_URL / MODEL 自动读 env，默认 deepseek-v4-flash
app.use(a)              // 注入 ctx.ai（worker/非请求场景也可直接 a.chat()）

// 流式对话：路由一行返回 SSE（wf: 协议，详见 docs/ai-contract.md）
app.post('/api/chat', async (req, ctx) => {
  const { messages } = await req.json()
  return ctx.ai.stream({ messages }, {
    signal: req.signal,                                    // 断开即取消 provider 请求
    traceId: req.headers.get('x-trace-id') ?? undefined,   // 追踪关联（协议 §7）
  })
})

// 非流式（worker/后台）：
const res = await a.chat({ messages: [{ role: 'user', content: 'hi' }] })
```

前端解码（`weifuwu/client`）：

```ts
import { aiStream } from 'weifuwu/client'

const handle = aiStream('/api/chat', { messages }, {
  onToken: (text) => { /* 增量 append 到消息 */ },
  onToolCall: (call) => { /* 渲染工具卡片 */ },
  onDone: () => { /* 收尾 */ },
  onError: (e) => { /* 按 e.code 降级 */ },
  onEvent: (name, data) => { /* x:* 自定义事件透传 */ },
})
handle.abort()  // 用户停止/组件卸载/导航跳走
```

- **协议**：`wf:` 命名空间（message_start/token/tool_call/tool_progress/usage/done/error + agent 扩展），SSE 下行 + POST 上行，错误即值、未知事件透传、`x:*` 自定义事件（详见 [docs/ai-contract.md](./docs/ai-contract.md)）
- **零依赖**：自研 OpenAI 兼容客户端（fetch + SSE 解析），默认 DeepSeek，`baseUrl` 可换任意 OpenAI 兼容端点（Ollama/vLLM/Moonshot…）
- **追踪**：前端自动生成 `X-Trace-Id` → 后端以之作为 `message_start.id` → 工具内请求继承同一 traceId，整个 agent run 一次搜完
- **裁剪**：embeddings、Anthropic 原生协议、agent 引擎、审批持久化暂不支持；agent 审批事件（approval_request/response）schema 先行，实现按信号

## 组合示例：注册 → 验证邮件 → 欢迎任务 → 登录防爆破

```ts
app.use(redis())
app.use(rateLimit({ key: (req) => `login:${req.ip}`, max: 5, windowMs: 60_000 }))  // 防爆破
app.use(email({ from: 'no-reply@x.com', adapter: 'resend', resend: { apiKey } }))
app.use(db)
app.use(users)
users.routes(app)

// 注册：限流守卫 → 用户系统 → 验证邮件 → 欢迎任务入队
app.post('/api/auth/register', async (req, ctx) => {
  await ctx.limit(`register:${req.ip}`, { max: 10, windowMs: 60_000 })
  const result = await ctx.auth.register(await req.json())
  const token = ctx.auth.createToken('verify', { sub: result.user.id }, { ttlSeconds: 86400 })
  await ctx.email.send({ to: result.user.email, subject: '验证邮箱', html: `...?token=${token}` })
  await ctx.queue.add('welcome.flow', { userId: result.user.id })
  return created(result)
})

const worker = q.worker('welcome.flow', async (job) => { /* 欢迎流程 */ })
await worker.start()
```
