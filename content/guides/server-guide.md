# 后端开发指南

> 从 docs/server.md 迁移（content/ 文档库——随 npm 包发布，与框架版本同步）。
> 本页为叙述性指南——组件/能力逐项参考见 content/ 各域目录。

# 后端 API — HTTP 服务层（weifuwu）

> 以下为完整 API 参考，按需查阅。新手建议先阅读 README 的「核心概念」和「快速开始」。

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
| `timeout` | `number` | `120000` | Socket 超时（ms，2 分钟，适配 LLM 生成等长任务） |
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

> 请求体上限常量 `DEFAULT_MAX_BODY`（10MB）见上方 serve 选项表 `maxBodySize`。

---

## 响应辅助函数

> 以下为完整 API 参考，按需查阅。五个 SaaS 地基模块（rateLimit / email / userSystem / messager / queue）见文末「SaaS 地基模块」章节。

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
import type { MessagerOptions, MessagerClient, MessagerInjected } from 'weifuwu'
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
