# weifuwu

**AI SaaS framework** — `(req, ctx) => Response`

```bash
npm install weifuwu
```

User system, instant messaging, RAG knowledge base, AI Agent, CMS, dynamic data storage. Configure environment variables and go.

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

### Environment Variables

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
| User | `user()` | `postgres()` | Auth, JWT, roles |
| Messager | `messager()` | `postgres()`, `user()` | IM + AI conversation layer |
| KB | `kb()` | `postgres()` | RAG knowledge base |
| Agent | `agent()` | — | LLM chat, tool calling, streaming |
| CMS | `cms()` | `postgres()`, `user()` | Blog, docs, changelog |
| Base | `base()` | `postgres()`, `user()` | Dynamic data engine |

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

Auth, registration, JWT, password management, roles.

```ts
import { user, requireRole } from 'weifuwu'

app.use(postgres())
app.use(user({ secret: process.env.JWT_SECRET }))

// Register
app.post('/api/register', async (req, ctx) => {
  const result = await ctx.userModule.register(await req.json())
  return Response.json(result)
})
// Login
app.post('/api/login', async (req, ctx) => {
  const { email, password } = await req.json()
  const result = await ctx.userModule.login(email, password)
  if (!result) return new Response('Unauthorized', { status: 401 })
  return Response.json(result)
})
// Current user
app.get('/api/me', async (req, ctx) => {
  if (!ctx.user) return new Response('Unauthorized', { status: 401 })
  return Response.json(ctx.user)
})
// Admin only
app.get('/api/admin/users', requireRole('admin'), async (req, ctx) => {
  return Response.json(await ctx.userModule.listUsers())
})
```

### ctx.userModule API

| Method | Returns | Description |
|--------|---------|-------------|
| `register(input)` | `{ user, token }` | Register |
| `login(email, pw)` | `{ user, token } \| null` | Login |
| `getUserById(id)` | `UserRecord \| null` | Get by ID |
| `getUserByEmail(email)` | `UserRecord \| null` | Get by email |
| `updateUser(id, input)` | `UserRecord \| null` | Update |
| `changePassword(id, oldPw, newPw)` | `boolean` | Change password |
| `deleteUser(id)` | `boolean` | Soft delete |
| `listUsers(inactive?)` | `UserRecord[]` | List users |
| `generateToken(user)` | `string` | Issue JWT |
| `verifyToken(token)` | `TokenPayload \| null` | Verify JWT |
| `refreshToken(token)` | `string \| null` | Refresh JWT |

### ctx.user

Auto-resolved from `Authorization: Bearer` or `token` cookie.

```ts
interface User {
  id: string
  name: string
  email: string
  role: string
  [key: string]: unknown
}
```

### requireRole

```ts
app.get('/admin', requireRole('admin'), handler)
// No auth → 401, wrong role → 403
```

### Security

- Password: scrypt + 32-byte random salt
- Token: HMAC SHA-256, 7 day expiry

---

## messager

Instant messaging + AI conversation layer. Direct/group chat, message persistence, WebSocket push.

```ts
import { messager } from 'weifuwu'

app.use(postgres())
app.use(user())
app.use(messager())

// WebSocket — auto-join all user conversations
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
| `createDirectConversation(userId)` | `Conversation` | Create/reuse DM |
| `createGroupConversation(title, userIds)` | `Conversation` | Create group |
| `sendMessage(convId, body)` | `Message` | Send, auto-broadcast to `conversation:{id}` room |
| `getMessages(convId, opts?)` | `Message[]` | Cursor pagination |
| `editMessage(msgId, body)` | `Message \| null` | Edit (24h window) |
| `deleteMessage(msgId)` | `boolean` | Soft delete |
| `getConversations()` | `Conversation[]` | List with unread + last message |
| `getConversation(id)` | `Conversation \| null` | Get detail |
| `markRead(convId)` | `void` | Mark as read |
| `getUnreadCount()` | `{ total, byConversation }` | Unread stats |
| `addParticipants(convId, userIds)` | `void` | Add members |
| `removeParticipant(convId, userId?)` | `boolean` | Leave / kick |

### Storage

3 tables: `conversations` / `participants` / `messages`. Auto-migration.

### AI Conversations

messager + agent = ChatGPT foundation. Messager handles sessions + push, agent handles LLM generation.

---

## kb

RAG knowledge base. Import docs → auto-chunk → DashScope embedding → pgvector storage → semantic search.

```ts
import { kb } from 'weifuwu'

