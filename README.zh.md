---
name: weifuwu
description: 面向 Node.js 的 Web 标准 HTTP 框架 — (req, ctx) => Response
---

# weifuwu

**面向 Node.js 的 Web 标准 HTTP 框架。** `(req, ctx) => Response` — 没有框架特有的对象，只有浏览器原生支持的 Web API。

### 设计理念

weifuwu 不发明自己的请求/响应抽象。`Request` 和 `Response` 就是你在 `fetch()` 中使用的那套 API——你在浏览器中学到的知识可以直接用在服务端。`ctx` 是唯一的框架对象，它只携带路由解析的结果（`params`、`query`）。

所有功能遵循相同的 `(req, ctx) => Response` 约定。Router 负责 HTTP 路由和 WebSocket。其他所有功能——认证、校验、数据库、GraphQL、AI——都是独立的模块，通过 `app.use()` 挂载。

## 功能特性

- **Web 标准** — `Request` / `Response` / `ReadableStream`，零抽象
- **零构建** — Node.js v24+ 原生 TypeScript，核心零依赖
- **Trie 路由器** — 静态 > 参数 > 通配符，子路由挂载，WebSocket
- **中间件** — 全局/路径级/路由级 — 洋葱模型，支持短路
- **模块** — 认证、校验、上传、压缩、限流、Cookie、静态文件、CORS、日志
- **React SSR** — `tsx()` — 页面、布局、数据加载、路由处理、Tailwind CSS、HMR
- **PostgreSQL** — 类型安全 DDL + CRUD 的 schema 构建器，事务，向量搜索
- **认证** — 密码 + JWT + OAuth2 服务端（authorization code / PKCE / client_credentials）
- **实时** — WebSocket，带 agent 路由的消息频道
- **AI** — 流式端点，DAG 工作流工具，支持 RAG 和工具调用的 AI agent
- **数据** — Redis 客户端，支持 cron 调度的任务队列
- **多租户 BaaS** — 动态表，自动 REST + GraphQL，行级隔离
- **部署** — 自托管 PaaS：多应用代理，零停机更新，自动 SSL
- **国际化** — 语言检测，JSON 翻译，`ctx.t()`
- **邮件** — SMTP 或自定义传输
- **健康检查** — 可配置的 `/health` 端点
- **环境变量** — `loadEnv()` — 将 `.env` 文件加载到 `process.env`
- **测试工具** — `createTestServer()` — 一行代码搭建测试服务

## 快速开始

### Hello World

```ts
import { serve } from 'weifuwu'
serve((req, ctx) => new Response('Hello, World!'), { port: 3000 })
```

### 完整应用

```ts
import { serve, Router, postgres, user, aiStream, graphql } from 'weifuwu'
import { openai } from '@ai-sdk/openai'

const app = new Router()
const pg = postgres()

// 认证
const auth = user({ pg, jwtSecret: process.env.JWT_SECRET! })
await auth.migrate()
app.use('/auth', auth.router())

// AI 流式
const chat = await aiStream(async (req) => ({
  model: openai('gpt-4o'),
  messages: (await req.json()).messages,
}))
app.use('/chat', chat.router())

// GraphQL
const gql = graphql(() => ({
  schema: `type Query { hello: String }`,
  resolvers: { Query: { hello: () => 'world' } },
}))
app.use('/graphql', gql.router())

// 静态文件
app.get('/static/*', serveStatic('./public'))

serve(app.handler(), { port: 3000 })
```

```
node app.ts
```

## 文档

