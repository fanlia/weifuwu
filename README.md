---
name: weifuwu
description: Web-standard HTTP framework for Node.js — (req, ctx) => Response
---

# weifuwu

**Web-standard HTTP framework for Node.js.** `(req, ctx) => Response` — no framework-specific objects, just the Web API your browser already speaks.

### Design

weifuwu doesn't invent its own request/response abstraction. `Request` and `Response` are the same objects you use in `fetch()` — what you learn in the browser applies directly on the server. `ctx` is the only framework object, and it only carries what the router parsed for you (`params`, `query`).

Everything follows the same `(req, ctx) => Response` contract. The Router handles HTTP routing and WebSocket. All other features — auth, validation, database, GraphQL, AI — are standalone modules you import and mount with `app.use()`.

## Features

- **Web Standard** — `Request` / `Response` / `ReadableStream`, zero abstractions
- **Zero build** — native TypeScript in Node.js v24+, zero deps (core)
- **Trie router** — static > param > wildcard, sub-router mounting, WebSocket
- **Middleware** — global/path-scoped/route-level — onion model with short-circuit
- **Modules** — auth, validation, upload, compression, rate-limit, cookies, static files, CORS, logging
- **React SSR** — `tsx()` — pages, layouts, loaders, route handlers, Tailwind CSS, HMR
- **PostgreSQL** — schema builder with type-safe DDL, CRUD (`read`/`readMany`, `insertMany`, `update`/`updateMany`, `delete`/`deleteMany`), WHERE helpers (`eq`, `gte`, `contains`, `and`, `or`), transactions, vector search
- **Auth** — password + JWT + OAuth2 Server (authorization code / PKCE / client_credentials)
- **Real-time** — WebSocket, messaging channels with agent routing
- **AI** — streaming endpoint, DAG workflow tool, AI agents with RAG and tool-use — re-exports `streamText`, `tool`, `openai` and more from AI SDK
- **Data** — Redis client, job queue with cron scheduling
- **Multi-tenant BaaS** — dynamic tables, auto REST + GraphQL, row-level isolation
- **Deploy** — self-hosted PaaS: multi-app proxy, zero-downtime updates, auto SSL
- **Security** — `helmet()` security headers, request ID tracing, rate limiting, CORS, auth
- **SEO** — `robots.txt`, `sitemap.xml`, `X-Robots-Tag` middleware, `seoTags()` for meta / OG / Twitter Card
- **i18n** — locale detection, JSON translations, `ctx.t()`
- **Email** — SMTP or custom transport
- **Health check** — configurable `/health` endpoint
- **Environment** — `loadEnv()` — `.env` file loader into `process.env`
- **iii** — optional module bringing Worker/Function/Trigger service paradigm, `registerWorker()` WebSocket SDK, and built-in `stream::*` functions
- **Test utilities** — `createTestServer()` — one-line test server setup

## Quick start

### Hello World

```ts
import { serve } from 'weifuwu'
serve((req, ctx) => new Response('Hello, World!'), { port: 3000 })
```

### Full app

```ts
import { serve, Router, postgres, user, aiStream, graphql, openai } from 'weifuwu'

const app = new Router()
const pg = postgres()

// Auth
const auth = user({ pg, jwtSecret: process.env.JWT_SECRET! })
await auth.migrate()
app.use('/auth', auth.router())

// AI streaming
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

// Static files
app.get('/static/*', serveStatic('./public'))

serve(app.handler(), { port: 3000 })
```

```
node app.ts
```

## Infrastructure

| Module | Import | What it gives you |
|--------|--------|-------------------|
| PostgreSQL | `postgres(options?)` | Connection pool + schema builder + CRUD (`read`/`readMany`, `insertMany`, `update`/`updateMany`, `delete`/`deleteMany`) + where helpers (`eq`, `gte`, `contains`, `and`, `or`) + transactions |
| Redis | `redis(options?)` | ioredis client injected as `ctx.redis` |
| Queue | `queue(options?)` | Redis-backed job queue with cron scheduling |
| Deploy | `deploy(config)` | Self-hosted PaaS: multi-app proxy, zero-downtime updates, auto SSL |

## Mountable modules

All use the same pattern — `const m = module(options)` → `app.use('/path', m.router())`:

| Module | Purpose | Also provides |
|--------|---------|---------------|
| `user(options)` | Auth (password + JWT + OAuth2) | `migrate()`, `middleware()`, `register()`, `login()`, `verify()`, `close()` |
| `tenant(options)` | Multi-tenant BaaS | `migrate()`, `middleware()`, `graphql()`, `close()` |
| `agent(options)` | AI agents | `migrate()`, `run()`, `addKnowledge()`, `close()` |
| `opencode(options)` | Programming assistant | `migrate()`, `wsHandler()`, `close()` |
| `messager(options)` | Real-time messaging | `migrate()`, `wsHandler()`, `send()`, `close()` |
| `aiStream(handler)` | AI streaming endpoint | — |
| `graphql(handler)` | GraphQL endpoint | — |
| `logdb(options)` | Structured event logging | `log()`, `migrate()`, `clean()`, `close()` |
| `health(options?)` | Health check | — |
| `seo(options?)` | `robots.txt`, `sitemap.xml`, indexing control | `seoMiddleware()`, `seoTags()` |
| `iii(options?)` | Worker/Function/Trigger service paradigm | `migrate()`, `trigger()`, `addWorker()`, `listWorkers()`, `listFunctions()`, `listTriggers()`, `shutdown()` |
| `registerWorker(url)` | Pure WebSocket SDK (browser/Node) | `registerFunction()`, `registerTrigger()`, `trigger()`, `shutdown()` |

## Middleware (all `(req, ctx, next) => Response`)

| Middleware | Description |
|-----------|-------------|
| `auth(options)` | Bearer token / custom header / verify / proxy |
| `cors(options?)` | CORS with preflight, origin whitelist, credentials |
| `logger(options?)` | Request logging with duration |
| `rateLimit(options?)` | In-memory rate limiting with headers |
| `compress(options?)` | Brotli / Gzip / Deflate compression |
| `validate(schemas)` | Zod validation (body, query, params) |
| `upload(options?)` | Multipart file upload |
| `i18n(options)` | Internationalization — `ctx.t()`, locale detection |
| `seoMiddleware(options?)` | `X-Robots-Tag` header — string or path-based function |
| `helmet(options?)` | Security headers — CSP, HSTS, X-Frame-Options, etc. |
| `requestId(options?)` | `X-Request-ID` header + `ctx.requestId` |

## Utility functions