app.use(postgres())
app.use(kb())

// Import
app.post('/api/kb/import', async (req, ctx) => {
  const { title, content } = await req.json()
  const result = await ctx.kb.importText(title, content)
  return Response.json(result, { status: 201 })
})

// Search
app.post('/api/kb/search', async (req, ctx) => {
  const { query } = await req.json()
  return Response.json(await ctx.kb.search(query, { limit: 5 }))
})
```

### ctx.kb API

| Method | Returns | Description |
|--------|---------|-------------|
| `importText(title, text, opts?)` | `{ document, chunks }` | Import → chunk → embed → store |
| `importDocuments(docs)` | `Document[]` | Batch import |
| `search(query, opts?)` | `SearchResult[]` | Semantic search (cosine) |
| `list()` | `Document[]` | List documents |
| `get(id)` | `Document \| null` | Get document |
| `getChunks(documentId)` | `Chunk[]` | Get chunks |
| `delete(id)` | `boolean` | Delete + cascade chunks |

### Configuration

```ts
// Default: DashScope text-embedding-v4 (env: DASHSCOPE_API_KEY)
app.use(kb())

// Custom embedding
app.use(kb({
  embed: async (text) => { /* return number[] */ },
  dimensions: 1536,
  chunkSize: 512,    // tokens
  chunkOverlap: 64,
}))
```

### Integration with Agent

```ts
app.use(agent({
  model: openai('deepseek-v4-flash', { baseURL: 'https://api.deepseek.com/v1' }),
  knowledge: {
    search: async (query, ctx) => ctx.kb.search(query),
  },
}))
```

### Storage

- `kb_documents` — document metadata
- `kb_chunks` — chunk content + VECTOR(1536) + TSVECTOR GIN index

---

## agent

AI Agent — LLM chat, tool calling, RAG, streaming.

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

// Streaming
app.post('/api/chat', async (req, ctx) => {
  const { messages } = await req.json()
  return ctx.agent.chatStreamResponse({ messages })
})

// Non-streaming
app.post('/api/chat/sync', async (req, ctx) => {
  const { prompt } = await req.json()
  const text = await ctx.agent.chat(prompt)
  return Response.json({ text })
})
```

### ctx.agent API

| Method | Description |
|--------|-------------|
| `chat(prompt, opts?)` | Non-streaming, returns text |
| `chatStreamResponse({ messages })` | SSE stream (compatible with `useChat`) |

### Default Model

- LLM: DeepSeek-V4-Flash (via `@ai-sdk/openai` + `baseURL: 'https://api.deepseek.com/v1'`)
- Override with `DEEPSEEK_MODEL` env
- API key via `DEEPSEEK_API_KEY` or `OPENAI_API_KEY` env

### Features

| Feature | Description |
|---------|-------------|
| `knowledge.search` | RAG callback, auto-injected into system prompt |
| `tools` | Tool definitions, auto-loop (maxSteps) |
| `sandbox: true` | Integrates with `ctx.sandbox` |
| `store` | Session persistence (save/load) |
| `agents` | Multi-agent orchestration |

---

## cms

Content management — blog, docs, changelog.

```ts
import { cms, requireRole } from 'weifuwu'

app.use(postgres())
app.use(user())
app.use(cms())

// Public
app.get('/api/posts', async (req, ctx) => {
  return Response.json(await ctx.cms.list({ type: 'post', status: 'published' }))
})
app.get('/api/posts/:slug', async (req, ctx) => {
  const post = await ctx.cms.get(ctx.params.slug)
  if (!post) return new Response('Not found', { status: 404 })
  return Response.json(post)
})

// Admin
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
| `create(input)` | `Content` | Create (admin) |
| `get(slug)` | `Content \| null` | Get by slug |
| `getById(id)` | `Content \| null` | Get by ID |
| `update(id, input)` | `Content \| null` | Update (admin) |
| `delete(id)` | `boolean` | Delete (admin) |
| `list(opts?)` | `Content[]` | List with cursor |
| `publish(id)` | `Content \| null` | Publish (admin) |
| `unpublish(id)` | `Content \| null` | Unpublish (admin) |
| `listTags()` | `TagWithCount[]` | List tags |
| `createTag(name)` | `Tag` | Create tag |

### Features

- Types: post / page / doc / changelog (any string)
- Status: draft / published / archived
- Slug: auto-generated, unique per type
- Tags: many-to-many, auto-created
- Tree: parent_id for hierarchy
- Auth: non-admin users see published only

---

## base

Dynamic data storage engine — let users define their own data structures (like Airtable).

```ts
import { base } from 'weifuwu'

