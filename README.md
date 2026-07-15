# weifuwu

**AI SaaS 框架** — `(req, ctx) => Response`

```bash
npm install weifuwu
```

用户系统、即时消息、RAG 知识库、AI Agent、内容管理、动态数据存储。配好环境变量就能跑。

---

## Quick Start

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
  knowledge: { search: async (q, ctx) => ctx.kb.search(q) },
}))

app.post('/api/chat', async (req, ctx) => {
  const { messages } = await req.json()
  return ctx.agent.chatStreamResponse({ messages })
})

serve(app, { port: 3000 })
```

### 环境变量

| Variable | Default | Used by |
|----------|---------|---------|
| `DATABASE_URL` | `postgres://root:123456@localhost:5432/demo` | `postgres()` |
| `REDIS_URL` | `redis://localhost:6379` | `redis()` |
| `JWT_SECRET` | — | `user()` |
| `DASHSCOPE_API_KEY` | — | `kb()` (embedding) |
| `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` | — | `agent()` (LLM) |
| `DEEPSEEK_MODEL` | `deepseek-v4-flash` | `agent()` |

---

## Modules

| Module | Import | Dependency | Purpose |
|--------|--------|-----------|---------|
| User | `user()` | `postgres()` | 注册、登录、JWT、角色 |
| Messager | `messager()` | `postgres()`, `user()` | 即时消息、AI 对话交互层 |
| KB | `kb()` | `postgres()` | RAG 知识库、分片、向量搜索 |
| Agent | `agent()` | — | LLM 对话、工具调用、流式输出 |
| CMS | `cms()` | `postgres()`, `user()` | 博客、文档、公告 |
| Base | `base()` | `postgres()`, `user()` | 动态数据存储引擎 |

### Middleware

| Import | Purpose |
|--------|---------|
| `cors()` | CORS headers |
| `helmet()` | Security headers |
| `compress()` | gzip / brotli / deflate |
| `rateLimit()` | Sliding-window rate limiter |
| `logger()` | Request logging |
| `upload()` | Multipart file upload |
| `serveStatic()` | Static files |
| `sandbox()` | Filesystem isolation |

### Core

| Import | Purpose |
|--------|---------|
| `serve(app, opts?)` | Start HTTP server |
| `Router` | Trie-based router + WebSocket |
| `HttpError` | `throw new HttpError(msg, 404)` |
| `trace()` | Request tracing |
| `postgres()` | PostgreSQL client (`ctx.sql`) |
| `redis()` | Redis client (`ctx.redis`) |
| `queue()` | Job queue + cron |
| `createHub()` | WebSocket pub/sub |

### Utilities

| Import | Purpose |
|--------|---------|
| `requireRole('admin')` | Middleware: check `ctx.user.role` |

---

## user

身份认证、注册登录、JWT、密码管理。

```ts
import { user, requireRole } from 'weifuwu'

app.use(postgres())
app.use(user({ secret: process.env.JWT_SECRET }))

// 注册
app.post('/api/register', async (req, ctx) => {
  const result = await ctx.userModule.register(await req.json())
  return Response.json(result)
})
// 登录
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

### ctx.userModule API

| Method | Returns | Description |
|--------|---------|-------------|
| `register(input)` | `{ user, token }` | 注册 |
| `login(email, pw)` | `{ user, token } \| null` | 登录 |
| `getUserById(id)` | `UserRecord \| null` | 查用户 |
| `getUserByEmail(email)` | `UserRecord \| null` | 查邮箱 |
| `updateUser(id, input)` | `UserRecord \| null` | 更新 |
| `changePassword(id, oldPw, newPw)` | `boolean` | 改密码 |
| `deleteUser(id)` | `boolean` | 软删除 |
| `listUsers(inactive?)` | `UserRecord[]` | 用户列表 |
| `generateToken(user)` | `string` | 签发 JWT |
| `verifyToken(token)` | `TokenPayload \| null` | 验证 JWT |
| `refreshToken(token)` | `string \| null` | 刷新 JWT |

### ctx.user

由中间件自动从 `Authorization: Bearer` 或 `token` cookie 解析。

```ts
interface User {
  id: string
  name: string
  email: string
  role: string      // 'user' | 'admin' | ...
  [key: string]: unknown
}
```

### requireRole

```ts
app.get('/admin', requireRole('admin'), handler)
// 未登录 → 401，角色不匹配 → 403
```

### 安全

- 密码：scrypt + 随机 32 字节盐
- 令牌：HMAC SHA-256，7 天过期

---

## messager

即时消息 + AI 对话交互层。单聊、群聊、消息持久化、WebSocket 实时推送。

```ts
import { messager } from 'weifuwu'

app.use(postgres())
app.use(user())
app.use(messager())