| Function | Description |
|----------|-------------|
| `serveStatic(root, options?)` | Static file serving |
| `loadEnv(path?)` | Load `.env` file into `process.env` — no override, comments, quotes |
| `getCookies(req)` / `setCookie(res, ...)` / `deleteCookie(res, ...)` | Cookie helpers |
| `mailer(options)` | Email sender (SMTP or custom) |
| `createTestServer(handler)` | Start test server → `{ server, url }` |
| `seoTags(config)` | Generate `<title>`, `<meta>`, Open Graph, Twitter Card, canonical tags |
| `createSSEStream(iterable, opts?)` | SSE response from `AsyncIterable` |
| `formatSSE(event, data)` | Format SSE event string |
| `formatSSEData(data)` | Format SSE data string |
| `runWorkflow(options)` | DAG execution engine as AI SDK `Tool` |
| `pgTable(name, columns)` | Type-safe table schema builder |
| `pg.table(name, columns)` | Pre-bound table (no `sql` param needed) |
| `serial()`, `uuid()`, `text()`, ... | Column type builders |
| `eq()`, `gte()`, `contains()`, `and()` ... | WHERE clause helpers — same API as Drizzle |
| `PgModule` | Base class for DB-backed modules |
| `streamText()` / `generateText()` / `streamObject()` / `generateObject()` | AI SDK — text/structured generation |
| `tool()` | AI SDK — tool definition |
| `embed()` / `embedMany()` | AI SDK — text embeddings |
| `smoothStream()` | AI SDK — smooth streaming middleware |
| `openai` / `createOpenAI()` | OpenAI provider for AI SDK |
| `createHub(options?)` | WebSocket channel hub — `join()`, `leave()`, `broadcast()` with optional Redis pub/sub |

---

# iii — Worker / Function / Trigger

Optional module that organizes service logic as **Worker + Function + Trigger**, plus a pure WebSocket SDK for connecting remote workers. Built-in `stream::*` functions for hierarchical real-time data.

```ts
import { serve, Router, iii, createWorker, registerWorker } from 'weifuwu'

// Engine
const engine = iii({ pg, redis })
const app = new Router()
app.use('/iii', engine.router())
serve(app.handler(), { port: 3000, websocket: app.websocketHandler() })

// Local worker
const w = createWorker('orders')
w.registerFunction('orders::create', async (payload) => {
  return db.query('INSERT INTO orders ...', [payload.items])
})
w.registerTrigger({
  type: 'http', function_id: 'orders::create',
  config: { method: 'POST', path: '/orders' },
})
engine.addWorker(w)

// Invoke via Engine
await engine.trigger({ function_id: 'orders::create', payload: { items: ['apple'] } })

// Remote worker (browser or another process)
const rw = registerWorker('ws://host:3000/iii/worker')
rw.registerFunction('ui::notify', (p) => new Notification(p.title))
```

## Built-in functions

| Function | Description |
|----------|-------------|
| `stream::set(stream_name, group_id, item_id, data)` | Write + persist + notify subscribers |
| `stream::get(stream_name, group_id, item_id)` | Read single item |
| `stream::delete(stream_name, group_id, item_id)` | Delete + notify |
| `stream::list(stream_name, group_id)` | List all items in a group |
| `stream::list_groups(stream_name)` | List all groups in a stream |
| `stream::list_all()` | List all streams with metadata |
| `stream::send(stream_name, group_id, type, data, id?)` | Push event without persisting |
| `stream::update(stream_name, group_id, item_id, ops)` | Atomic operations (set/merge/increment/decrement/append/remove) |

## Storage backends

| Config | Persistence | Cross-process broadcast |
|--------|-------------|------------------------|
| `iii({})` | In-memory Map | — |
| `iii({ pg })` | PG table `_iii_stream` | — |
| `iii({ redis })` | Redis Hash | Redis pub/sub |
| `iii({ pg, redis })` | PG table | Redis pub/sub |

## Trigger actions

| Action | Behavior |
|--------|----------|
| `'sync'` (default) | Wait for result |
| `'void'` | Fire-and-forget, no result |

```ts
// Sync
const result = await engine.trigger({ function_id: 'math::add', payload: { a: 2, b: 3 } })
// → { c: 5 }

// Void
await engine.trigger({ function_id: 'notifications::send', payload: {...}, action: 'void' })
```

## REST API (mounted at `/iii`)

| Path | Description |
|------|-------------|
| `GET /iii/workers` | List connected workers |
| `GET /iii/functions` | List registered functions |
| `GET /iii/triggers` | List registered triggers |
| `POST /iii/trigger/:fnId` | Invoke a function |
| `WS /iii/worker` | Remote worker connection |

---

# Router

```ts
import { serve, Router } from 'weifuwu'

const app = new Router()
  .use((req, ctx, next) => {
    console.log(`${req.method} ${new URL(req.url).pathname}`)
    return next(req, ctx)
  })
  .get('/hello/:name', (req, ctx) =>
    Response.json({ message: `Hello, ${ctx.params.name}!` }),
  )
  .post('/data', async (req, ctx) => {
    const body = await req.json()
    return Response.json(body, { status: 201 })
  })

serve(app.handler(), { port: 3000 })
```

## WebSocket

```json
{ "type": "message",  "channel_id": 1, "content": "Hi" }
{ "type": "typing",   "channel_id": 1, "is_typing": true }
{ "type": "read",     "channel_id": 1, "last_message_id": 42 }
```

## Error handling

```ts
const app = new Router()
  .onError((err, req, ctx) =>
    Response.json({ error: err.message }, { status: 500 }),
  )
  .get('/crash', () => { throw new Error('boom') })
```

## Graceful shutdown

```ts
import { serve } from 'weifuwu'
import type { Server } from 'weifuwu'

const ac = new AbortController()
let server: Server

process.on('SIGTERM', () => {
  ac.abort()
  server.stop()
})

server = serve((req, ctx) => new Response('Hello'), {
  port: 3000,
  signal: ac.signal,
})
await server.ready
```

### Using with WebSocket

```ts
const app = new Router().ws('/chat', { … })
const server = serve(app.handler(), {
  port: 3000,
  signal: ac.signal,
  websocket: app.websocketHandler(),
})
```

### Cross-process WebSocket with `createHub`

Use `createHub()` to group WebSocket connections into named channels and broadcast to them — works within a single process, and with optional Redis pub/sub across multiple Node.js processes behind a load balancer.

```ts
import { createHub, serve, Router } from 'weifuwu'
import { redis } from 'weifuwu'

const hub = createHub({ redis })   // omit redis for in-process only

const app = new Router().ws('/chat/:room', {
  open(ws, ctx) {
    hub.join(`room:${ctx.params.room}`, ws)
  },
  message(ws, ctx, data) {
    hub.broadcast(`room:${ctx.params.room}`, {
      user: ctx.user?.id,
      text: data.toString(),
    })
  },
  close(ws) {
    hub.leave(ws)
  },
})

serve(app.handler(), {
  port: 3000,
  websocket: app.websocketHandler(),
})
```

With Redis configured, `hub.broadcast()` publishes to a Redis channel — all processes subscribed via `createHub({ redis })` receive and forward to their local WebSocket connections.

---

# Middleware

## Auth

```ts
import { auth } from 'weifuwu'

// Static bearer token
app.use(auth({ token: 'sk-123' }))

// Custom verify (JWT, DB, etc.) — return object to set ctx.user
app.use(auth({
  verify: async (token) => {
    const user = await db.findUserByToken(token)
    return user ? { sub: user.id, role: user.role } : null
  },
}))

// Proxy validation to external auth service
app.get('/protected', auth({ proxy: 'http://auth:3000/validate' }), handler)

// Custom header
app.use(auth({ header: 'X-API-Key', token: 'my-key' }))
```