app.use(postgres())
app.use(user())
app.use(base())

// Define schema
app.post('/api/bases', async (req, ctx) => {
  const b = await ctx.base.create(await req.json())
  return Response.json(b, { status: 201 })
})

// CRUD
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
| `create({ name, tables })` | `BaseDef` | Create database |
| `defineTable(baseId, schema)` | `BaseDef` | Add table |
| `updateTable(baseId, name, schema)` | `BaseDef \| null` | Update table |
| `removeTable(baseId, name)` | `BaseDef \| null` | Remove table |
| `insert(baseId, table, data)` | `Row` | Insert row |
| `getRow(baseId, table, id)` | `Row \| null` | Get row |
| `updateRow(baseId, table, id, data)` | `Row \| null` | Update row |
| `deleteRow(baseId, table, id)` | `boolean` | Delete row |
| `query(baseId, table, opts?)` | `Row[]` | Query (filter/sort/limit/offset) |
| `search(baseId, table, field, query)` | `Row[]` | Full-text search |
| `similaritySearch(baseId, table, field, vector)` | `Row[]` | Vector search |
| `list()` / `get(id)` / `getBySlug(slug)` / `delete(id)` | — | Manage databases |

### Architecture

Fixed Slot: a single `base_data` table with ~120 physical columns:

| Type | Count | PG Type |
|------|:-----:|:--------:|
| text001..064 | 64 | TEXT |
| number001..032 | 32 | DOUBLE PRECISION |
| date001..008 | 8 | TIMESTAMPTZ |
| vector001..004 | 4 | VECTOR(1536) |
| search001..004 | 4 | TEXT |
| ext | 1 | JSONB (overflow) |

Field name → physical column mapping stored in `base_column_map`. Fields beyond the physical columns overflow to ext JSONB.

pgvector auto-detected (included in docker image).

---

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

// Middleware & mounting
app.use(middleware)
app.mount(prefix, router)
app.plugin(fn)
app.onError(handler)
app.routes()  // debug: list all routes
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

Reads `DATABASE_URL` env. Supports migrations, transactions, connection pool stats.

---

## Redis

```ts
import { redis } from 'weifuwu'

const r = redis()
app.use(r)  // → ctx.redis
await r.redis.set('key', 'value')
```

Reads `REDIS_URL` env (default: `redis://localhost:6379`).

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
├── index.ts             ← Entry, exports all modules
├── types.ts             ← Context, Handler, Middleware types
├── core/                ← serve, router, ws, trace, logger
├── middleware/           ← cors, helmet, compress, rate-limit, upload, static, sandbox
├── user/                ← User system (CRUD, JWT, requireRole)
├── messager/            ← IM + AI conversation layer
├── kb/                  ← RAG knowledge base (chunking, embedding, vector search)
├── ai/                  ← AI Agent (LLM, tools, RAG)
├── cms/                 ← Content management (blog, docs, changelog)
├── base/                ← Dynamic data engine (Fixed Slot)
├── postgres/            ← PostgreSQL client
├── redis/               ← Redis client
├── queue/               ← Job queue + cron
├── graphql.ts           ← GraphQL
├── hub.ts               ← WebSocket hub
└── test/                ← 281 tests

docker-compose.yml       ← postgres (pgvector) + redis
```

---

## Development

```bash
docker compose up -d         # Start postgres + redis
npm run build                # esbuild → dist/
npm run typecheck            # tsc --noEmit
npm test                     # 281 tests
```
