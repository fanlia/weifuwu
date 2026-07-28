# weifuwu

**全栈框架 — 后端 HTTP 路由 + 前端 VDOM 框架 + 纯 CSS 布局系统**

```bash
npm install weifuwu
```

一个包 = 后端 (`weifuwu`) + 前端 (`weifuwu/client`) + 组件库 (`weifuwu/components`) + 布局系统 (`weifuwu/layout`)。

---

## 模块总览

| 导入路径 | 模块 | 用途 | 依赖 |
|---------|------|------|------|
| `weifuwu` | **Router** | Trie 路由 + 中间件链 + WebSocket + GraphQL | — |
| `weifuwu` | **serve** | HTTP 服务器 | Router |
| `weifuwu` | **cors** | CORS 跨域中间件 | Router |
| `weifuwu` | **serveStatic** | 静态文件服务（ETag/304/目录索引） | Router |
| `weifuwu` | **postgres** | PostgreSQL 连接池 → `ctx.sql` | Router, DATABASE_URL |
| `weifuwu` | **redis** | Redis 客户端 → `ctx.redis` | Router, REDIS_URL |
| `weifuwu` | **ui** | SSR 渲染 + esbuild JS/CSS 动态编译 → `ctx.ui` | Router |
| `weifuwu` | **graphql** | GraphQL 端点（支持 GraphiQL） | Router |
| `weifuwu` | **createMiddleware** | 类型安全中间件工厂 | — |
| `weifuwu` | **response** | HTTP 响应辅助函数（ok/badRequest/...） | — |
| `weifuwu` | **parseBody** | JSON 请求体安全解析 | — |
| `weifuwu/client` | **createApp** | 应用引导 + VDOM 渲染引擎 | — |
| `weifuwu/client` | **router / RouteView** | 前端路由（history/hash 模式） | createApp |
| `weifuwu/client` | **api / auth / ws** | HTTP 客户端 / 认证 / WebSocket 中间件 | createApp |
| `weifuwu/client` | **i18n** | 国际化中间件（运行时切换语言） | createApp |
| `weifuwu/client` | **ErrorBoundary** | 错误边界组件 | createApp |
| `weifuwu/client` | **confirm** | Promise 化确认对话框 | createApp |
| `weifuwu/client** | **lockScroll/trapFocus** | 滚动锁定 / 焦点陷阱工具 | — |
| `weifuwu/components` | **38 个组件** | Button/Table/Modal/Toast/... | weifuwu/client |
| `weifuwu/layout` | **CSS 布局** | 35 个布局原语 + 72 个主题 Token | — |

---

## 快速开始

```ts
// server.ts
import { serve, Router, ui, cors, serveStatic } from 'weifuwu'

const app = new Router()
app.use(cors())
app.use(ui())

// SPA 入口
app.get('/', (req, ctx) => ctx.ui.html`
  <!doctype html><html><body>
    <div id="root"></div>
    <script src="/app.js"></script>
  </body></html>
`)

// 动态编译前端 TSX（零构建步骤）
app.get('/app.js', (req, ctx) => ctx.ui.js('./src/main.tsx'))
app.get('/style.css', (req, ctx) => ctx.ui.css('./src/style.css'))

// API
app.get('/api/hello', () => Response.json({ msg: 'world' }))

serve(app, { port: 3000 })
```

```tsx
// src/main.tsx
import { createApp, router, RouteView } from 'weifuwu/client'

function Home() { return <h1>Hello weifuwu</h1> }

createApp()
  .use(router({ routes: [{ path: '/', component: Home }] }))
  .mount('#root', () => <RouteView />)
```

---

# 后端 API (`weifuwu`)

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

## postgres — PostgreSQL 客户端

```ts
import { postgres, MIGRATIONS_TABLE } from 'weifuwu'

// 注入 ctx.sql — postgres.js 客户端
app.use(postgres())

// 使用 ctx.sql
app.get('/users', async (req, ctx) => {
  const users = await ctx.sql`SELECT * FROM users WHERE active = ${true}`
  return Response.json(users)
})

// 事务
app.post('/transfer', async (req, ctx) => {
  const result = await ctx.sql.begin(async sql => {
    await sql`UPDATE accounts SET balance = balance - 100 WHERE id = 1`
    await sql`UPDATE accounts SET balance = balance + 100 WHERE id = 2`
  })
  return Response.json({ ok: true })
})
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `url` | `string` | `DATABASE_URL` 环境变量 | 连接字符串 |
| `max` | `number` | `10` | 连接池大小 |
| `idleTimeout` | `number` | `30` | 空闲连接超时（秒）|
| `maxLifetime` | `number` | `3600` | 连接最大生存时间（秒）|