## CORS

```ts
import { cors } from 'weifuwu'

app.use(cors())                                          // allow all
app.use(cors({ origin: ['https://example.com'] }))       // whitelist
app.use(cors({ origin: (o) => o.endsWith('.trusted.com') ? o : false }))
app.use(cors({ credentials: true, maxAge: 3600 }))
```

## Logger

```ts
import { logger } from 'weifuwu'

app.use(logger())                           // GET /hello 200 5ms
app.use(logger({ format: 'combined' }))     // with query params
```

## Rate limit

```ts
import { rateLimit } from 'weifuwu'

app.use(rateLimit({ max: 100, window: 60_000 }))          // 100 req/min
app.get('/api', rateLimit({ max: 10 }), handler)          // per-route

// Custom key (by API key, user ID, etc.)
app.use(rateLimit({
  max: 1000,
  key: (req) => req.headers.get('x-api-key') ?? 'anonymous',
}))
```

## Compression

```ts
import { compress } from 'weifuwu'

app.use(compress())                       // brotli > gzip > deflate
app.use(compress({ threshold: 2048 }))    // only compress > 2KB
```

## Validation

```ts
import { z } from 'zod'
import { validate } from 'weifuwu'

const CreateUser = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

router.post('/users',
  validate({ body: CreateUser }),
  (req, ctx) => {
    // ctx.parsed.body — typed & validated
  },
)
```

## File upload

```ts
import { upload } from 'weifuwu'

router.post('/upload',
  upload({ dir: './uploads', maxFileSize: 10_485_760 }),
  (req, ctx) => {
    // ctx.parsed.files.avatar  → { name, type, size, path }
    // ctx.parsed.fields.title  → 'hello'
  },
)
```

## Cookie

```ts
import { getCookies, setCookie, deleteCookie } from 'weifuwu'

// Read
const cookies = getCookies(req)        // { session: 'abc' }

// Set (immutable — returns new Response)
let res = new Response('ok')
res = setCookie(res, 'session', 'token', { httpOnly: true, secure: true, maxAge: 3600 })

// Delete
res = deleteCookie(res, 'session')
```

## Static files

```ts
import { serveStatic } from 'weifuwu'

router.get('/static/*', serveStatic('./public'))
```

Features: MIME type detection (20+ types), ETag + If-None-Match (304), directory index (index.html), path traversal protection, Cache-Control.

---

# PostgreSQL

Built-in PostgreSQL client — connection management, type-safe DDL, transactions, and module lifecycle.

```ts
import { serve, Router, postgres } from 'weifuwu'

const app = new Router()
const pg = postgres()          // reads DATABASE_URL
app.use(pg)                     // injects ctx.sql into handlers
```

## Type-safe DDL with schema builder

Define tables declaratively with type inference — no raw SQL for common operations, no Zod needed:

```ts
import { pgTable, serial, uuid, text, integer, boolean, timestamptz, jsonb, sql, timestamps } from 'weifuwu'

const users = pgTable('_users', {
  id:        serial('id').primaryKey(),
  name:      text('name').notNull(),
  email:     text('email').unique().notNull(),
  age:       integer('age'),
  active:    boolean('active').default(true),
  ...timestamps(),               // adds created_at + updated_at with defaults
  metadata:  jsonb<{ role: string }>('metadata'),
})
```

Supports 11 column types:
| Builder | DDL | TS Type |
|---------|-----|---------|
| `serial()` | `SERIAL` | `number` |
| `uuid()` | `UUID` | `string` |
| `text()` | `TEXT` | `string` |
| `integer()` | `INTEGER` | `number` |
| `boolean()` | `BOOLEAN` | `boolean` |
| `timestamptz()` | `TIMESTAMPTZ` | `string` |
| `jsonb<T>()` | `JSONB` | `T` |
| `textArray()` | `TEXT[]` | `string[]` |
| `vector(name, dims)` | `vector(N)` | `number[]` |
| `timestamps()` | two TIMESTAMPTZ columns | `{ created_at, updated_at }` |

Column constraints chainable: `.primaryKey()`, `.notNull()`, `.nullable()`, `.default(value | sql\`...\`)`, `.unique()`, `.references(table, column?, onDelete?)`.

## DDL execution

```ts
await users.create()                         // CREATE TABLE IF NOT EXISTS
await users.create({                         // WITH PARTITION BY RANGE
  partitionBy: partitionBy('range', 'created_at'),
})
await users.createIndex('email')             // CREATE INDEX
await users.createUniqueIndex('slug')        // CREATE UNIQUE INDEX
await users.createIndex('created_at', { desc: true })
await users.createIndex(['a', 'b'])          // multi-column
await users.createIndex('embedding', {       // pgvector HNSW
  type: 'hnsw', operator: 'vector_cosine_ops',
})
await users.drop({ cascade: true })
```

## Type-safe CRUD with BoundTable

Two usage paths — use `pg.table()` when you have a `pg` handle, or `pgTable()` with explicit `sql`:

The `BoundTable` follows a clean CRUD naming — singular for one, plural for many:

```ts
// pg.table() — auto-binds sql, no need to pass it
const users = pg.table('_users', {
  id:        serial('id').primaryKey(),
  name:      text('name').notNull(),
  email:     text('email').unique(),
  active:    boolean('active').default(true),
  ...timestamps(),
})

// Create — single
const user = await users.insert({ name: 'Alice', email: 'alice@test.com' })
// → { id: 1, name: 'Alice', ... }

// Create — many
const batch = await users.insertMany([
  { name: 'Alice' },
  { name: 'Bob' },
  { name: 'Charlie' },
])
// → [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }, { id: 3, name: 'Charlie' }]

// Read — by id
const found = await users.read(1)

// Read — with selected columns
const partial = await users.read(1, { select: ['id', 'name'] })

// Read — many with optional filtering + pagination
const { count, data } = await users.readMany({ role: 'admin' })
// count is total matching rows, data is the page
const { data: sorted } = await users.readMany({ active: true }, { orderBy: { name: 'asc' } })
const { data: page } = await users.readMany(undefined, { limit: 10, offset: 0 })
const { data: filtered } = await users.readMany(
  { role: 'admin' },
  { orderBy: { name: 'desc' }, limit: 5 },
)

// Read — complex conditions with where helpers
import { eq, gte, lt, contains, and } from 'weifuwu'
const { count, data } = await users.readMany(
  and(
    eq('role', 'admin'),
    gte('created_at', '2026-01-01'),
    contains('metadata', { region: 'us' }),
  ),
  { orderBy: { name: 'asc' } },
)
// Array shorthand — implicit AND
const { data } = await users.readMany(
  [eq('role', 'admin'), gte('created_at', '2026-01-01')],
  { limit: 10 },
)

// Update — single row by id (auto-sets updated_at if column exists)
const updated = await users.update(1, { name: 'Bob' })
// → { id: 1, name: 'Bob', email: 'alice@test.com', ... }

// Update — many with Partial where
const count = await users.updateMany({ role: 'guest' }, { role: 'user' })

// Update — many with SQL where
await users.updateMany(gte('age', 65), { role: 'retired' })

// Delete — single row by id, returns deleted row
const deleted = await users.delete(1)
// → { id: 1, name: 'Bob', ... } or undefined

// Delete — many
const deleted = await users.deleteMany({ active: false })

// Read — select specific columns
const { data } = await users.readMany(
  { role: 'admin' },
  { select: ['id', 'name', 'email'], limit: 10 },
)
```