| 模块 | 文档 | 说明 |
|--------|------|------|
| **Router** | [README.md](#router) | 路由、中间件、WebSocket、错误处理 |
| **Middleware** | [README.md](#middleware) | auth, cors, logger, rateLimit, compress, validate, upload, cookie, static |
| **PostgreSQL** | [README.md](#postgresql) | Schema 构建器、CRUD、DDL、事务、PgModule |
| **Auth & User** | [README.md](#auth--user) | 密码、JWT、OAuth2 服务端、社交登录示例 |
| **React SSR** | [README.md](#react-ssr-with-tsx) | 页面、布局、数据加载、Tailwind、shadcn/ui |
| **AI** | [README.md](#ai-streaming--workflow) | `aiStream()`, `runWorkflow()` |
| **AI Agent** | [README.md](#ai-agent) | 对话、工具调用、RAG 知识库 |
| **Opencode** | [README.md](#opencode) | 编程助手、技能、会话、权限 |
| **Messager** | [README.md](#messager) | 实时聊天、频道、WebSocket、agent 路由 |
| **GraphQL** | [README.md](#graphql) | 带 GraphiQL 的 GraphQL 端点 |
| **Tenant BaaS** | [README.md](#tenant-baas) | 动态表、自动 REST + GraphQL、行隔离 |
| **LogDB** | [README.md](#logdb--structured-event-logging) | 结构化事件日志、分区、元数据搜索 |
| **Extra** | [README.md](#health-i18n-email--testing) | 健康检查、国际化、邮件、测试工具 |

### 基础设施

| 模块 | 导入 | 功能 |
|--------|--------|-----------|
| PostgreSQL | `postgres(options?)` | 连接池 + schema 构建器 + CRUD + 事务 |
| Redis | `redis(options?)` | ioredis 客户端，注入为 `ctx.redis` |
| 队列 | `queue(options?)` | 基于 Redis 的任务队列，支持 cron 调度 |
| 部署 | `deploy(config)` | 自托管 PaaS，详见 [deploy.md](./deploy.md) |

### 可挂载模块

所有模块遵循相同模式 — `const m = module(options)` → `app.use('/path', m.router())`:

| 模块 | 用途 | 额外提供 |
|--------|---------|---------------|
| `user(options)` | 认证（密码 + JWT + OAuth2） | `migrate()`, `middleware()`, `register()`, `login()`, `verify()`, `close()` |
| `tenant(options)` | 多租户 BaaS | `migrate()`, `middleware()`, `graphql()`, `close()` |
| `agent(options)` | AI agents | `migrate()`, `run()`, `addKnowledge()`, `close()` |
| `opencode(options)` | 编程助手 | `migrate()`, `wsHandler()`, `close()` |
| `messager(options)` | 实时消息 | `migrate()`, `wsHandler()`, `send()`, `close()` |
| `aiStream(handler)` | AI 流式端点 | — |
| `graphql(handler)` | GraphQL 端点 | — |
| `health(options?)` | 健康检查 | — |
| `iii(options?)` | Worker/Function/Trigger 服务范式 | `migrate()`, `trigger()`, `addWorker()`, `listWorkers()`, `listFunctions()`, `listTriggers()`, `shutdown()` |
| `registerWorker(url)` | 纯 WebSocket SDK（浏览器/Node） | `registerFunction()`, `registerTrigger()`, `trigger()`, `shutdown()` |

### 中间件（全部为 `(req, ctx, next) => Response`）

| 中间件 | 说明 |
|-----------|-------------|
| `auth(options)` | Bearer token / 自定义请求头 / 验证 / 代理 |
| `cors(options?)` | CORS，含预检请求、来源白名单、凭据 |
| `logger(options?)` | 带耗时的请求日志 |
| `rateLimit(options?)` | 基于内存的限流，带响应头 |
| `compress(options?)` | Brotli / Gzip / Deflate 压缩 |
| `validate(schemas)` | Zod 校验（body, query, params） |
| `upload(options?)` | 多部分文件上传 |
| `i18n(options)` | 国际化 — `ctx.t()`，语言检测 |

### 工具函数

| 函数 | 说明 |
|----------|-------------|
| `serveStatic(root, options?)` | 静态文件服务 |
| `loadEnv(path?)` | 加载 `.env` 文件到 `process.env` — 不覆盖、支持注释和引号 |
| `getCookies(req)` / `setCookie(res, ...)` / `deleteCookie(res, ...)` | Cookie 助手 |
| `mailer(options)` | 邮件发送（SMTP 或自定义） |
| `createTestServer(handler)` | 启动测试服务 → `{ server, url }` |
| `runWorkflow(options)` | 作为 AI SDK `Tool` 的 DAG 执行引擎 |
| `pgTable(name, columns)` | 类型安全的表 schema 构建器 |
| `pg.table(name, columns)` | 预绑定表（无需传 `sql` 参数） |
| `serial()`, `uuid()`, `text()`, ... | 列类型构建器 |
| `PgModule` | 数据库模块的基类 |

## 许可证

MIT