// WebSocket — 自动加入用户的所有会话
app.ws('/ws', {
  async open(ws, ctx) {
    for (const c of await ctx.messager.getConversations()) {
      ctx.ws.join(`conversation:${c.id}`)
    }
  },
})

// REST API
app.post('/api/messages', async (req, ctx) => {
  const { conversationId, body } = await req.json()
  const msg = await ctx.messager.sendMessage(conversationId, body)
  return Response.json(msg, { status: 201 })
})

app.get('/api/conversations/:id/messages', async (req, ctx) => {
  const url = new URL(req.url)
  return Response.json(await ctx.messager.getMessages(ctx.params.id, {
    before: url.searchParams.get('before') || undefined,
    limit: parseInt(url.searchParams.get('limit') || '50'),
  }))
})
```

### ctx.messager API

| Method | Returns | Description |
|--------|---------|-------------|
| `createDirectConversation(userId)` | `Conversation` | 创建/复用私聊 |
| `createGroupConversation(title, userIds)` | `Conversation` | 建群 |
| `sendMessage(convId, body)` | `Message` | 发消息，自动广播到 `conversation:{id}` 房间 |
| `getMessages(convId, opts?)` | `Message[]` | 游标分页 |
| `editMessage(msgId, body)` | `Message \| null` | 编辑（24h 内） |
| `deleteMessage(msgId)` | `boolean` | 软删除 |
| `getConversations()` | `Conversation[]` | 会话列表（含未读、最后消息预览） |
| `getConversation(id)` | `Conversation \| null` | 会话详情 |
| `markRead(convId)` | `void` | 标记已读 |
| `getUnreadCount()` | `{ total, byConversation }` | 未读统计 |
| `addParticipants(convId, userIds)` | `void` | 加人 |
| `removeParticipant(convId, userId?)` | `boolean` | 退出/踢出 |

### 存储

3 张表：`conversations` / `participants` / `messages`。自动建表迁移。

### AI 对话

messager + agent 两个模块组合 = ChatGPT 基础架构。messager 管会话和推送，agent 管 LLM 生成。

---

## kb

RAG 知识库。文档导入 → 自动分片 → DashScope embedding → pgvector 存储 → 语义搜索。

```ts
import { kb } from 'weifuwu'

app.use(postgres())
app.use(kb())

// 导入
app.post('/api/kb/import', async (req, ctx) => {
  const { title, content } = await req.json()
  const result = await ctx.kb.importText(title, content)
  return Response.json(result, { status: 201 })
})

// 搜索
app.post('/api/kb/search', async (req, ctx) => {
  const { query } = await req.json()
  return Response.json(await ctx.kb.search(query, { limit: 5 }))
})
```

### ctx.kb API

| Method | Returns | Description |
|--------|---------|-------------|
| `importText(title, text, opts?)` | `{ document, chunks }` | 导入 → 分片 → embedding → 存储 |
| `importDocuments(docs)` | `Document[]` | 批量导入 |
| `search(query, opts?)` | `SearchResult[]` | 语义搜索（cosine 相似度） |
| `list()` | `Document[]` | 文档列表 |
| `get(id)` | `Document \| null` | 文档详情 |
| `getChunks(documentId)` | `Chunk[]` | 分片列表 |
| `delete(id)` | `boolean` | 删除文档 + 级联删除分片 |

### 配置

```ts
// 默认：DashScope text-embedding-v4（环境变量 DASHSCOPE_API_KEY）
app.use(kb())

// 自定义 embedding
app.use(kb({
  embed: async (text) => { /* 返回 number[] */ },
  dimensions: 1536,
  chunkSize: 512,    // 默认分片大小（tokens）
  chunkOverlap: 64,  // 分片重叠
}))
```

### 与 Agent 配合

```ts
app.use(agent({
  model: openai('deepseek-v4-flash', { baseURL: 'https://api.deepseek.com/v1' }),
  knowledge: {
    search: async (query, ctx) => ctx.kb.search(query),
  },
}))
```

### 存储

- `kb_documents` — 原始文档元数据
- `kb_chunks` — 分片内容 + VECTOR(1536) + TSVECTOR GIN 索引

---

## agent

AI Agent — LLM 对话、工具调用、RAG、流式输出。

```ts
import { agent } from 'weifuwu'
import { openai } from '@ai-sdk/openai'
import { tool } from 'ai'
import { z } from 'zod'

app.use(agent({
  model: openai('deepseek-v4-flash', { baseURL: 'https://api.deepseek.com/v1' }),
  system: 'You are a helpful assistant.',
  knowledge: {
    search: async (query, ctx) => ctx.kb.search(query),
  },
  tools: {
    getWeather: tool({
      description: 'Get weather for a city',
      parameters: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ temp: 22, unit: 'C' }),
    }),
  },
  maxSteps: 5,
}))