### Upsert

```ts
// Insert or update on conflict
const user = await users.upsert(
  { email: 'alice@test.com', name: 'Alice' },
  'email',  // conflict target — column(s) with unique constraint
)
// ON CONFLICT (email) DO UPDATE SET "name" = EXCLUDED."name" RETURNING *
```

Supports composite conflict targets:

```ts
await members.upsert(
  { channel_id: 1, member_id: 42, role: 'admin' },
  ['channel_id', 'member_id'],
)
```

### Count

```ts
const total = await users.count()                         // all rows
const admins = await users.count({ role: 'admin' })       // with Partial filter
const recent = await users.count(gte('created_at', from)) // with SQL condition
```

### Soft delete

If a table has a `deleted_at` column, `delete()` and `deleteMany()` set the timestamp instead of removing the row:

```ts
const users = pg.table('_users', {
  id: serial('id').primaryKey(),
  name: text('name'),
  deleted_at: timestamptz('deleted_at'),  // enables soft delete
})

await users.delete(1)           // SET deleted_at = NOW() WHERE id = 1
await users.deleteMany({ role: 'guest' })

// readMany auto-filters soft-deleted rows
const { data } = await users.readMany()   // WHERE deleted_at IS NULL

// Include soft-deleted rows
const { data } = await users.readMany(undefined, { withDeleted: true })

// Hard delete (bypass soft delete)
await users.hardDelete(1)
await users.hardDeleteMany({ role: 'guest' })
```

### Timestamps

The `timestamps()` macro adds `created_at` and `updated_at` columns with `NOT NULL DEFAULT NOW()`.

`update()` automatically appends `"updated_at" = NOW()` to the SET clause when the column exists — no need to pass it manually.

### Where helpers

Importable functions for composing complex WHERE clauses. Works with `readMany`, `updateMany`, `deleteMany`, and `count` — pass as the first argument (single `SQL` or `SQL[]` for implicit AND):

```ts
import { eq, ne, gt, gte, lt, lte, isNull, isNotNull, like, contains, in_, and, or, not } from 'weifuwu'

// Single condition
const { data } = await users.readMany(gte('created_at', '2026-01-01'))

// Array = implicit AND
const { data } = await users.readMany([
  eq('role', 'admin'),
  gte('created_at', '2026-01-01'),
  contains('metadata', { region: 'us' }),
])

// Explicit AND/OR composition
const { data } = await users.readMany(
  or(
    and(eq('role', 'admin'), eq('status', 'active')),
    eq('role', 'superadmin'),
  ),
  { orderBy: { name: 'asc' }, limit: 10 },
)

// Also works with updateMany and deleteMany
await users.updateMany(gte('age', 65), { role: 'retired' })
await users.deleteMany(eq('status', 'archived'))
```

| Helper | SQL | Example |
|--------|-----|---------|
| `eq(col, val)` | `= $1` | `eq('level', 'error')` |
| `ne(col, val)` | `!= $1` | `ne('status', 'archived')` |
| `gt(col, val)` | `> $1` | `gt('age', 18)` |
| `gte(col, val)` | `>= $1` | `gte('created_at', '2026-01-01')` |
| `lt(col, val)` | `< $1` | `lt('id', beforeId)` |
| `lte(col, val)` | `<= $1` | `lte('score', 100)` |
| `isNull(col)` | `IS NULL` | `isNull('deleted_at')` |
| `isNotNull(col)` | `IS NOT NULL` | `isNotNull('email')` |
| `like(col, pattern)` | `LIKE $1` | `like('name', 'Alice%')` |
| `contains(col, obj)` | `@> $1::jsonb` | `contains('metadata', { service: 'auth' })` |
| `in_(col, arr)` | `= ANY($1)` | `in_('id', [1, 2, 3])` |
| `and(...conds)` | `(... AND ...)` | `and(eq('a', 1), eq('b', 2))` |
| `or(...conds)` | `(... OR ...)` | `or(eq('a', 1), eq('b', 2))` |
| `not(cond)` | `NOT (...)` | `not(eq('status', 'archived'))` |

### Complex queries use raw SQL

```ts
app.get('/users/stats', async (req, ctx) => {
  const rows = await ctx.sql`
    SELECT u.*, count(p.id) as posts
    FROM ${users} u LEFT JOIN posts p ON p.user_id = u.id
    GROUP BY u.id
  `
  return Response.json(rows)
})
```

### Transactions

```ts
const result = await pg.transaction(async (tx) => {
  const [user] = await tx`INSERT INTO "_users" (...) VALUES (...) RETURNING *`
  const [wallet] = await tx`INSERT INTO "_wallets" ("user_id") VALUES (${user.id}) RETURNING *`
  return { user, wallet }
})
```

Use BoundTable methods inside transactions with `withSql()`:

```ts
const users = pg.table('_users', { ... })
const wallets = pg.table('_wallets', { ... })

const result = await pg.transaction(async (tx) => {
  const txUsers = users.withSql(tx)
  const txWallets = wallets.withSql(tx)

  const user = await txUsers.insert({ name: 'Alice' })
  await txWallets.insert({ user_id: user.id })
  return user
})
```

### Connection lifecycle

```ts
const pg = postgres()                          // reads DATABASE_URL
const pg = postgres('postgres://...')          // explicit connection
const pg = postgres({
  connection: 'postgres://...',
  max: 10,                                     // pool size
  ssl: { rejectUnauthorized: false },          // SSL options
  idle_timeout: 30,                            // idle timeout (s)
  connect_timeout: 10,                         // connection timeout (s)
  closeTimeout: 5,                             // close grace period (s)
  signal: ac.signal,                           // abort → sql.end()
})
await pg.close()
```

### Module base class

Every database module extends `PgModule`:

```ts
import { PgModule } from 'weifuwu'

class MyModule extends PgModule {
  constructor(pg: PostgresClient) {
    super(pg)   // sets this.sql = pg.sql
  }
  async migrate() { /* override */ }

  // Built-in helpers
  // this.table(name, builders) — create a BoundTable
  // this.transaction(fn) — run in a transaction
  // close() — calls pg.close() automatically
}
```

---

# Auth & User