| ctx 注入 | 类型 | 说明 |
|----------|------|------|
| `ctx.sql` | `postgres.Sql` | postgres.js 客户端（模板标签）|
| `ctx.sql.close()` | `() => Promise<void>` | 关闭连接池 |

```ts
// 关闭
const pg = postgres()
app.use(pg)
// 关闭时框架自动调用 pg.close()
```

---

## redis — Redis 客户端

```ts
import { redis } from 'weifuwu'

app.use(redis())

app.get('/cache/:key', async (req, ctx) => {
  const val = await ctx.redis.get(ctx.params.key)
  if (!val) return Response.json({ miss: true })
  return Response.json({ value: val })
})

app.post('/cache/:key', async (req, ctx) => {
  const { value } = await req.json()
  await ctx.redis.set(ctx.params.key, JSON.stringify(value), 'EX', 3600)
  return Response.json({ ok: true })
})
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `url` | `string` | `REDIS_URL` 环境变量 | 连接字符串 |
| `options` | `RedisOptions` | — | ioredis 配置选项 |

| ctx 注入 | 类型 | 说明 |
|----------|------|------|
| `ctx.redis` | `ioredis.Redis` | ioredis 实例 |
| `ctx.redis.close()` | `() => Promise<void>` | 关闭连接 |

支持全部 ioredis API：`get`, `set`, `del`, `hget`, `hset`, `lpush`, `publish` 等。

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
| `ctx.ui.css(entryPath)` | `(string) => Promise<Response>` | 读取/编译 CSS（自动 PostCSS + Tailwind） |

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
app.get('/app.js', (req, ctx) => ctx.ui.js('./src/main.tsx'))
```

使用 esbuild 编译：
- `bundle: true`, `format: 'esm'`, `platform: 'browser'`
- `jsx: 'automatic'`, `jsxImportSource: 'weifuwu/client'`
- 带 mtime 缓存验证（开发时编辑文件后自动失效）

### ctx.ui.css — CSS 编译

```ts
app.get('/style.css', (req, ctx) => ctx.ui.css('./src/style.css'))
```

- 纯 CSS 文件直接返回
- 检测到 `postcss` + `@tailwindcss/postcss` 时自动编译 Tailwind CSS
- 带 mtime 缓存验证

---

## graphql — GraphQL 端点

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