// 流式对话
app.post('/api/chat', async (req, ctx) => {
  const { messages } = await req.json()
  return ctx.agent.chatStreamResponse({ messages })
})

// 非流式对话
app.post('/api/chat/sync', async (req, ctx) => {
  const { prompt } = await req.json()
  const text = await ctx.agent.chat(prompt)
  return Response.json({ text })
})
```

### ctx.agent API

| Method | Description |
|--------|-------------|
| `chat(prompt, opts?)` | 非流式对话，返回文本 |
| `chatStreamResponse({ messages })` | SSE 流式回复（兼容 `useChat`） |

### 默认模型

- LLM: DeepSeek-V4-Flash（`@ai-sdk/openai` + `baseURL: 'https://api.deepseek.com/v1'`）
- 环境变量 `DEEPSEEK_MODEL` 可覆盖模型名称
- 环境变量 `DEEPSEEK_API_KEY` 或 `OPENAI_API_KEY` 为 API 密钥

### Features

| Feature | Description |
|---------|-------------|
| `knowledge.search` | RAG 回调，自动注入 system prompt |
| `tools` | 工具定义，自动循环调用（maxSteps） |
| `sandbox: true` | 与 `ctx.sandbox` 集成（文件读写） |
| `store` | 对话持久化（save/load） |
| `agents` | 多 Agent 编排 |

---

## cms

内容管理 — 博客、文档、公告、更新日志。

```ts
import { cms, requireRole } from 'weifuwu'

app.use(postgres())
app.use(user())
app.use(cms())

// 公开：已发布的文章
app.get('/api/posts', async (req, ctx) => {
  return Response.json(await ctx.cms.list({ type: 'post', status: 'published' }))
})
app.get('/api/posts/:slug', async (req, ctx) => {
  const post = await ctx.cms.get(ctx.params.slug)
  if (!post) return new Response('Not found', { status: 404 })
  return Response.json(post)
})

// 管理端
app.post('/api/admin/posts', requireRole('admin'), async (req, ctx) => {
  const post = await ctx.cms.create(await req.json())
  return Response.json(post, { status: 201 })
})
app.patch('/api/admin/posts/:id', requireRole('admin'), async (req, ctx) => {
  const post = await ctx.cms.update(ctx.params.id, await req.json())
  if (!post) return new Response('Not found', { status: 404 })
  return Response.json(post)
})
```

### ctx.cms API

| Method | Returns | Description |
|--------|---------|-------------|
| `create(input)` | `Content` | 创建（admin） |
| `get(slug)` | `Content \| null` | 按 slug 获取 |
| `getById(id)` | `Content \| null` | 按 id 获取 |
| `update(id, input)` | `Content \| null` | 更新（admin） |
| `delete(id)` | `boolean` | 删除（admin） |
| `list(opts?)` | `Content[]` | 列表（游标分页） |
| `publish(id)` | `Content \| null` | 发布（admin） |
| `unpublish(id)` | `Content \| null` | 下线（admin） |
| `listTags()` | `TagWithCount[]` | 标签列表 |
| `createTag(name)` | `Tag` | 创建标签 |

### Features

- 内容类型：post / page / doc / changelog（任意字符串）
- 状态：draft / published / archived
- Slug：自动生成，同类型唯一
- 标签：多对多，自动创建
- 树形：parent_id 支持层级
- 鉴权：非管理员只能读已发布

---

## base

动态数据存储引擎 — 让用户自定义数据结构（类似 Airtable）。

```ts
import { base } from 'weifuwu'

app.use(postgres())
app.use(user())
app.use(base())

// 定义数据结构
app.post('/api/bases', async (req, ctx) => {
  const b = await ctx.base.create(await req.json())
  return Response.json(b, { status: 201 })
})

// 增删改查
app.post('/api/bases/:id/:table', async (req, ctx) => {
  const row = await ctx.base.insert(ctx.params.id, ctx.params.table, await req.json())
  return Response.json(row, { status: 201 })
})