```ts
import { serve, Router, postgres, user } from 'weifuwu'

const app = new Router()
const pg = postgres()
await pg.migrate()

const auth = user({ pg, jwtSecret: process.env.JWT_SECRET! })

// POST /auth/register  { email, password, name }
// POST /auth/login     { email, password }
// GET  /auth/oauth/authorize?client_id=...&redirect_uri=...&response_type=code
// POST /auth/oauth/consent
// POST /auth/oauth/token  (grant_type=authorization_code|client_credentials)
app.use('/auth', auth.router())

// Protected routes — verifies JWT, sets ctx.user
app.get('/me', auth.middleware(), async (req, ctx) => {
  return Response.json(ctx.user)
  // { id, email, name, role }
})
```

Password hashing uses `crypto.scryptSync` + `timingSafeEqual` (Node.js built-in, zero deps). JWT tokens use the `jsonwebtoken` package. The users table (`_users` by default) is auto-created on first `migrate()`.

## OAuth2 Server

Enable OAuth2 Server to let third-party apps (SPA, mobile, microservices) authenticate users through your app.

```ts
const auth = user({
  pg,
  jwtSecret: process.env.JWT_SECRET!,
  oauth2: { server: true },
})

await auth.migrate()  // creates _users + _oauth2_clients + _oauth2_codes + _oauth2_tokens

// Register a client app (programmatic — CLI, admin UI, seed script)
const client = await auth.registerClient({
  name: 'My SPA',
  redirectUris: ['https://myapp.com/callback'],
})
// → { clientId, clientSecret, name, redirectUris }

// Use auth middleware to protect routes — OAuth2 JWT tokens work seamlessly
app.get('/api/data', auth.middleware(), handler)
```

### Supported Grant Types

| Grant | Use Case | PKCE |
|-------|----------|------|
| `authorization_code` (with client_secret) | Server-side apps | Optional |
| `authorization_code` (with `code_challenge`/`code_verifier`) | SPA / Mobile apps | Required |
| `client_credentials` | Machine-to-machine | — |

### Flow (Authorization Code + PKCE)

```
1. Third-party app redirects user:
    GET /oauth/authorize?client_id=xxx&redirect_uri=https://app.com/cb
                       &response_type=code&code_challenge=S256&state=yyy

2. User not logged in → 302 to /login?redirect=... → auto returns to consent page after login

3. User confirms consent → POST /oauth/consent { approve: true, client_id, ... }
     302 redirect_uri?code=xxx&state=yyy

4. Third-party app POST /oauth/token
   { grant_type: authorization_code, code, client_id, client_secret,
     redirect_uri, code_verifier }
   → { access_token, token_type: "Bearer", expires_in, refresh_token }

5. access_token is a standard JWT — auth.middleware() and auth.verify() work with it directly
```

### Client Management

```ts
const client  = await auth.registerClient({ name, redirectUris })
const found   = await auth.getClient(client.clientId)
await auth.revokeClient(client.clientId)
```

### Using OAuth2 Tokens with the Built-in Auth Middleware

The `access_token` issued by the OAuth2 Server shares the same `jwtSecret` and compatible payload (`sub`, `email`, `role`) as password-login JWTs, so `auth()` can verify OAuth2 tokens without any modifications:

```ts
import { auth } from 'weifuwu'

// Same auth() middleware validates both password-login JWTs and OAuth2 JWTs
app.get('/api', auth({ verify: (token) => auth.verify(token) }), handler)
```

For `client_credentials` tokens (machine-to-machine), `verify()` returns `null` since no user is associated.

### Social Login (GitHub) — Cookbook

`user()` does not bundle social login (to avoid third-party dependencies), but adding a GitHub login with the low-level API takes ~30 lines:

```ts
import { user } from 'weifuwu'
import jwt from 'jsonwebtoken'

const auth = user({ pg, jwtSecret })

// 1. Redirect to GitHub authorization
app.get('/auth/github', () => {
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', process.env.GH_CLIENT_ID!)
  url.searchParams.set('redirect_uri', 'http://localhost:3000/auth/github/callback')
  url.searchParams.set('scope', 'user:email')
  return Response.redirect(url.href)
})

// 2. GitHub callback → fetch user info → register/login
app.get('/auth/github/callback', async (req) => {
  const { code } = Object.fromEntries(new URL(req.url).searchParams)
  if (!code) return new Response('Missing code', { status: 400 })

  // Exchange code for token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GH_CLIENT_ID,
      client_secret: process.env.GH_CLIENT_SECRET,
      code,
    }),
  })
  const { access_token } = await tokenRes.json() as any

  // Fetch user info from GitHub
  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  const ghUser = await userRes.json() as any

  // Find or create local user
  const existing = await pg.sql`SELECT * FROM "_users" WHERE email = ${ghUser.email}`
  let localUser = existing[0]

  if (!localUser) {
    localUser = await auth.register({
      email: ghUser.email,
      password: crypto.randomUUID(),  // Random password — user can only log in via GitHub
      name: ghUser.name ?? ghUser.login,
    })
  }

  // Sign JWT (same format as user())
  const token = jwt.sign(
    { sub: localUser.id, email: localUser.email, role: localUser.role ?? 'user' },
    process.env.JWT_SECRET!,
    { expiresIn: '24h' },
  )
  return Response.json({ token })
})
```

The same pattern works for Google, WeChat, or any OAuth2 provider.

---

# React SSR with tsx()

```ts
import { serve, Router } from 'weifuwu'
import { tsx } from 'weifuwu/tsx'

const app = new Router()
app.use('/', await tsx({ dir: './ui/' }))

serve(app.handler(), { port: 3000, websocket: app.websocketHandler() })
```

### Directory structure

```
ui/
├── pages/              ← page files
│   ├── page.tsx        → GET /           (React component, default export)
│   ├── layout.tsx      → root layout     (HTML shell, receives req/ctx, NOT hydrated)
│   ├── not-found.tsx   → 404 error page  (rendered for unmatched routes, wrapped in layout)
│   ├── about/page.tsx  → GET /about
│   ├── blog/[slug]/
│   │   ├── page.tsx    → GET /blog/:slug
│   │   ├── load.ts     → data fetching   (server-only, default export)
│   │   └── route.ts    → POST /blog/:slug (API, named exports POST/PUT/DELETE/...)
│   ├── blog/layout.tsx → /blog/* layout  (UI structure, receives children, hydrated)
│   └── api/search/
│       └── route.ts    → GET /api/search (standalone API, no page.tsx needed)
└── components/         ← component files (auto-detected by HMR)
    └── button.tsx
```

### Development mode

tsx() runs in development mode automatically when `NODE_ENV !== 'production'`:

- **File watching** — chokidar watches the `dir` directory for `.tsx`/`.ts` changes
  - Page files in `pages/` → single-file recompilation + registry update
  - Component files in `components/` → full rebuild of all pages
  - New files are detected automatically
- **Live reload** — Compiled via esbuild `write: false` + `vm.Script.runInContext` (no disk writes, no `node --watch` conflict)
- **WebSocket auto-refresh** — `/__weifuwu/livereload` endpoint pushes reload signals; browser refreshes automatically
- **`node --watch` compatible** — External files (`app.ts`, `middleware/`) handled by `--watch` restart; `ui/` changes handled by tsx() without conflict

```bash
node app.ts                # development (auto-reload + live refresh)
NODE_ENV=production node app.ts   # production
```

