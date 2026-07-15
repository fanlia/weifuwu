# weifuwu

AI SaaS 框架 for Node.js — `(req, ctx) => Response`.

```bash
npm install weifuwu
```

```ts
import { serve, Router, postgres, user, kb, agent, messager } from 'weifuwu'
import { openai } from '@ai-sdk/openai'

const app = new Router()
app.use(postgres())
app.use(user())
app.use(kb())
app.use(messager())
app.use(agent({
  model: openai('deepseek-v4-flash', { baseURL: 'https://api.deepseek.com/v1' }),
  knowledge: {
    search: async (query, ctx) => ctx.kb.search(query),
  },
}))

// AI 对话 — 自动 RAG + 流式回复
app.post('/api/chat', async (req, ctx) => {
  const { messages } = await req.json()
  return ctx.agent.chatStreamResponse({ messages })
})

serve(app, { port: 3000 })
```

每个内置模块解决一个 AI SaaS 基础设施问题：用户系统、即时消息、RAG 知识库、AI Agent、内容管理、动态数据存储。配好环境变量就能跑。

---

## 目录

- [Core API](#core)
- [Router](#router)
- [User System](#user-system)
- [Messager (AI 对话)](#messager)
- [KB (RAG 知识库)](#kb)
- [AI Agent](#ai-agent)
- [CMS (内容管理)](#cms)
- [Base (动态数据存储)](#base)
- [Middleware](#middleware)
- [Postgres](#postgres)
- [Redis](#redis)
- [Queue & Cron](#queue--cron)

---

## Core

```ts
import { serve, Router } from 'weifuwu'

const app = new Router()
app.get('/', () => new Response('Hello'))
serve(app, { port: 3000 })
```

| Export | Description |
|---|---|
| `serve(app, opts?)` | Start HTTP server. Returns `Server` with `port`, `hostname`, `ready`, `close()`. |
| `Router` | Trie-based HTTP router with WebSocket support and `plugin()` method. |
| `HttpError` | `new HttpError(message, status)`. Throw to return that status code. |
| `DEFAULT_MAX_BODY` | `10 * 1024 * 1024` (10MB). |
| `currentTraceId()` / `currentTrace()` | Request tracing via AsyncLocalStorage. |
| `trace()` | Middleware that injects `ctx.trace`. |
| `logger()` | Request logging. `format: 'short' \| 'combined' \| 'json'`. |

## Router

```ts
const app = new Router()

// HTTP methods
app.get(path, ...handlers)
app.post / put / delete / patch / head / options(path, ...handlers)
app.all(path, ...handlers)

// WebSocket
app.ws(path, ...middlewares, handler)

// Middleware & mounting
app.use(middleware)           // global middleware
app.mount(prefix, router)     // sub-router
app.plugin(fn)                // plugin(app) => { app.get(), app.use(), ... }
app.onError(handler)          // (error, req, ctx) => Response
app.routes()                  // debug: list all registered routes

// Path params
app.get('/users/:id', (req, ctx) => {
  ctx.params.id
  ctx.query.search // from ?search=...
})
```

---

## User System

身份认证、注册登录、角色管理。

```ts
import { user, requireRole } from 'weifuwu'

app.use(postgres())
app.use(user({ secret: process.env.JWT_SECRET }))

// 注册 / 登录
app.post('/api/register', async (req, ctx) => {
  const result = await ctx.userModule.register(await req.json())
  return Response.json(result)
})
app.post('/api/login', async (req, ctx) => {
  const { email, password } = await req.json()
  const result = await ctx.userModule.login(email, password)
  if (!result) return new Response('Unauthorized', { status: 401 })
  return Response.json(result)
})

// 当前用户
app.get('/api/me', async (req, ctx) => {
  if (!ctx.user) return new Response('Unauthorized', { status: 401 })
  return Response.json(ctx.user)
})

// 仅管理员
app.get('/api/admin/users', requireRole('admin'), async (req, ctx) => {
  return Response.json(await ctx.userModule.listUsers())
})
```

| Feature | Description |
|---------|-------------|
| `ctx.userModule.register(input)` | 注册，返回 `{ user, token }` |
| `ctx.userModule.login(email, pw)` | 登录，返回 `{ user, token }` 或 null |
| `ctx.userModule.getUserById(id)` | 查用户 |
| `ctx.userModule.updateUser(id, input)` | 更新用户 |
| `ctx.userModule.changePassword(id, oldPw, newPw)` | 改密码 |
| `ctx.userModule.deleteUser(id)` | 软删除 |
| `requireRole('admin', 'moderator')` | 中间件，检查 `ctx.user.role` |
| 自动从 `Authorization: Bearer` 或 `token` cookie 解析 `ctx.user` | JWT |

密码使用 scrypt + 随机盐，令牌使用 HMAC HS256。

---

## Messager

即时消息模块，也是 AI 对话的交互层。

```ts
import { messager } from 'weifuwu'

app.use(postgres())
app.use(user())
app.use(messager())

// WebSocket — 自动加入所有会话房间
app.ws('/ws', {
  async open(ws, ctx) {
    for (const c of await ctx.messager.getConversations()) {
      ctx.ws.join(`conversation:${c.id}`)
    }
  },
})

// 发消息
app.post('/api/messages', async (req, ctx) => {
  const { conversationId, body } = await req.json()
  const msg = await ctx.messager.sendMessage(conversationId, body)
  return Response.json(msg, { status: 201 })
})
```

| API | Description |
|-----|-------------|
| `createDirectConversation(userId)` | 创建/复用私聊 |
| `createGroupConversation(title, userIds)` | 创建群聊 |
| `sendMessage(convId, body)` | 发消息，自动 WS 广播 |
| `getMessages(convId, { before?, limit? })` | 游标分页 |
| `editMessage(msgId, body)` | 编辑（24h 内） |
| `deleteMessage(msgId)` | 软删除 |
| `getConversations()` | 会话列表（含未读数） |
| `markRead(convId)` | 标记已读 |
| `getUnreadCount()` | 未读统计 |
| `addParticipants(convId, userIds)` | 加人 |
| `removeParticipant(convId, userId?)` | 退出/踢出 |

**与 AI Agent 配合：** messager 提供会话管理和实时推送，ai/agent 提供 LLM 生成能力。两个模块组合就是 ChatGPT 的基础架构。

---

## KB

RAG 知识库 — 文档导入、自动分片、向量化、语义搜索。

```ts
import { kb } from 'weifuwu'

app.use(postgres())
app.use(kb())

// 导入文档
app.post('/api/kb/import', async (req, ctx) => {
  const { title, content } = await req.json()
  const result = await ctx.kb.importText(title, content)
  return Response.json(result, { status: 201 })
})

// 语义搜索
app.post('/api/kb/search', async (req, ctx) => {
  const { query } = await req.json()
  const results = await ctx.kb.search(query, { limit: 5 })
  return Response.json(results)
})
```

| API | Description |
|-----|-------------|
| `importText(title, text, opts?)` | 导入文本 → 分片 → embed → 存储 |
| `importDocuments(docs)` | 批量导入 |
| `search(query, opts?)` | 语义搜索，返回 `{ content, score, title }` |
| `list()` | 文档列表 |
| `getChunks(documentId)` | 查看分片 |
| `delete(id)` | 删除文档（级联删除分片） |

**默认 Embedding 模型：** DashScope `text-embedding-v4`，通过 `DASHSCOPE_API_KEY` 环境变量配置。

```ts
// 自定义 embedding
app.use(kb({
  embed: async (text) => {
    const res = await fetch('https://your-embedding-api.com', { ... })
    return res.embedding
  },
}))
```

**与 AI Agent 配合：** kb 作为 RAG 数据源，直接在 `agent()` 中配置：

```ts
app.use(agent({
  model: openai('deepseek-v4-flash', { baseURL: 'https://api.deepseek.com/v1' }),
  knowledge: {
    search: async (query, ctx) => ctx.kb.search(query),
  },
}))
```

---

## AI Agent

LLM 对话、工具调用、RAG、流式输出。

```ts
import { agent } from 'weifuwu'
import { openai } from '@ai-sdk/openai'
import { tool } from 'ai'
import { z } from 'zod'

app.use(agent({
  model: openai('deepseek-v4-flash', {
    baseURL: 'https://api.deepseek.com/v1',
  }),
  system: 'You are a helpful assistant.',
  knowledge: {
    search: async (query, ctx) => ctx.kb.search(query),
  },
  tools: {
    getWeather: tool({
      description: 'Get weather',
      parameters: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ temp: 22, unit: 'C' }),
    }),
  },
  maxSteps: 5,
}))

// 流式对话（兼容 useChat）
app.post('/api/chat', async (req, ctx) => {
  const { messages } = await req.json()
  return ctx.agent.chatStreamResponse({ messages })
})
```

| Feature | Description |
|---------|-------------|
| `ctx.agent.chat(prompt, opts?)` | 非流式对话 |
| `ctx.agent.chatStreamResponse({ messages })` | SSE 流式回复 |
| `knowledge.search` | RAG 回调函数 |
| `tools` | 工具定义，自动循环调用 |
| `sandbox: true` | 与 `ctx.sandbox` 集成 |
| `store` | 对话持久化 |

**默认 LLM 模型：** DeepSeek-V4-Flash（兼容 OpenAI API），通过 `DASHSCOPE_API_KEY` 或 `OPENAI_API_KEY` 环境变量配置。

---

## CMS

内容管理 — 博客、文档、公告、更新日志。

```ts
import { cms } from 'weifuwu'

app.use(postgres())
app.use(user())
app.use(cms())

// 公开
app.get('/api/posts', async (req, ctx) => {
  return Response.json(await ctx.cms.list({ type: 'post', status: 'published' }))
})
app.get('/api/posts/:slug', async (req, ctx) => {
  const post = await ctx.cms.get(ctx.params.slug)
  if (!post) return new Response('Not found', { status: 404 })
  return Response.json(post)
})

// 管理端（需要 admin 角色）
app.post('/api/admin/posts', requireRole('admin'), async (req, ctx) => {
  const post = await ctx.cms.create(await req.json())
  return Response.json(post, { status: 201 })
})
```

| Feature | Description |
|---------|-------------|
| 多类型内容 | post / page / doc / changelog |
| 发布状态 | draft / published / archived |
| Slug | 自动生成，同类型唯一 |
| 标签 | 多对多，自动创建 |
| 树形 | parent_id 支持层级 |
| 游标分页 | `list({ before, limit })` |
| 自动鉴权 | 非管理员只能读已发布 |

---

## Base

动态数据存储引擎 — 让用户自定义数据结构。

```ts
import { base } from 'weifuwu'

app.use(postgres())
app.use(user())
app.use(base())

// 创建数据库
app.post('/api/bases', async (req, ctx) => {
  const b = await ctx.base.create(await req.json())
  return Response.json(b, { status: 201 })
})

// 查询数据
app.get('/api/bases/:id/:table', async (req, ctx) => {
  const url = new URL(req.url)
  return Response.json(await ctx.base.query(ctx.params.id, ctx.params.table, {
    filter: url.searchParams.get('filter') ? JSON.parse(url.searchParams.get('filter')!) : undefined,
    limit: parseInt(url.searchParams.get('limit') || '50'),
  }))
})
```

| API | Description |
|-----|-------------|
| `create({ name, tables })` | 创建数据库（含表定义） |
| `defineTable(baseId, schema)` | 加表 |
| `insert(baseId, table, data)` | 插入行 |
| `query(baseId, table, { filter?, sort?, limit?, offset? })` | 查询 |
| `updateRow(baseId, table, id, data)` | 更新行 |
| `deleteRow(baseId, table, id)` | 删除行 |
| `search(baseId, table, field, query)` | 全文搜索 |
| `similaritySearch(baseId, table, field, vector)` | 向量搜索 |

**架构：** Fixed Slot — text001..064 / number001..032 / date001..008 / search001..004 固定列，ext JSONB 溢出。字段名通过 `base_column_map` 映射到物理列号。支持 B-tree 索引、唯一约束、全文搜索、向量搜索。

---

## Middleware

| Export | Description |
|--------|-------------|
| `cors(opts?)` | CORS headers |
| `helmet(opts?)` | Security headers |
| `compress(opts?)` | gzip / brotli / deflate |
| `rateLimit(opts?)` | Sliding-window rate limiter |
| `upload(opts?)` | Multipart file upload |
| `serveStatic(root, opts?)` | Static files |
| `sandbox(opts?)` | Filesystem isolation |

---

## Postgres

```ts
import { postgres } from 'weifuwu'

const sql = postgres()
app.use(sql)  // injects ctx.sql

await sql.sql`SELECT * FROM users WHERE id = ${id}`
```

Reads `DATABASE_URL` env. Supports transactions, migrations, pool stats.

---

## Redis

```ts
import { redis } from 'weifuwu'

const r = redis()
app.use(r)  // injects ctx.redis
await r.redis.set('key', 'value')
```

Reads `REDIS_URL` env (default: `redis://localhost:6379`).

---

## Queue & Cron

```ts
import { queue } from 'weifuwu'

const q = queue()
app.use(q)

q.process('email', async (job) => { await sendEmail(job.payload) })
q.cron('cleanup', '0 3 * * *', () => cleanup())
await q.add('email', { to: 'user@example.com' })
q.run()
```

---

## Project Structure

```
weifuwu/
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── core/           ← serve, router, ws, trace, logger
│   ├── middleware/      ← cors, helmet, compress, rate-limit, upload, static, sandbox
│   ├── user/           ← 用户系统（CRUD、JWT、requireRole）
│   ├── messager/       ← 即时消息 + AI 对话交互层
│   ├── kb/             ← RAG 知识库（分片、embedding、向量搜索）
│   ├── ai/             ← AI Agent（LLM、tools、RAG）
│   ├── cms/            ← 内容管理（博客、文档、公告）
│   ├── base/           ← 动态数据存储引擎（Fixed Slot）
│   ├── postgres/
│   ├── redis/
│   ├── queue/
│   ├── react/
│   ├── graphql.ts
│   ├── hub.ts
│   └── test/           ← 281 tests
├── docker-compose.yml   ← postgres (pgvector) + redis
├── scripts/
│   ├── build.mjs
│   └── release.mjs
└── README.md
```

## Development

```bash
npm run build          # esbuild → dist/
npm run typecheck      # tsc --noEmit
npm test              # 281 tests (requires docker compose)
```