app.get('/api/bases/:id/:table', async (req, ctx) => {
  const url = new URL(req.url)
  return Response.json(await ctx.base.query(ctx.params.id, ctx.params.table, {
    filter: url.searchParams.get('filter') ? JSON.parse(url.searchParams.get('filter')!) : undefined,
    limit: parseInt(url.searchParams.get('limit') || '50'),
  }))
})
```

### ctx.base API

| Method | Returns | Description |
|--------|---------|-------------|
| `create({ name, tables })` | `BaseDef` | 创建数据库 |
| `defineTable(baseId, schema)` | `BaseDef` | 加表 |
| `updateTable(baseId, name, schema)` | `BaseDef \| null` | 改表 |
| `removeTable(baseId, name)` | `BaseDef \| null` | 删表 |
| `insert(baseId, table, data)` | `Row` | 插入行 |
| `getRow(baseId, table, id)` | `Row \| null` | 查行 |
| `updateRow(baseId, table, id, data)` | `Row \| null` | 改行 |
| `deleteRow(baseId, table, id)` | `boolean` | 删行 |
| `query(baseId, table, opts?)` | `Row[]` | 查询（filter/sort/limit/offset） |
| `search(baseId, table, field, query)` | `Row[]` | 全文搜索 |
| `similaritySearch(baseId, table, field, vector)` | `Row[]` | 向量搜索 |
| `list()` / `get(id)` / `getBySlug(slug)` / `delete(id)` | — | 数据库管理 |

### 架构

Fixed Slot：一张 `base_data` 表，预分配 ~120 个物理列：

| 类型 | 列数 | PG 类型 |
|------|:----:|:--------:|
| text001..064 | 64 | TEXT |
| number001..032 | 32 | DOUBLE PRECISION |
| date001..008 | 8 | TIMESTAMPTZ |
| vector001..004 | 4 | VECTOR(1536) |
| search001..004 | 4 | TEXT |
| ext | 1 | JSONB（溢出兜底） |

字段名 → 物理列号 的映射存储在 `base_column_map` 表。超出物理列的字段自动溢出到 ext JSONB。

pgvector 自动检测：docker 镜像默认支持。

---

## Router

```ts
const app = new Router()

// HTTP
app.get(path, ...handlers)
app.post / put / delete / patch / head / options(path, ...handlers)
app.all(path, ...handlers)

// WebSocket
app.ws(path, ...middlewares, handler)
// handler: { open?, message?, close?, error? }

// 中间件 & 挂载
app.use(middleware)
app.mount(prefix, router)
app.plugin(fn)
app.onError(handler)
app.routes()  // 调试：列出所有路由
```

---

## Middleware

```ts
import { cors, helmet, compress, rateLimit, logger, upload, serveStatic, sandbox } from 'weifuwu'

app.use(cors({ origin: '*' }))
app.use(helmet())
app.use(compress())
app.use(rateLimit({ max: 100 }))
app.use(logger({ format: 'short' }))
app.use(upload())
app.use(serveStatic('./public'))
app.use(sandbox({ baseDir: '/tmp/workspaces' }))
```

---

## Postgres

```ts
import { postgres } from 'weifuwu'

const sql = postgres()
app.use(sql)  // → ctx.sql

await sql.sql`SELECT * FROM users WHERE id = ${id}`
await sql.sql.begin(async (sql) => { /* transaction */ })
```

`DATABASE_URL` 环境变量。支持迁移、事务、连接池统计。

---

## Redis

```ts
import { redis } from 'weifuwu'

const r = redis()
app.use(r)  // → ctx.redis
await r.redis.set('key', 'value')
```

`REDIS_URL` 环境变量，默认 `redis://localhost:6379`。

---

## Queue & Cron

```ts
import { queue } from 'weifuwu'

const q = queue()
app.use(q)  // → ctx.queue

q.process('email', async (job) => { await sendEmail(job.payload) })
q.cron('cleanup', '0 3 * * *', () => cleanup())
await q.add('email', { to: 'user@example.com' })
await q.add('remind', {}, { delay: 60_000 })
q.run()
```

---

## Project Structure

```
src/
├── index.ts             ← 入口，导出所有模块
├── types.ts             ← Context, Handler, Middleware 定义
├── core/                ← serve, router, ws, trace, logger
├── middleware/           ← cors, helmet, compress, rate-limit, upload, static, sandbox
├── user/                ← 用户系统（CRUD、JWT、requireRole）
├── messager/            ← 即时消息 + AI 对话交互层
├── kb/                  ← RAG 知识库（分片、embedding、向量搜索）
├── ai/                  ← AI Agent（LLM、tools、RAG）
├── cms/                 ← 内容管理（博客、文档、公告）
├── base/                ← 动态数据存储引擎（Fixed Slot）
├── postgres/            ← PostgreSQL 客户端
├── redis/               ← Redis 客户端
├── queue/               ← 任务队列 + cron
├── react/               ← React SSR
├── graphql.ts           ← GraphQL
├── hub.ts               ← WebSocket hub
└── test/                ← 281 tests

docker-compose.yml       ← postgres (pgvector) + redis
```

---

## Development

```bash
docker compose up -d         # 启动 postgres + redis
npm run build                # esbuild → dist/
npm run typecheck            # tsc --noEmit
npm test                     # 281 tests
```