### Tailwind CSS

tsx() includes built-in Tailwind CSS v4 support. If an `app.css` file exists in the `dir` directory, it is compiled automatically through PostCSS + `@tailwindcss/postcss`. If no `app.css` is found, one is created automatically:

```css
@import "tailwindcss";
```

Write `className` directly in your components — no CLI, no configuration:

```tsx
export default function Home() {
  return <h1 className="text-3xl font-bold text-blue-600">Hello</h1>
}
```

### `@` alias

If your project has a `tsconfig.json` or `jsconfig.json` with `compilerOptions.paths`, tsx() reads it automatically and passes aliases to all esbuild builds (SSR compilation, hydration bundles, and hot reload):

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./ui/*"]
    }
  }
}
```

### shadcn/ui

tsx() works with [shadcn/ui](https://ui.shadcn.com) out of the box.

```bash
npx shadcn@latest init
# Style: your preference
# Base color: your preference
# CSS file path: ui/app.css
# Import alias: @/  →  ./ui/
```

### page.tsx — page component

```tsx
export default function Page({ params, query }: {
  params: { slug: string }
  query: Record<string, string>
}) {
  return <article><h1>{params.slug}</h1></article>
}
```

### load.ts — data fetching (server-only)

```ts
export default async function load({ params, query }: {
  params: Record<string, string>
  query: Record<string, string>
}) {
  const data = await db.query(params.slug)
  return { data }   // merged into props passed to page.tsx
}
```

### layout.tsx

**Root layout** (`pages/layout.tsx`) — receives `{ children, req, ctx }`:

```tsx
export default function RootLayout({ children, req, ctx }: {
  children: React.ReactNode
  req: Request
  ctx: Context
}) {
  return (
    <html>
      <head><title>App</title></head>
      <body><div id="__weifuwu_root">{children}</div></body>
    </html>
  )
}
```

**Nested layouts** (`pages/blog/layout.tsx`) — receives only `{ children }`.

### route.ts — API (co-located with page)

```ts
export const POST: Handler = async (req, ctx) => {
  const body = await req.json()
  return Response.json({ ...body, slug: ctx.params.slug })
}
```

### not-found.tsx — 404 page

```tsx
export default function NotFound() {
  return <h1 class="text-4xl">404 – Not Found</h1>
}
```

---

# AI: Streaming & Workflow

## AI streaming

Server-sent event streaming via the Vercel AI SDK:

```ts
import { serve, Router, aiStream, openai } from 'weifuwu'

const app = new Router()
const chat = await aiStream(async (req, ctx) => {
  const { messages } = await req.json()
  return { model: openai('gpt-4o'), messages }
})
app.use('/chat', chat.router())

serve(app.handler(), { port: 3000 })
```

## runWorkflow

Multi-step DAG execution engine — packaged as a single AI SDK `Tool`. Use it with `streamText()` or `generateText()` when the LLM needs conditional logic, loops, or multi-step tool orchestration.

```ts
import { tool, streamText, runWorkflow } from 'weifuwu'
import { z } from 'zod'

const tools = {
  queryUser: tool({
    description: 'Query user info',
    inputSchema: z.object({ userId: z.string() }),
    execute: async ({ userId }) => ({ id: userId, email: 'user@test.com', name: 'Test' }),
  }),
  sendEmail: tool({
    description: 'Send an email',
    inputSchema: z.object({ to: z.string(), subject: z.string() }),
    execute: async ({ to, subject }) => ({ sent: true }),
  }),
  runWF: runWorkflow({ tools: { queryUser, sendEmail } }),
}

const result = await streamText({
  model,
  tools,
  messages: [{ role: 'user', content: 'Query user 123, send welcome email if exists' }],
})
```

### Node types

7 built-in node types for defining the execution graph:

| Node | Purpose | Input |
|------|---------|-------|
| `call` | Call a registered AI SDK Tool | `{ tool: "name", args: {...} }` |
| `set` | Assign a variable | `{ name: "x", value: 42 }` |
| `get` | Read a variable | `{ name: "x" }` |
| `eval` | Evaluate an expression | `{ expression: "$var.x + 1" }` |
| `if` | Conditional branch | `{ conditions: [{ test: ..., body: [nodes] }] }` |
| `while` | Loop | `{ condition: "$var.i < 5" }, body: [nodes]` |
| `http` | HTTP request | `{ url: "https://...", method: "GET" }` |

### Reference syntax

| Pattern | Meaning | Example |
|---------|---------|---------|
| `$var.x` | Variable `x` | `$var.counter` |
| `$nodes.u.output` | Full output of node `u` | `$nodes.u.output` |
| `$nodes.u.output.field` | Specific field | `$nodes.u.output.email` |
| `$input.userId` | Input param | `$input.userId` |

---

# AI Agent

Server-side AI agents with OpenAI-compatible API. Built-in chat, tool-use (tool-calling), and knowledge (RAG) types. Works out of the box with Ollama or any OpenAI-compatible provider.

```ts
import { agent } from 'weifuwu'

const agents = agent({ pg })

await agents.migrate()
app.use('/api', agents.router())
```

| Type | Description | Execution |
|------|-------------|-----------|
| `chat` | Pure conversation | `streamText()` / `generateText()` |
| `tool-use` | Tool-calling agent | `streamText({ tools })` |

### Knowledge (RAG)

Add documents to any agent — `searchKnowledge` tool auto-injected:

```ts
await agents.addKnowledge(agentId, 'Title', 'Document content...')
```

### Streaming

```http
POST /agents/:id/run  { input: "hello", stream: true }
→ event-stream (fullStream SSE: text-delta, tool-call, tool-result, finish)
```

### Programmatic API

```ts
const result = await agents.run(agentId, { input: 'hello', stream: false })
// { output: "Hello!", elapsed: 1234 }
```

---

# GraphQL

Dynamic GraphQL schema generated per-request based on the authenticated tenant's tables.

```graphql
type Article {
  id: ID!
  title: String!
  content: String
  status: String
  comments(limit: Int, offset: Int): [Comment!]!
}

type Query {
  articles(limit: Int, offset: Int): [Article!]!
  getArticle(id: ID!): Article
}

type Mutation {
  createArticle(data: CreateArticleInput!): Article!
  updateArticle(id: ID!, data: PatchArticleInput!): Article!
  deleteArticle(id: ID!): Boolean!
}
```

Built with `graphql-js` native constructors (`GraphQLObjectType`), no SDL generation, no `makeExecutableSchema`.

---

# Tenant BaaS

Built-in multi-tenant backend-as-a-service — define tables at runtime via API, get RESTful CRUD + GraphQL automatically, with row-level tenant isolation.

```ts
import { serve, Router, postgres, user, tenant } from 'weifuwu'

const pg = postgres()
const u = user({ pg, jwtSecret: process.env.JWT_SECRET! })
const t = tenant({ pg, usersTable: '_users' })

await pg.migrate()
await u.migrate()
await t.migrate()           // creates _tenants, _tenant_members, _user_tables

const app = new Router()
app.use('/auth', u.router())
app.use('/api', u.middleware())     // → ctx.user
app.use('/api', t.middleware())     // → ctx.tenant
app.use('/api', t.router())        // → management + data CRUD
app.use('/graphql', t.graphql())   // → dynamic GraphQL
```

## System tables

| Table | Purpose |
|-------|---------|
| `_tenants` | Tenant records (`id TEXT PK DEFAULT gen_random_uuid()`, `name`, `created_at`) |
| `_tenant_members` | User-tenant membership (`tenant_id`, `user_id`, `role`) |
| `_user_tables` | Dynamic table definitions (`tenant_id`, `slug`, `fields JSONB`) |

## Dynamic table API

Create a table at runtime:

```json
POST /api/tables
{
  "slug": "articles",
  "fields": [
    { "name": "title", "type": "string", "required": true },
    { "name": "content", "type": "text" },
    { "name": "status", "type": "enum", "options": ["draft", "published"], "default": "draft" },
    { "name": "views", "type": "integer", "default": 0 },
    { "name": "embedding", "type": "vector", "dimensions": 1536, "index": "hnsw" }
  ]
}
```

## Field types

| type | PostgreSQL | Index support |
|------|-----------|---------------|
| `string` | `TEXT` | `true`, `unique` |
| `integer` | `INTEGER` | `true`, `desc`, `unique` |
| `float` | `DOUBLE PRECISION` | `true`, `desc` |
| `boolean` | `BOOLEAN` | `true` |
| `text` | `TEXT` | `true` |
| `datetime` | `TIMESTAMPTZ` | `true`, `desc` |
| `date` | `DATE` | `true`, `desc` |
| `enum` | `TEXT` (with validation) | `true` |
| `json` | `JSONB` | `gin` |
| `vector` | `vector(n)` (pgvector) | `hnsw` (HNSW, vector_cosine_ops) |

## RESTful API

All routes require `ctx.tenant` (set by `t.middleware()`). All queries automatically filter by `tenant_id`.

| Route | Method | Description |
|-------|--------|-------------|
| `/sys/tenants` | POST | Create tenant, caller becomes admin |
| `/sys/tenants` | GET | List user's tenants |
| `/sys/tenants/invite` | POST | Invite user by email (admin) |
| `/sys/tenants/members/:userId` | DELETE | Remove member (admin) |
| `/sys/tables` | POST/GET | Create / list dynamic tables |
| `/sys/tables/:slug` | GET/PATCH/DELETE | Get schema / add fields / drop table |
| `/:slug` | GET | List rows (limit, offset, sort) |
| `/:slug` | POST | Create row |
| `/:slug/:id` | GET/PATCH/DELETE | Get / update / delete row |
| `/:slug/:id/:_nested` | GET | List related rows (has_many / M2M) |
| `/:slug/:id/:_nested` | POST | Create related row (auto-fills relation field) |

---

# Messager

Real-time chat with channels, WebSocket, and agent routing.

```ts
import { messager, agent, redis } from 'weifuwu'

const agents = agent({ pg })

// Single process (no cross-process broadcast):
// const msg = messager({ pg, agents })
// Multi-process (Redis pub/sub broadcast):
const msg = messager({ pg, agents, redis: redis() })

await msg.migrate()
app.use('/api', msg.router())
app.ws('/ws', u.middleware(), msg.wsHandler())
```

## Channels

```http
POST   /channels            name, type (channel|dm), members
GET    /channels
GET    /channels/:id
```

## Messages

```http
GET  /channels/:id/messages     ?limit=50&before={id}
POST /channels/:id/messages     content, sender_type, type
POST /channels/:id/read         last_message_id
```

## WebSocket

```json
{ "type": "message",  "channel_id": 1, "content": "Hi" }
{ "type": "typing",   "channel_id": 1, "is_typing": true }
{ "type": "read",     "channel_id": 1, "last_message_id": 42 }
```

## Programmatic send

```ts
await msg.send(channelId, 'System message', { sender_type: 'system' })
```

---

# LogDB — Structured Event Logging

PostgreSQL-backed structured logging with monthly partitioning, metadata search, and built-in REST API.

```ts
import { serve, Router, logdb, postgres } from 'weifuwu'

const pg = postgres()
const logger = logdb({ pg })

await logger.migrate()                    // create table + partitions
app.use('/logs', logger.router())         // mount REST API
```

## Module API

```ts
const logger = logdb({
  pg: PostgresClient,
  table?: string           // default: '_log_entries'
})
```

| Method | Returns | Description |
|--------|---------|-------------|
| `log(input)` | `LogEntry` | Insert a log entry programmatically |
| `router()` | `Router` | REST API routes: `POST /`, `GET /`, `GET /:id` |
| `migrate()` | `Promise<void>` | Create partitioned table + month partitions |
| `clean(n)` | `Promise<number>` | Drop partitions older than `n` months |
| `close()` | `Promise<void>` | Close database connection |

## Log entries

```ts
interface LogEntryInput {
  level: string                    // info, warn, error, debug
  source: string                   // api, ui, system, or custom
  message: string
  metadata?: Record<string, unknown>
}
```

## REST API

| Method | Path | Description |
|--------|------|-------------|
| `POST /` | Create a log entry | Returns `LogEntry` with status 201 |
| `GET /` | Query log entries | Returns `{ entries: LogEntry[], total: number }` |
| `GET /:id` | Get single entry | Returns `LogEntry` or 404 |

### Query parameters (`GET /`)

| Param | Example | Description |
|-------|---------|-------------|
| `level` | `?level=error` | Filter by level (exact match) |
| `source` | `?source=api` | Filter by source (exact match) |
| `after` | `?after=2026-01-01` | Entries on or after this timestamp |
| `before` | `?before=2026-03-01` | Entries before this timestamp |
| `meta.*` | `?meta.service=auth&meta.env=prod` | Filter by metadata key/value |
| `limit` | `?limit=20` | Page size (default: 50) |
| `offset` | `?offset=40` | Page offset (default: 0) |

## Partitioning

Logs are stored in a PostgreSQL range-partitioned table by `created_at`. Partitions are pre-created for the current month + 12 months ahead. This keeps each partition small, enables partition-pruning for time-range queries, and allows instant retention via `DROP TABLE`.

### Retention

```ts
// Drop all partitions older than 12 months
const dropped = await logger.clean(12)
console.log(`Dropped ${dropped} old partitions`)
```

The `migrate()` method creates the parent table and pre-creates partitions. The `log()` method checks for the current month's partition and creates it if missing — safe across month boundaries without re-running migration.

---

# Opencode

AI programming assistant — chat with LLM agents that have access to filesystem tools, skills, and isolated session workspaces.

```ts
import { serve, Router, postgres, opencode } from 'weifuwu'

const app = new Router()
const pg = postgres()
const oc = await opencode({ pg, permissions: { ... } })

await oc.migrate()
app.use('/opencode', await oc.router())
app.ws('/opencode', oc.wsHandler())

serve(app.handler(), { port: 3000, websocket: app.websocketHandler() })
```

### Tools

| Tool | Description |
|------|-------------|
| `bash` | Execute shell commands in the workspace |
| `read` | Read files with offset/limit |
| `write` | Create or overwrite files |
| `edit` | Exact string replacements |
| `grep` | Regex content search |
| `glob` | Glob pattern file search |
| `web` | Fetch URL content |
| `question` | Ask the user for input |
| `skill` | Load a skill on demand |

### Permissions

Control tool access per conversation:

```ts
const oc = await opencode({
  pg,
  permissions: {
    bash: { allow: true },
    read: { allow: true },
    write: { allow: false },
    edit: { allow: false },
    skill: { '*': { allow: true }, 'internal-*': { allow: false } },
  },
})
```

---

# SEO

Built-in SEO module — `robots.txt`, `sitemap.xml`, indexing headers, and meta tag utilities.

```ts
import { seo, seoMiddleware, seoTags } from 'weifuwu'

const app = new Router()

// robots.txt + sitemap.xml
app.use(seo({
  baseUrl: 'https://example.com',
  robots: [
    { userAgent: '*', allow: '/', disallow: ['/admin', '/api'] },
  ],
  sitemap: {
    urls: [
      { loc: '/', changefreq: 'daily', priority: 1.0 },
      { loc: '/about', changefreq: 'monthly', priority: 0.8 },
    ],
    // Dynamic URLs from database
    async resolve() {
      const articles = await db.query('SELECT slug, updated_at FROM articles')
      return articles.map(a => ({
        loc: `/blog/${a.slug}`,
        lastmod: a.updated_at,
      }))
    },
    cacheTTL: 3_600_000,  // re-generate every hour (default)
  },
}))
```

### Endpoints

| Path | Description |
|------|-------------|
| `GET /robots.txt` | Generated robots.txt with optional Sitemap reference |
| `GET /sitemap.xml` | Generated XML sitemap with caching |

### seoMiddleware — Indexing control

```ts
// Global — block all paths
app.use(seoMiddleware({ headers: { 'X-Robots-Tag': 'noindex' } }))

// Per-path via function
app.use(seoMiddleware({
  headers: {
    'X-Robots-Tag': (path) => path.startsWith('/admin') ? 'noindex' : undefined,
  },
}))
```

### seoTags — Meta / OG / Twitter Card

Generate SEO meta tags for SSR pages:

```ts
const tags = seoTags({
  title: 'My Page',
  description: 'A great page about things',
  ogImage: 'https://example.com/og.png',
  twitterCard: 'summary_large_image',
  canonical: 'https://example.com/page',
})
// → <title>My Page</title>
// → <meta property="og:title" content="My Page">
// → <meta name="twitter:card" content="summary_large_image">
// → <link rel="canonical" href="https://example.com/page">
//   ...
```

Use in `layout.tsx` or `page.tsx` with `tsx()`:

```tsx
export default function RootLayout({ children }) {
  return (
    <html>
      <head>{seoTags({ title: 'My App' })}</head>
      <body>{children}</body>
    </html>
  )
}
```

# Security

## Helmet — Security headers

```ts
import { helmet } from 'weifuwu'

// Apply all security headers with safe defaults
app.use(helmet())

// Customize individual headers (any can be set to false to remove)
app.use(helmet({
  contentSecurityPolicy: "default-src 'self'",
  xFrameOptions: 'DENY',
  strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',
}))

// Middleware-order: set after helmet to override
app.use(helmet({ xFrameOptions: false }))  // remove a header
```

13 security headers set by default:

| Header | Default |
|--------|---------|
| `Content-Security-Policy` | `default-src 'self'; ...` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Strict-Transport-Security` | `max-age=15552000; includeSubDomains` |
| `X-XSS-Protection` | `0` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `camera=(),geolocation=(),...` |
| `Cross-Origin-Embedder-Policy` | `require-corp` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Origin-Agent-Cluster` | `?1` |
| `X-DNS-Prefetch-Control` | `off` |
| `X-Download-Options` | `noopen` |
| `X-Permitted-Cross-Domain-Policies` | `none` |

Does not override response headers already set by the application — your explicit headers take precedence.

## Request ID

```ts
import { requestId } from 'weifuwu'

// Every response gets X-Request-ID
app.use(requestId())

// Custom header name
app.use(requestId({ header: 'X-Trace-Id' }))

// Custom ID generator
app.use(requestId({ generator: () => crypto.randomUUID() }))

// Access the ID in handlers via ctx.requestId
app.get('/log', (req, ctx) => {
  console.log(`Handling request ${ctx.requestId}`)
  return Response.json({ id: ctx.requestId })
})
```

Preserves incoming `X-Request-ID` for distributed tracing — if the upstream service already set it, the value is reused and propagated.

## Server-Sent Events

```ts
import { createSSEStream, formatSSE } from 'weifuwu'

async function* eventStream() {
  yield { type: 'ping', data: { time: Date.now() } }
  yield { type: 'message', data: { text: 'hello' } }
}

app.get('/events', () => createSSEStream(eventStream()))
```

| Function | Description |
|----------|-------------|
| `createSSEStream(iterable, opts?)` | Returns a `Response` with `Content-Type: text/event-stream` |
| `formatSSE(event, data)` | Formats an SSE event string (`event: ...\ndata: ...\n\n`) |
| `formatSSEData(data)` | Formats SSE data-only string (`data: ...\n\n`) |

# Health, i18n, Email & Testing

## Health check

```ts
import { serve, Router, health } from 'weifuwu'

const app = new Router()
app.use(health())                              // GET /health → 200
app.use(health({ path: '/healthz' }))          // custom path
app.use(health({
  check: async () => { await db.sql`SELECT 1` },  // fail → 503
}))
serve(app.handler(), { port: 3000 })
```

Returns a `Router` — mount with `app.use()`.

## Internationalization

```ts
import { i18n } from 'weifuwu'

app.use(i18n({ dir: './locales', defaultLocale: 'en' }))

// In any handler after i18n middleware:
app.get('/hello', (req, ctx) => {
  const msg = ctx.t('greeting', { name: 'World' })
  return Response.json({ message: msg, locale: ctx.locale })
})
```

Locale detection: `Cookie: locale=zh` → `Accept-Language: zh-CN` → `defaultLocale`.

## Email

```ts
import { mailer } from 'weifuwu'

// SMTP transport
const mail = mailer({
  transport: 'smtp://user:pass@smtp.example.com',
  from: 'noreply@example.com',
})
await mail.send({ to: 'user@example.com', subject: 'Welcome', html: '<h1>Hi!</h1>' })
await mail.close()

// Custom transport (Resend, SES, SendGrid, etc.)
const mail2 = mailer({
  send: async (msg) => { await resend.emails.send(msg) },
})
await mail2.send({ to: 'user@example.com', subject: 'Hi', text: 'Hello' })
await mail2.close()
```

## Test utilities

```ts
import { createTestServer } from 'weifuwu'

const { server, url } = await createTestServer(app.handler())
const res = await fetch(`${url}/api/users`)
assert.equal(res.status, 200)
server.stop()
```

---

## License

MIT