零外部 npm 运行时依赖。组件模型：纯函数 `(props, ctx) => VNode`。

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

  ctx.ui.onmounted((el) => {
    console.log('DOM 已创建', el)
  })

  // ── render ──
  return (props) =>
    h('button', { onClick: () => { count++; ctx.ui.render() } }, count)
}
```

| 规则 | 说明 |
|------|------|
| 组件签名 | `(initProps: P, ctx: WfuiContext) => (props: P) => VNode \| null` |
| mount 阶段 | 外层函数只执行一次，初始化状态/注册生命周期 |
| render 阶段 | 内层函数每次 dirty/props 变化时执行，返回 VNode |
| 无 class | 无 `this`，无实例方法 |
| 无 hook | 无 `useState` / `useEffect` / `useMemo` |
| 状态 | 闭包变量 + `ctx.ui.render()` 手动触发，或 `ctx.ui.$()` 响应式容器 |
| 生命周期 | `ctx.ui.onmount / onmounted / onunmount / onupdate` |

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

### VNode 结构

```ts
interface VNode {
  type: string | Component | typeof Fragment
  props: Record<string, any>
  key?: string
  el?: Node           // 对应 DOM（框架内部）
  _$?: Record<string, any>  // 组件状态 + hooks（框架内部）
  _child?: any        // 子 VNode 缓存
  _render?: Function  // 两阶段 render 函数
  _cleanup?: (() => void)  // onmounted 清理函数
  _portalEl?: HTMLElement  // Portal 子容器
}
```

---

## 状态管理

### 闭包变量 + `ctx.ui.render()`（推荐）

```tsx
const Counter: Component = (_init, ctx) => {
  let count = 0

  return (props) =>
    h('button', { onClick: () => { count++; ctx.ui.render() } }, count)
}
```

读写明确，`ctx.ui.render()` 是显式渲染承诺。

### `ctx.ui.$()` — 响应式状态容器

`ctx.ui.$()` 返回浅 Proxy，赋值自动触发 `dirty()`（微任务批量渲染）：

```tsx
const FormPage: Component = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.email = ''
  $.password = ''

  return (props) =>
    h('div', {}, [
      h('input', { value: $.email, onInput: (e: any) => { $.email = e.target.value } }),
      h('input', { value: $.password, onInput: (e: any) => { $.password = e.target.value } }),
    ])
}
```

| API | 说明 |
|-----|------|
| `ctx.ui.$()` | 创建响应式状态容器（浅 Proxy，赋值自动 dirty）|
| `ctx.ui.render()` | 立即同步渲染 |
| `ctx.ui.dirty()` | 标记脏状态，下个微任务批量渲染 |

### 渲染保护

mount/render/onmount/onupdate/onunmount 期间 `_rendering = true`，`$.x = val` **不触发渲染**。仅事件/timer/Promise.then 中生效。

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

## 生命周期

框架不提供 `ref` prop。使用 `ctx.ui.onmount / onmounted / onunmount / onupdate`：

| API | 触发时机 | 参数 | 返回值 |
|-----|---------|------|--------|
| `ctx.ui.onmount(fn)` | render 前（DOM 未创建） | `() => void` | — |
| `ctx.ui.onmounted(fn)` | 首次 render 后（DOM 已创建） | `(el: Element) => cleanup` | `() => void`（可选 cleanup）|
| `ctx.ui.onunmount(fn)` | 组件移除前 | `() => void` | — |
| `ctx.ui.onupdate(fn)` | props 变化时 | `(prevProps) => void` | — |

```tsx
const Timer: Component = (_init, ctx) => {
  let timer: ReturnType<typeof setInterval> | undefined

  ctx.ui.onmounted((el) => {
    timer = setInterval(() => console.log('tick'), 1000)
    return () => clearInterval(timer)
  })

  return (props) => h('div', {}, 'Timer')
}
```

**注意**：`onmounted` 在首次渲染后触发，此时 DOM 已创建。**所有生命周期回调执行期间 `_rendering = true`**，`$.x = val` 不触发额外渲染。

对于**内嵌元素**（非根元素），用 `el.querySelector()`：

```tsx
ctx.ui.onmounted((el) => {
  const input = el.querySelector('input[type="text"]') as HTMLElement
  input?.focus()
})
```

所有钩子遵循替换模式：多次注册只保留最后一次。

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
  .mount('#root', () => <RouteView />)
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
  return (
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
  if (!ctx.auth?.isLoggedIn) return <p>请登录</p>
  return <p>欢迎, {ctx.auth?.user?.name}</p>
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
// → 自动触发全应用重渲染
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

```tsx
import { createApp, confirm } from 'weifuwu/client'

createApp()
  .use(confirm())
  .mount('#root', App)

// 在组件中使用
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

| ConfirmOptions | 类型 | 默认值 | 说明 |
|----------------|------|--------|------|
| `title` | `string` | `'确认操作'` | 对话框标题 |
| `confirmText` | `string` | `'确定'` | 确认按钮文字 |
| `cancelText` | `string` | `'取消'` | 取消按钮文字 |
| `variant` | `'primary' \| 'danger'` | `'primary'` | 按钮样式变体 |

