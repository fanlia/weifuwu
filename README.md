---
name: weifuwu
description: Web-standard HTTP framework for Node.js — (req, ctx) => Response
---

# weifuwu

**Web-standard HTTP framework for Node.js.** `(req, ctx) => Response` — no framework-specific objects, just the Web API your browser already speaks.

- [Quick start](#quick-start)
- [serve() — HTTP server](#serve--http-server)
- [Router](#router)
- [Middleware](#middleware)
- [React SSR (tsx)](#react-ssr-tsx)
- [PostgreSQL](#postgresql)
- [Auth](#auth)
- [Security](#security)
- [WebSocket & Real-time](#websocket--real-time)
- [AI](#ai)
- [Data Layer](#data-layer)
- [iii — Worker / Function / Trigger](#iii--worker--function--trigger)
- [Multi-tenant BaaS](#multi-tenant-baas)
- [Messager](#messager)
- [LogDB](#logdb)
- [SEO](#seo)
- [Opencode](#opencode)
- [Deploy](#deploy)
- [Health check](#health-check)
- [Internationalization](#internationalization)
- [Email](#email)
- [Server-Sent Events](#server-sent-events)
- [Utility functions](#utility-functions)
- [Testing](#testing)
- [License](#license)

---

## Quick start

### Hello World

```ts
import { serve } from 'weifuwu'
serve((req, ctx) => new Response('Hello, World!'), { port: 3000 })
```

### weifuwu init

Generate a full project with React SSR, WebSocket, Tailwind CSS, and graceful shutdown:

```bash
npx weifuwu init my-app
cd my-app && npm install && npm run dev
```

Creates `app.ts` with `tsx()`, `router.ws()`, `/api/ping` API route, and `ui/pages/layout.tsx` + `page.tsx`.

---

## serve() — HTTP server

```ts
import { serve } from 'weifuwu'
import type { Server } from 'weifuwu'

const server = serve(handler, { port: 3000 })
await server.ready
console.log(`Listening on http://localhost:${server.port}`)
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | `number` | `0` (random) | Listen port |
| `hostname` | `string` | `'0.0.0.0'` | Listen address |
| `signal` | `AbortSignal` | — | Shutdown on abort |
| `websocket` | `WsUpgradeHandler` | — | WebSocket upgrade handler |
| `maxBodySize` | `number` | — | Max request body bytes |
| `shutdown` | `boolean` | `true` | Auto-register SIGTERM/SIGINT |

Graceful shutdown is **enabled by default** — `serve()` registers `SIGTERM` and `SIGINT` handlers that call `server.close()`. Set `shutdown: false` to disable.

### Server

```ts
interface Server {
  stop: () => void
  readonly port: number
  readonly hostname: string
  ready: Promise<void>
}
```

### createTestServer

```ts
const { server, url } = await createTestServer(handler)
// url = 'http://localhost:PORT'
```

---

## Router

```ts
import { Router } from 'weifuwu'

const app = new Router()
  .get('/hello/:name', (req, ctx) =>
    Response.json({ message: `Hello, ${ctx.params.name}!` }),
  )
  .post('/data', async (req, ctx) => {
    const body = await req.json()
    return Response.json(body, { status: 201 })
  })
```

### Route patterns

| Pattern | Example | Match |
|---------|---------|-------|
| Static | `/about` | Exact path |
| Param | `/users/:id` | `/users/42` → `ctx.params.id = '42'` |
| Wildcard | `/static/*` | `/static/js/app.js` |

Query params are auto-parsed into `ctx.query`.

### Sub-router mounting

```ts
const admin = new Router()
admin.use(auth({ token: 'secret' }))
admin.get('/dashboard', handler)

app.use('/admin', admin)
// Mounts admin routes at /admin/dashboard, etc.
```

### WebSocket

```ts
app.ws('/echo', {
  open(ws, ctx) { ws.send('connected') },
  message(ws, ctx, data) { ws.send(`echo: ${data}`) },
  close(ws, ctx) { /* cleanup */ },
  error(ws, ctx, err) { /* log */ },
})

serve(app.handler(), {
  port: 3000,
  websocket: app.websocketHandler(),
})
```

### Error handling

```ts
app.onError((err, req, ctx) =>
  Response.json({ error: err.message }, { status: 500 }),
)
```

---

## Middleware

All middleware follows `(req, ctx, next) => Response | Promise<Response>`.

```ts
app.use(middleware)                          // global
app.use('/admin', middleware)                // path-scoped
app.get('/admin', middleware, handler)       // route-level
```

| Middleware | Description |
|-----------|-------------|
| `auth(options)` | Bearer token / custom header / verify / proxy |
| `cors(options?)` | CORS with preflight, origin whitelist, credentials |
| `csrf(options?)` | Double-submit cookie CSRF protection |
| `logger(options?)` | Request logging with duration |
| `rateLimit(options?)` | In-memory rate limiting with headers |
| `compress(options?)` | Brotli / Gzip / Deflate compression |
| `validate(schemas)` | Zod validation (body, query, params) |
| `upload(options?)` | Multipart file upload |
| `i18n(options)` | Internationalization — `ctx.t()`, locale detection |
| `seoMiddleware(options?)` | `X-Robots-Tag` header — string or path-based function |
| `helmet(options?)` | Security headers — CSP, HSTS, X-Frame-Options, etc. |
| `requestId(options?)` | `X-Request-ID` header + `ctx.requestId` |

### auth

```ts
import { auth } from 'weifuwu'

app.use(auth({ token: 'sk-123' }))                              // static token
app.use(auth({ header: 'X-API-Key', token: 'my-key' }))         // custom header
app.use(auth({ verify: async (token) => ({ sub: 'abc' }) }))    // custom verify
app.get('/protected', auth({ proxy: 'http://auth:3000/validate' }), handler)
```

### cors

```ts
import { cors } from 'weifuwu'

app.use(cors())                                           // allow all
app.use(cors({ origin: ['https://example.com'] }))        // whitelist
app.use(cors({ origin: (o) => o.endsWith('.trusted.com') && o }))
app.use(cors({ credentials: true, maxAge: 3600 }))
```

### csrf

Double-submit cookie pattern. Sets `_csrf` cookie on GET, validates `X-CSRF-Token` header (or `_csrf` body field) on POST/PUT/DELETE/PATCH.

```ts
import { csrf } from 'weifuwu'

app.use(csrf())

// ctx.csrfToken available in handlers
app.get('/form', (req, ctx) => {
  return new Response(`<input name="_csrf" value="${ctx.csrfToken}" hidden />`, {
    headers: { 'content-type': 'text/html' },
  })
})
```

| Option | Default | Description |
|--------|---------|-------------|
| `cookie` | `'_csrf'` | Cookie name |
| `header` | `'x-csrf-token'` | Header name |
| `key` | `'_csrf'` | Body field name (fallback) |
| `excludeMethods` | `['GET', 'HEAD', 'OPTIONS']` | Skip validation |

For fetch-based forms, `useAction()` reads the `_csrf` cookie automatically.

### logger

```ts
import { logger } from 'weifuwu'

app.use(logger())                            // GET /hello 200 5ms
app.use(logger({ format: 'combined' }))      // with query params
```

### rateLimit

```ts
import { rateLimit } from 'weifuwu'

app.use(rateLimit({ max: 100, window: 60_000 }))            // 100 req/min
app.get('/api', rateLimit({ max: 10 }), handler)            // per-route
app.use(rateLimit({ key: (req) => req.headers.get('x-api-key') ?? 'anonymous' }))
```

### compress

```ts
import { compress } from 'weifuwu'

app.use(compress())                              // brotli > gzip > deflate
app.use(compress({ threshold: 2048 }))            // only > 2KB
```

### validate

```ts
import { z } from 'zod'
import { validate } from 'weifuwu'

const CreateUser = z.object({ name: z.string().min(1), email: z.string().email() })
router.post('/users', validate({ body: CreateUser }), (req, ctx) => {
  // ctx.parsed.body — typed & validated
})
```

### upload

```ts
import { upload } from 'weifuwu'

router.post('/upload', upload({ dir: './uploads', maxFileSize: 10_485_760 }), (req, ctx) => {
  // ctx.parsed.files.avatar  → { name, type, size, path }
  // ctx.parsed.fields.title  → 'hello'
})
```

### cookie

```ts
import { getCookies, setCookie, deleteCookie } from 'weifuwu'

const cookies = getCookies(req)        // { session: 'abc' }
let res = new Response('ok')
res = setCookie(res, 'session', 'token', { httpOnly: true, secure: true, maxAge: 3600 })
res = deleteCookie(res, 'session')
```

| Option | Type | Description |
|--------|------|-------------|
| `domain` | `string` | Cookie domain |
| `path` | `string` | Cookie path |
| `maxAge` | `number` | Seconds |
| `expires` | `Date` | Expiration |
| `httpOnly` | `boolean` | Not accessible to JS |
| `secure` | `boolean` | HTTPS only |
| `sameSite` | `'strict' \| 'lax' \| 'none'` | SameSite policy |

### serveStatic

```ts
import { serveStatic } from 'weifuwu'

router.get('/static/*', serveStatic('./public'))
```

20+ MIME types, ETag + 304, directory index, path traversal protection, Cache-Control.

### helmet

```ts
import { helmet } from 'weifuwu'

app.use(helmet())   // CSP, HSTS, X-Frame-Options, X-Content-Type-Options, etc.

app.use(helmet({
  contentSecurityPolicy: "default-src 'self'",
  xFrameOptions: 'DENY',
  strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',
}))
```

### requestId

```ts
import { requestId } from 'weifuwu'

app.use(requestId())
// Sets X-Request-ID header on responses, available as ctx.requestId
```

13 security headers set by default with `helmet()`: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Strict-Transport-Security`, `Content-Security-Policy`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Openner-Policy`, `Cross-Origin-Resource-Policy`, `Cross-Origin-Embedder-Policy`, `X-DNS-Prefetch-Control`, `X-Download-Options`, `X-Permitted-Cross-Domain-Policies`.

---

## React SSR (tsx)

```ts
import { serve, Router } from 'weifuwu'
import { serve, Router, tsx } from 'weifuwu'

const app = new Router()
app.use('/', await tsx({ dir: './ui/' }))
serve(app.handler(), { port: 3000, websocket: app.websocketHandler() })
```

### Directory structure

```
ui/
├── pages/
│   ├── page.tsx          → GET /           (React component)
│   ├── layout.tsx        → root layout     (HTML shell, receives req/ctx)
│   ├── not-found.tsx     → 404 page
│   ├── about/page.tsx    → GET /about
│   ├── blog/[slug]/
│   │   ├── page.tsx      → GET /blog/:slug
│   │   ├── load.ts       → data fetching   (server-only)
│   │   └── route.ts      → POST /blog/:slug (API, named exports)
│   ├── blog/layout.tsx   → /blog/* layout  (UI structure, hydrated)
│   └── api/search/
│       └── route.ts      → GET /api/search
└── components/
    └── button.tsx
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
  return { data }   // merged into page component props
}
```

### layout.tsx

**Root layout** (`pages/layout.tsx`) — receives `{ children, req, ctx }`:

> The `<div id="__weifuwu_root">` hydration target is **auto-injected** by the framework — do not add it manually. Just render `{children}` where you want page content.

```tsx
export default function RootLayout({ children, req, ctx }: {
  children: React.ReactNode
  req: Request
  ctx: Context
}) {
  return (
    <html>
      <head><title>App</title></head>
      <body><main>{children}</main></body>
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

### Public environment variables

Prefix with `WEIFUWU_PUBLIC_` for automatic inlining into the client hydration bundle:

```bash
WEIFUWU_PUBLIC_API_URL=https://api.example.com
```

```tsx
// page.tsx — works on both server and client
const apiUrl = process.env.WEIFUWU_PUBLIC_API_URL
```

The hydration bundle also injects `self.process = { env: {} }` as a safety net so any `process.env.*` reference in bundled dependencies won't throw.

### Client-side hooks

#### useWebsocket — auto-reconnecting WebSocket

```tsx
import { useWebsocket } from 'weifuwu'

function Chat() {
  const { send, lastMessage, readyState, close, reconnect } = useWebsocket('/ws/chat', {
    onMessage: (data) => console.log('received', data),
    reconnect: { maxRetries: 10, delay: 3000 },
  })

  return <div>
    <p>Status: {readyState === 1 ? 'Connected' : readyState === 0 ? 'Connecting...' : 'Disconnected'}</p>
    <button onClick={() => send('Hello')}>Send</button>
    {lastMessage && <p>Last: {lastMessage}</p>}
  </div>
}
```

`url` accepts `string`, `URL`, or `() => string | URL | null` (function form avoids reconnecting on every render). `close()` disables auto-reconnect; `reconnect()` resets retry count.

#### useAction — async form submission

```tsx
import { useAction } from 'weifuwu'

function FeedbackForm() {
  const { submit, data, error, pending, reset } = useAction('/api/feedback', { method: 'POST' })

  return <form onSubmit={() => submit({ name, email })}>
    <button disabled={pending}>{pending ? 'Saving...' : 'Submit'}</button>
    {error && <p className="text-red-500">{error.message}</p>}
    {data && <p>Saved: {data.id}</p>}
  </form>
}
```

Auto-serializes JSON, auto-reads `_csrf` cookie and sends as `X-CSRF-Token`. Returns `{ submit, data, error, pending, reset }`. `submit(body?)` returns `Promise<T>`.

### Client-side navigation

```tsx
import { Link, useNavigate } from 'weifuwu'

function Nav() {
  const navigate = useNavigate()
  return (
    <nav>
      <Link href="/about">About</Link>
      <button onClick={() => navigate('/contact')}>Contact</button>
    </nav>
  )
}
```

`navigate(href)` fetches the target via SSR, extracts `__weifuwu_root` content and `__WEIFUWU_PROPS`, replaces in-place, then imports the new hydration bundle. `load.ts` runs on the server for every navigation. Initial load is full SSR; subsequent navigations are client-side.

### Development mode

Auto-detected when `NODE_ENV !== 'production'`. File watching (`chokidar`), single-file recompilation, WebSocket live reload (`/__weifuwu/livereload`), Tailwind CSS v4 auto-compilation.

### Tailwind CSS

If `ui/app.css` exists with `@import "tailwindcss"`, it's compiled automatically. If not found, one is created. PostCSS + `@tailwindcss/postcss`, zero config.

### shadcn/ui

Works out of the box:

```bash
npx shadcn@latest init
# Style: your preference
# Base color: your preference  
# CSS file path: ui/app.css
# Import alias: @/  →  ./ui/
```

---

## PostgreSQL

```ts
import { serve, Router, postgres, pgTable, serial, text, boolean, timestamps, sql } from 'weifuwu'

const pg = postgres()          // reads DATABASE_URL
const app = new Router()
app.use(pg)                    // injects ctx.sql
```

### Type-safe DDL

```ts
const users = pgTable('_users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  active: boolean('active').default(true),
  ...timestamps(),
})

await users.create()
await users.createIndex('email')
```

### BoundTable CRUD

```ts
const users = pg.table('_users', { /* column defs */ })

const user = await users.insert({ name: 'Alice' })
const batch = await users.insertMany([{ name: 'Alice' }, { name: 'Bob' }])
const found = await users.read(1)
const { count, data } = await users.readMany({ role: 'admin' }, { orderBy: { name: 'asc' }, limit: 10 })
await users.update(1, { name: 'Bob' })
await users.delete(1)

// Upsert
await users.upsert({ email: 'alice@test.com' }, 'email')

// Count
const total = await users.count()
const admins = await users.count({ role: 'admin' })
```

### Where helpers

```ts
import { eq, gte, contains, and, or } from 'weifuwu'

const { data } = await users.readMany(
  and(eq('role', 'admin'), gte('created_at', '2026-01-01')),
  { orderBy: { name: 'asc' } },
)
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

### Transactions

```ts
const result = await pg.transaction(async (tx) => {
  const users = pg.table('_users', { ... }).withSql(tx)
  const user = await users.insert({ name: 'Alice' })
  return user
})
```

### Column types

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
| `timestamps()` | Two TIMESTAMPTZ columns | `{ created_at, updated_at }` |

---

## Auth

```ts
import { user, postgres } from 'weifuwu'

const pg = postgres()
const auth = user({ pg, jwtSecret: process.env.JWT_SECRET! })
await auth.migrate()

app.use('/auth', auth.router())

// POST /auth/register  { email, password, name }
// POST /auth/login     { email, password }

app.get('/me', auth.middleware(), (req, ctx) =>
  Response.json(ctx.user)
)
```

### OAuth2 Server

```ts
const auth = user({ pg, jwtSecret, oauth2: { server: true } })
await auth.migrate()

// Register OAuth2 client
const client = await auth.registerClient({ name: 'My App', redirectUris: ['https://app.com/cb'] })

// Authorization code + PKCE flow built-in
```

| Grant | Use Case |
|-------|----------|
| `authorization_code` (client_secret) | Server-side apps |
| `authorization_code` (PKCE) | SPA / Mobile apps |
| `client_credentials` | Machine-to-machine |

---

## WebSocket & Real-time

### Server-side

```ts
app.ws('/chat/:room', {
  open(ws, ctx) { ws.send(`joined room ${ctx.params.room}`) },
  message(ws, ctx, data) { /* handle message */ },
  close(ws, ctx) { /* cleanup */ },
  error(ws, ctx, err) { /* log */ },
})
```

### Cross-process with createHub

```ts
import { createHub, redis } from 'weifuwu'

const hub = createHub({ redis })       // omit redis for in-process only

app.ws('/chat/:room', {
  open(ws, ctx) { hub.join(`room:${ctx.params.room}`, ws) },
  message(ws, ctx, data) { hub.broadcast(`room:${ctx.params.room}`, { text: data.toString() }) },
  close(ws) { hub.leave(ws) },
})
```

---

## AI

### Streaming

```ts
import { aiStream, openai } from 'weifuwu'

const chat = await aiStream(async (req) => ({
  model: openai('gpt-4o'),
  messages: (await req.json()).messages,
}))
app.use('/chat', chat.router())
```

### AI Agents

```ts
import { agent } from 'weifuwu'

const agents = agent({ pg })
await agents.migrate()
app.use('/api', agents.router())

await agents.addKnowledge(agentId, 'Title', 'Document content...')
```

### DAG Workflow

```ts
import { runWorkflow, tool, streamText } from 'weifuwu'
import { z } from 'zod'

const tools = { queryUser: tool({ ... }) }
const wf = runWorkflow({ tools })
```

---

## Data Layer

### Redis

```ts
import { redis } from 'weifuwu'

const r = redis()                 // reads REDIS_URL
app.use(r)                        // injects ctx.redis

await ctx.redis.set('key', 'value')
```

### Queue

```ts
import { queue, redis } from 'weifuwu'

const q = queue({ redis })
await q.add('send-email', { to: 'user@test.com' }, { cron: '0 8 * * *' })
```

---

## iii — Worker / Function / Trigger

Optional module for organizing service logic as Worker + Function + Trigger, plus a pure WebSocket SDK for remote workers.

```ts
import { iii, createWorker, registerWorker } from 'weifuwu'

const engine = iii({ pg, redis })
app.use('/iii', engine.router())

const w = createWorker('orders')
w.registerFunction('orders::create', async (payload) => {
  return db.query('INSERT INTO orders ...', [payload.items])
})
engine.addWorker(w)

// Invoke
await engine.trigger({ function_id: 'orders::create', payload: { items: ['apple'] } })
```

### Built-in stream functions

| Function | Description |
|----------|-------------|
| `stream::set(stream_name, group_id, item_id, data)` | Write + persist + notify |
| `stream::get(stream_name, group_id, item_id)` | Read single item |
| `stream::delete(stream_name, group_id, item_id)` | Delete + notify |
| `stream::list(stream_name, group_id)` | List items in a group |
| `stream::list_groups(stream_name)` | List groups in a stream |
| `stream::list_all()` | List all streams |
| `stream::send(stream_name, group_id, type, data, id?)` | Push event without persisting |

### Storage backends

| Config | Persistence | Broadcast |
|--------|-------------|-----------|
| `iii({})` | In-memory | — |
| `iii({ pg })` | PG table | — |
| `iii({ redis })` | Redis Hash | Redis pub/sub |
| `iii({ pg, redis })` | PG table | Redis pub/sub |

### Trigger actions

| Action | Behavior |
|--------|----------|
| `'sync'` (default) | Wait for result |
| `'void'` | Fire-and-forget |

### REST API

| Path | Description |
|------|-------------|
| `GET /iii/workers` | List connected workers |
| `GET /iii/functions` | List registered functions |
| `GET /iii/triggers` | List registered triggers |
| `POST /iii/trigger/:fnId` | Invoke a function |
| `WS /iii/worker` | Remote worker connection |

---

## Multi-tenant BaaS

```ts
import { tenant } from 'weifuwu'

const t = tenant({ pg, usersTable: '_users' })
await t.migrate()

app.use('/api', t.middleware())     // → ctx.tenant
app.use('/api', t.router())        // → dynamic CRUD
app.use('/graphql', t.graphql())   // → dynamic GraphQL
```

### Dynamic table API

```json
POST /api/tables
{ "slug": "articles", "fields": [
  { "name": "title", "type": "string", "required": true },
  { "name": "views", "type": "integer", "default": 0 }
]}
```

Field types: `string`, `integer`, `float`, `boolean`, `text`, `datetime`, `date`, `enum`, `json`, `vector`.

### REST API

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/sys/tables` | List / create dynamic tables |
| GET/POST/PATCH/DELETE | `/:slug[/:id]` | Dynamic CRUD |
| POST/POST | `/:slug/:id/:nested` | Related rows |

---

## Messager

Real-time chat with channels, WebSocket, and agent routing.

```ts
import { messager, agent, redis } from 'weifuwu'

const msg = messager({ pg, agents, redis: redis() })
await msg.migrate()
app.ws('/ws', u.middleware(), msg.wsHandler())
```

### Channels & Messages

```http
POST /api/channels              { name, type, members }
POST /api/channels/:id/messages { content }
GET  /api/channels/:id/messages
```

### WebSocket events

```json
{ "type": "message", "channel_id": 1, "content": "Hi" }
{ "type": "typing",  "channel_id": 1, "is_typing": true }
{ "type": "read",    "channel_id": 1, "last_message_id": 42 }
```

### Programmatic send

```ts
await msg.send(channelId, 'System message', { sender_type: 'system' })
```

---

## LogDB

PostgreSQL-backed structured event logging with monthly partitioning.

```ts
import { logdb } from 'weifuwu'

const logger = logdb({ pg })
await logger.migrate()
app.use('/logs', logger.router())
```

### REST API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/` | Create log entry |
| `GET` | `/` | Query entries (supports `?level=`, `?source=`, `?after=`, `?before=`, `?meta.*=`) |
| `GET` | `/:id` | Get single entry |

### Retention

```ts
await logger.clean(12)  // Drop partitions older than 12 months
```

---

## SEO

```ts
import { seo, seoMiddleware, seoTags } from 'weifuwu'

app.use(seo({
  baseUrl: 'https://example.com',
  robots: [{ userAgent: '*', allow: '/', disallow: ['/admin'] }],
  sitemap: {
    urls: [{ loc: '/', changefreq: 'daily', priority: 1.0 }],
    async resolve() { /* dynamic URLs */ },
    cacheTTL: 3_600_000,
  },
}))

// Middleware: X-Robots-Tag header
app.use(seoMiddleware({ headers: { 'X-Robots-Tag': (path) => path.startsWith('/admin') ? 'noindex' : undefined } }))

// Tag generator for SSR
const tags = seoTags({ title: 'My Page', description: '...', ogImage: '/og.png', canonical: 'https://...' })
```

| Endpoint | Description |
|----------|-------------|
| `GET /robots.txt` | Generated robots.txt |
| `GET /sitemap.xml` | Generated XML sitemap (cached) |

---

## Opencode

AI programming assistant — chat with LLM agents that have filesystem access.

```ts
import { opencode } from 'weifuwu'

const oc = await opencode({ pg, permissions: { bash: { allow: true }, write: { allow: false } } })
await oc.migrate()
app.use('/opencode', await oc.router())
app.ws('/opencode', oc.wsHandler())
```

---

## Deploy

Self-hosted PaaS: multi-app proxy, zero-downtime updates, auto SSL.

```ts
import { deploy, defineConfig } from 'weifuwu'

const config = defineConfig({
  apps: [{ name: 'api', dir: './api', domain: 'api.example.com', port: 3001 }],
})
await deploy(config)
```

---

## Health check

```ts
import { health } from 'weifuwu'

app.use(health())  // GET /health → 200

// Custom checks
app.use(health({
  checks: { db: async () => { await pg.sql`SELECT 1`; return { ok: true } } },
}))
```

---

## Internationalization

```ts
import { i18n } from 'weifuwu'

app.use(i18n({ dir: './locales', defaultLocale: 'en' }))

// In handlers: ctx.t('greeting') → "Hello"
// In layout: ctx.locale → "en"
```

Locale detection: `Accept-Language` header → browser preference. Falls back to `defaultLocale`.

---

## Email

```ts
import { mailer } from 'weifuwu'

const mail = mailer({ host: 'smtp.example.com', port: 587, auth: { user: 'user', pass: 'pass' } })
await mail.send({ to: 'user@test.com', subject: 'Hello', text: 'Body', html: '<p>Body</p>' })
```

---

## Server-Sent Events

```ts
import { createSSEStream, formatSSE, formatSSEData } from 'weifuwu'

async function* events() {
  yield formatSSE('chat', 'Hello')
  yield formatSSE('chat', 'World')
}

app.get('/stream', (req, ctx) => createSSEStream(events()))
```

---

## Utility functions

| Function | Description |
|----------|-------------|
| `loadEnv(path?)` | Load `.env` into `process.env` |
| `serveStatic(root, options?)` | Static file serving |
| `getCookies(req)` | Parse cookies from request |
| `setCookie(res, name, value, opts?)` | Set cookie on response |
| `deleteCookie(res, name, opts?)` | Delete cookie from response |
| `createTestServer(handler)` | One-line test server → `{ server, url }` |
| `createSSEStream(iterable, opts?)` | SSE response from AsyncIterable |
| `formatSSE(event, data)` | Format SSE event string |
| `formatSSEData(data)` | Format SSE data string |
| `runWorkflow(options)` | DAG execution engine as AI SDK Tool |
| `useWebsocket(url, opts?)` | React auto-reconnecting WebSocket hook |
| `useAction(url, opts?)` | React async form submission hook |
| `navigate(href)` | Client-side page navigation |
| `useNavigate()` | React hook returning navigate function |
| `csrf(options?)` | CSRF protection middleware |
| `seoTags(config)` | Generate `<title>`, `<meta>`, OG, Twitter Card tags |
| `createHub(options?)` | WebSocket channel hub |

### AI SDK re-exports

```ts
streamText, generateText, streamObject, generateObject,
tool, embed, embedMany, smoothStream,
openai, createOpenAI
```

### pgTable helpers

```ts
pgTable(name, columns), pg.table(name, columns),
serial, uuid, text, integer, boolean, timestamptz, jsonb, textArray, vector, timestamps,
eq, ne, gt, gte, lt, lte, isNull, isNotNull, like, contains, in_, and, or, not,
PgModule
```

---

## Testing

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from 'weifuwu'

describe('hello', () => {
  it('returns 200', async () => {
    const r = new Router()
    r.get('/', () => new Response('ok'))
    const res = await r.handler()(new Request('http://localhost/'), {} as any)
    assert.equal(res.status, 200)
  })
})
```

For end-to-end tests:

```ts
import { createTestServer } from 'weifuwu'

const { server, url } = await createTestServer(handler)
const res = await fetch(`${url}/api/ping`)
```

---

## License

MIT