- 直接 DOM 渲染（不经过 VDOM）
- 返回 `Promise<boolean>`
- ESC / 点击遮罩 → resolve(false)
- 自动锁定背景滚动

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
import type { ConfirmOptions, ConfirmState } from 'weifuwu/client'
import type { RouterOptions } from 'weifuwu/client'
```

| 类型 | 说明 |
|------|------|
| `VNode` | `{ type, props, key?, el?, _$?, _child?, _cleanup? }` |
| `VNodeType` | `string \| Component \| typeof Fragment` |
| `Component<P>` | `(props: P, ctx: WfuiContext) => VNode \| null` |
| `WfuiContext` | `{ ui, route?, app?, ws?, api?, auth?, i18n?, confirm?, [key]: unknown }` |
| `AppMiddleware` | `(ctx: WfuiContext) => WfuiContext` |
| `RouteDef` | `{ path, component?, layout?, children?, auth?, title? }` |
| `ApiClient` | `{ get, post, put, patch, delete }` |
| `ApiError` | `class { status, body } extends Error` |
| `AuthClient` | `{ token, user, isLoggedIn, login, logout, setUser, refresh }` |
| `I18nOptions` | `{ locale?, messages?, components? }` |
| `I18nState` | `{ locale, t, setLocale, components }` |
| `ErrorBoundaryProps` | `{ fallback?, children? }` |
| `ConfirmOptions` | `{ title?, confirmText?, cancelText?, variant? }` |

---

# 组件库 (`weifuwu/components`)

38 个 HTML 原语组件。每个是 `(props, ctx) => VNode` 纯函数，引用 `--wf-*` CSS 变量做主题。

```ts
import { Button, Input, Table, Modal, Toast } from 'weifuwu/components'
import 'weifuwu/components/style.css'
```

## 组件列表

### 表单核心

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| Button | `Button` | `variant`, `size`, `loading`, `disabled`, `block`, `type` | 按钮 |
| Input | `Input` | `variant`, `size`, `placeholder`, `disabled`, `error`, `prefix`, `suffix` | 输入框 |
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
| Drawer | `Drawer` | `open`, `title`, `onClose`, `position: DrawerPosition`, `width` | 抽屉 |
| Tooltip | `Tooltip` | `content`, `position: TooltipPosition`, `trigger` | 工具提示 |
| Popover | `Popover` | `content`, `position: PopoverPosition`, `trigger` | 弹出层 |
| Toast | `Toast` | `items: ToastItem[]`, `position`, `max` | 消息提示 |
| Alert | `Alert` | `variant: AlertVariant`, `title`, `closable`, `icon` | 警告提示 |
| Loading | `Loading` | `size`, `text`, `fullscreen` | 加载中 |
| EmptyState | `EmptyState` | `title`, `description`, `action`, `icon` | 空状态 |
| Skeleton | `Skeleton` | `variant: SkeletonVariant`, `rows`, `width`, `height` | 骨架屏 |

### 导航组件

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| Breadcrumb | `Breadcrumb` | `items: BreadcrumbItem[]` | 面包屑 |
| Tabs | `Tabs` | `items: TabItem[]`, `activeKey`, `onChange`, `type` | 标签页 |
| Dropdown | `Dropdown` | `items: DropdownItem[]`, `trigger`, `placement` | 下拉菜单 |
| Pagination | `Pagination` | `total`, `page`, `pageSize`, `onChange` | 分页 |
| Steps | `Steps` | `items: StepItem[]`, `current`, `direction`, `size` | 步骤条 |
| Accordion | `Accordion` | `items: AccordionItem[]`, `multiple`, `defaultActive` | 手风琴 |

### 布局

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| Divider | `Divider` | `orientation`, `plain` | 分割线（水平/垂直/带文字） |

---

# 布局系统 (`weifuwu/layout`)

纯 CSS 布局原语 + 72 个主题 Token。不绑定任何 JS 框架。

```html
<link rel="stylesheet" href="/node_modules/weifuwu/dist/layout/weifuwu-layout.css">
```

或通过 `ctx.ui.css` 服务：

```ts
app.get('/layout.css', (req, ctx) => ctx.ui.css('./node_modules/weifuwu/dist/layout/weifuwu-layout.css'))
```

## 35 个布局原语

| 类别 | 原语 | 效果 |
|------|------|------|
| **排列** | `wf-stack` | 纵向 flex + gap |
| | `wf-stack-reverse` | 纵向反向 |
| | `wf-row` | 横向 flex + wrap + gap |
| | `wf-row-reverse` | 横向反向 |
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
| **显隐** | `wf-hidden` | display: none |
| | `wf-block` | display: block |
| | `wf-inline` | display: inline |
| | `wf-inline-block` | display: inline-block |
| | `wf-contents` | display: contents |

## 72 个主题 Token

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

```ts
document.documentElement.setAttribute('data-theme', 'dark')
// 所有 var(--wf-*) 自动切换
```

---

# 核心概念

## 中间件模式（前后端一致）

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

## 状态管理

| 模式 | 后端 | 前端 |
|------|------|------|
| 注入 | 中间件注入 ctx.field | 中间件注入 ctx.field |
| 读取 | handler 读取 ctx | 组件读取 ctx |
| 渲染 | 返回 Response | `ctx.ui.render()` / `ctx.ui.dirty()` 触发 VDOM patch |

## Closeable 接口

所有有状态模块（postgres、redis）实现 `close(): Promise<void>`，serve 关闭时自动调用。

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
