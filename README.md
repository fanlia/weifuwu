---
name: weifuwu
description: Web-standard HTTP framework for Node.js — (req, ctx) => Response
---

# weifuwu

**Web-standard HTTP framework for Node.js.** `(req, ctx) => Response` — no framework-specific objects.

## Quick Start

```ts
import { serve } from 'weifuwu'
serve((req, ctx) => new Response('Hello, World!'), { port: 3000 })
```

```ts
import { serve, Router, ssr } from 'weifuwu'
const app = new Router()
app.use('/', ssr({ dir: './ui' }))
serve(app.handler(), { port: 3000, websocket: app.websocketHandler() })
```

```bash
npx weifuwu init my-app && cd my-app && npm run dev
```

## CLI

### Typical Full App

```ts
import { serve, Router, postgres, session, user, aiProvider, ssr, flash, i18n, theme, logger, rateLimit } from 'weifuwu'

const app = new Router()

// 1. Observability (order matters — run early)
app.use(logger())

// 2. UX middleware — single-line auto-registers middleware + routes
app.use(theme())
app.use(i18n({ default: 'zh', dir: './locales' }))
app.use(flash())

// 3. Database
const pg = postgres()
app.use(pg)

// 4. Session & Auth
app.use(session({ store: 'redis', redis: myRedis }))
const auth = user({ pg, jwtSecret: process.env.JWT_SECRET })
await auth.migrate()
app.use(auth)                // auto-registers middleware + /register, /login
app.use('/auth', auth)       // explicit path mounts for more control

// 5. API protection
app.use('/api', rateLimit({ max: 60, window: 60_000 }))

// 6. AI
app.use(aiProvider())  // ctx.ai

// 7. SSR
app.use('/', ssr({ dir: './ui' }))

// 8. REST API
app.get('/api/ping', () => Response.json({ ok: true }))
app.post('/api/chat', async (req, ctx) => {
  const { prompt } = await req.json()
  const result = await ctx.ai.generateText({ prompt })
  return Response.json(result)
})

// 9. Start
const server = serve(app.handler(), { port: 3000 })
```

```bash
npx weifuwu init my-app              # Full project (SSR + i18n + theme + WS demo)
npx weifuwu init my-api --minimal    # Minimal HTTP project (2 files)
npx weifuwu init my-api --skip-install # Skip npm install
npx weifuwu dev                       # Start dev server (auto-detect index.ts)
npx weifuwu generate module my-mod    # Scaffold middleware module + test
npx weifuwu version                   # Print version
```

---

## Core Concepts

### serve()

```ts
const server = serve(handler, { port: 3000 })
await server.ready
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | `number` | `0` | Listen port |
| `hostname` | `string` | `'0.0.0.0'` | Listen address |
| `signal` | `AbortSignal` | — | Shutdown on abort |
| `websocket` | `WsUpgradeHandler` | — | WebSocket upgrade handler |
| `maxBodySize` | `number` | `10MB` | Max body bytes (0 = unlimited) |
| `timeout` | `number` | `30_000` | Socket inactivity timeout (ms) |
| `keepAliveTimeout` | `number` | `5_000` | Keep-Alive idle timeout (ms) |
| `headersTimeout` | `number` | `6_000` | Headers read timeout (ms) |
| `shutdown` | `boolean` | `true` | Auto SIGTERM/SIGINT |

```ts
interface Server {
  stop: (timeoutMs?: number) => Promise<void>  // graceful: waits for in-flight, force-closes after timeoutMs (default 10s)
  readonly port: number
  readonly hostname: string
  ready: Promise<void>
}
const { server, url } = await createTestServer(handler)
```

`server.stop()` performs a graceful shutdown: stops accepting new connections,
closes idle keep-alive sockets, then waits for in-flight requests to complete.
If they don't finish within `timeoutMs` (default 10 seconds), remaining connections
are forcibly closed. SIGTERM/SIGINT use the same graceful pattern.

### Router

```ts
const app = new Router()
app.get('/hello/:name', (req, ctx) => Response.json({ message: `Hello, ${ctx.params.name}!` }))
app.post('/data', async (req, ctx) => { const body = await req.json(); return Response.json(body, { status: 201 }) })
app.use('/admin', authMW)                    // path-scoped middleware
app.use('/admin', adminRouter)               // sub-router (flattened into parent trie)
app.ws('/echo', {
  open(ws, ctx) { ctx.ws.json({ type: 'connected' }) },
  message(ws, ctx, data) { ctx.ws.json({ echo: data.toString() }) },
})
app.ws('/chat', {
  open(ws, ctx) { ctx.ws.join('room') },
  message(ws, ctx, data) { ctx.ws.sendRoom('room', JSON.parse(data.toString())) },
})
app.onError((err, req, ctx) => Response.json({ error: err.message }, { status: 500 }))

// Debug: list all registered routes
console.log(app.routes())
// [ 'GET     /hello/:name', 'POST    /data', 'WS       /echo', 'WS       /chat' ]

// Cross-process WebSocket broadcast (Redis)
import { createHub } from 'weifuwu'
app.wsHub(createHub({ redis: redis() }))

const handler = app.handler()
const wsHandler = app.websocketHandler()
serve(handler, { port: 3000, websocket: wsHandler })
```

| Pattern | Example | Match |
|---------|---------|-------|
| Static | `/about` | exact |
| Param | `/users/:id` | `/users/42` → `ctx.params.id` |
| Wildcard | `/static/*` | `/static/js/app.js` |

Query params → `ctx.query`.

### Request lifecycle

```
Request → serve() → app.handler() → global middleware × N → path middleware × N → route handler → Response
                                                                      ↑
                                                              mountPath set by sub-router
```

1. `serve()` receives HTTP request
2. `app.handler()` creates `ctx = { params, query }` and routes to the matching trie node
3. **Global middleware** runs in `use()` order (e.g. `theme()`, `i18n()`, `postgres()`, `cors()`) 
4. **Path‑scoped middleware** runs for matching paths (e.g. `app.use('/admin', authMW)`)
5. **Route‑level middleware** runs (e.g. `app.get('/admin', validate(...), handler)`)
6. **Route handler** returns `Response` — middleware chain unwinds

Sub-routers (`app.use('/admin', adminRouter)`) are **flattened** into the parent trie. The sub-router's global middleware merges with the parent's. `ctx.mountPath` is set when entering a sub-router, allowing each module to derive its own paths.

### Middleware

```ts
type Middleware = (req: Request, ctx: Context, next: Handler) => Response | Promise<Response>
app.use(mw)                          // global
app.use('/admin', mw)                // path-scoped
app.get('/admin', mw, handler)       // route-level
```

### Context

The `ctx` object accumulates properties as it passes through the middleware chain. Below are all documented properties:

| Property | Set by | Type | Description |
|----------|--------|------|-------------|
| `params` | Router | `Record<string, string>` | URL path parameters |
| `query` | Router | `Record<string, string>` | URL query parameters |
| `mountPath` | Router | `string` | Current sub-router mount prefix |
| `env` | `loadEnv()` | `Record<string, string>` | Public env vars (`WEIFUWU_PUBLIC_*`) |
| `csrf.token` | `csrf()` | `string` | CSRF token (namespace) |
| `requestId` | `requestId()` | `string` | Request ID |
| `session` | `session()` | `Session` | Session data object |
| `sql` | `postgres()` | `Sql<{}>` | PostgreSQL tagged-template client |
| `redis` | `redis()` | `Redis` | Redis client |
| `ai` | `aiProvider()` | `AIProvider` | AI model & embedding |
| `queue` | `queue()` | `Queue` | Job queue |
| `user` | `auth()` / `user().middleware()` | `{ id?: string }` | Authenticated user |
| `permissions` | `permissions()` | `{ roles, permissions }` | RBAC roles & permissions sets |
| `theme` | `theme()` | `{ value, set }` | Current theme + switcher |
| `i18n` | `i18n()` | `{ locale, t, set }` | Locale, translation, switcher |
| `flash` | `flash()` | `{ value, set }` | Flash message + setter |
| `tailwind` | `tailwindContext()` | `{ css, url }` | Compiled Tailwind CSS |
| `tenant` | `tenant()` | `TenantContext` | Current tenant info |
| `parsed` | `validate()` / `upload()` | `{ body, files }` | Validated/parsed request data |
| `layoutStack` | `ssr()` internal | `LayoutEntry[]` | React layout component stack |
| `loaderData` | User middleware | `Record<string, unknown>` | SSR data passed to client |
| `mountPath` | `Router` | `string` | Sub-router mount path |
| `deploy` | `deploy()` | `{ appName? }` | Deploy gateway info |

### Type-Safe Context

Middleware-injected properties are **automatically typed** through chained `use()` calls:

```ts
const app = new Router()
  .use(csrf())          // → Router<Context & { csrf: { token: string } }>
  .use(requestId())     // → Router<Context & { csrf: ..., requestId }>
  .use(postgres())      // → Router<Context & { csrf: ..., requestId, sql }>

app.get('/me', (_req, ctx) => {
  ctx.csrf.token  // ✅ string (IDE autocomplete)
  ctx.requestId   // ✅ string
  ctx.sql`SELECT 1` // ✅ Sql<{}>
})
```

Each module exports an `XxxInjected` type (e.g. `PostgresInjected`, `UserInjected`) for composing custom context types. `Context` is an interface — modules augment it via `declare module` for ambient compatibility.

---

## Module Patterns

All modules follow one of **4 patterns** — learn these and you know every module.

| Pattern | How to mount | Example |
|---------|-------------|---------|
| `[α]` | `app.use(mod())` | `compress()`, `theme()`, `postgres()` |
| `[β]` | `app.use('/path', mod())` | `health()`, `ssr({dir})`, `graphql(handler)`, `user()` |
| `[γ]` | Import and call directly | `mailer()`, `fts`, `cron-utils` |
| `[δ]` | `import { useXxx } from 'weifuwu/react'` | `useTheme()`, `useLocale()`, `useWebsocket()` |

### Pattern α — Middleware

```ts
app.use(compress())           // basic
const pg = postgres()         // with extras: .sql, .table, .migrate(), .close()
app.use(pg)
app.use(rateLimit({ max: 100 }))  // with .close()
```

### Pattern β — Router

```ts
app.use('/health', health())                                    // with path
app.use('/graphql', graphql(handler))
app.use('/logs', logdb({ pg }))                                 // with .log(), .migrate()
app.use('/auth', user({ pg, jwtSecret }))                       // with .middleware(), .register()
app.ws('/ws', messager({ pg }).wsHandler())
```

β modules that need **separate middleware** use `.middleware()`. Most can auto-register both middleware and routes in one call:
```ts
app.use(theme())           // auto: middleware + /__theme/:value
app.use(i18n({ dir: './locales' }))  // auto: middleware + /__lang/:locale
app.use(analytics({ pg })) // auto: middleware + /__analytics
app.use(auth)              // auto: middleware + /register, /login (user())

// Explicit form when more control is needed:
const a = analytics()
app.use(a.middleware())   // tracking only
app.use('/', a)           // dashboard at custom path
```

### Pattern γ — Standalone

Modules that don't intercept requests or serve routes. Import and use directly.

```ts
import { mailer, cronNext, fts } from 'weifuwu'

const email = mailer({ transport: 'smtp://...', from: 'noreply@example.com' })
await email.send({ to: 'user@test.com', subject: 'Hello', text: 'Body' })

const next = cronNext('0 9 * * 1-5')  // next weekday at 09:00
```

### Pattern δ — Client-side

React hooks that self-register via `addInterceptor()`. Import to enable.

```tsx
import { useTheme, useLocale, useWebsocket } from 'weifuwu/react'

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return <button onClick={() => setTheme('dark')}>Dark</button>
}
```

---

## Module Dependency Map

```mermaid
graph TD
    serve --> Router
    Router --> postgres
    Router --> redis
    Router --> aiProvider

    subgraph "DB-Dependent Modules"
        user --> postgres
        session --> postgres
        session -.-> redis
        queue --> postgres
        queue -.-> redis
        permissions --> postgres
        analytics --> postgres
        logdb --> postgres
        tenant --> postgres
        messager --> postgres
        messager -.-> redis
        agent --> postgres
        kb --> postgres
        iii --> postgres
        iii -.-> redis
    end

    subgraph "AI-Dependent Modules"
        agent --> aiProvider
        kb --> aiProvider
        aiStream --> aiProvider
        opencode --> aiProvider
        runWorkflow --> aiProvider
    end
```

## Quick Module Selection

| What do you want to do? | Module | Pattern |
|------------------------|--------|---------|
| **User registration / login** | `user()` | β |
| **Simple token/header auth** | `auth()` | α |
| **JWT verification** | `user().middleware()` | α |
| **Role-based access control** | `permissions()` | α |
| **AI chat / generate / stream** | `ctx.ai.generateText()` / `ctx.ai.streamText()` | α (via `aiProvider()`) |
| **AI agent with knowledge** | `agent()` + `knowledgeBase()` | β |
| **Send email** | `mailer()` | γ |
| **File upload** | `upload()` | α |
| **Object storage (S3/MinIO)** | `s3()` | α |
| **Rate limiting** | `rateLimit()` | α |
| **Response caching** | `cache()` | α |
| **Periodic / delayed jobs** | `queue()` | α |
| **Page view analytics** | `analytics()` | β |
| **Structured logging** | `logdb()` | β |
| **Real-time chat / messager** | `messager()` | β |
| **Full-text search** | `fts` | γ |
| **Theme switching** | `theme()` | α |
| **i18n / localization** | `i18n()` | α |
| **Flash messages** | `flash()` | α |
| **Server-Sent Events** | `createSSEStream()` | γ |
| **GraphQL endpoint** | `graphql()` | β |
| **Webhook receiver** | `webhook()` | β |
| **SSR with React** | `ssr()` | β |
| **Health check** | `health()` | β |
| **SEO (robots.txt, sitemap)** | `seo()` | β |
| **Multi-process deploy** | `deploy()` | γ |
| **Distributed functions (iii)** | `iii()` | β |
| **Multi-tenant BaaS** | `tenant()` | β |
| **Client-side routing** | `useNavigate()`, `<Link>` | δ |
| **WebSocket in React** | `useWebsocket()` | δ |
| **Compression (brotli/gzip)** | `compress()` | α |
| **Security headers (CSP, HSTS)** | `helmet()` | α |
| **CORS** | `cors()` | α |
| **CSRF protection** | `csrf()` | α |
| **Request ID tracing** | `requestId()` | α |
| **Environment variables** | `env()` / `loadEnv()` | α |
| **Static file serving** | `serveStatic()` | α |
| **Object storage (S3/MinIO)** | `s3()` | α |
| **Send email** | `mailer()` | γ |
| **Scheduled / cron tasks** | `cron-utils` (`cronNext()`) | γ |
| **Server-Sent Events** | `createSSEStream()` | γ |
| **Multi-process deploy** | `deploy()` | γ |
| **Distributed functions (iii)** | `iii()` | β |
| **Webhook receiver** | `webhook()` | β |
| **Social login (OAuth)** | `user({ oauthLogin })` | β |
| **Database migrations** | `pg.migrate()` | — |

---

## Request Tracing & Logging

Every request gets a **trace ID** via `AsyncLocalStorage`, injected into responses as `X-Trace-Id`. W3C `traceparent` headers are forwarded.

```ts
import { currentTraceId } from 'weifuwu'

app.get('/api', (req, ctx) => {
  console.log('Handling request', currentTraceId()) // f240a3f3-60e2-...
})
```

**Structured logging** — `logger({ format: 'json' })` outputs JSON to stderr with `traceId`, `timestamp`, `elapsed_ms`:

```json
{"level":"info","message":"request","method":"GET","path":"/api/users","status":200,"elapsed_ms":42,"traceId":"f240a3f3-...","timestamp":"2025-01-15T10:30:00.000Z"}
```

Default format is `'short'` (human-readable). `'combined'` includes query strings.

---

## AI Observability

Agent runs are **automatically logged** to `_agent_runs`. Dashboard endpoints provide analytics:

```
GET /agents/:id/runs?days=7       → [{ input, output, tokens_in, tokens_out, elapsed_ms, status, trace_id, ... }]
GET /agents/:id/runs/summary?days=7 → { total, success, error, success_rate, tokens_in, tokens_out, avg_elapsed_ms, p95_elapsed_ms }
GET /opencode/sessions/:id/usage    → { message_count, tokens_in, tokens_out, tokens_total }
```

Non-streaming runs log full token data; streaming runs log `status: 'stream'`.

---

## Agent ↔ Messager Streaming

Agent replies in messager channels now stream **token-by-token** via WebSocket:

```ts
// Backend — automatic when agents are attached to messager
const msg = messager({ pg, agents: agent({ pg, model }) })
app.ws('/ws', msg.wsHandler())
// Agent replies stream to: hub.broadcast({ type: 'agent_stream', data: { token, full } })
```

```tsx
// Frontend — React hook
import { useAgentStream } from 'weifuwu/react'

const { getAgentText, isAgentStreaming, stream } = useAgentStream({
  wsPath: '/ws',
  channelId: 1,
})
```

Multi-round conversation context: the last 10 channel messages are automatically injected into agent calls.

---

## Test Utilities

Chainable test helper for HTTP-level testing without starting a server:

```ts
import { testApp } from 'weifuwu'

const app = testApp()
app.use(postgres({ connection: TEST_DB }))
app.get('/users/:id', (req, ctx) => Response.json({ id: ctx.params.id, user: ctx.user }))

const res = await app
  .getReq('/users/42?name=Alice')
  .withUser({ id: 1 })
  .header('X-Custom', 'val')
  .body({ data: 'test' })
  .send()

assert.equal(res.status, 200)
assert.deepEqual(await res.json(), { id: '42', user: { id: 1 } })
```

| Method | Description |
|--------|-------------|
| `app.getReq(path)` `postReq` `putReq` `patchReq` `deleteReq` | Start building a request |
| `.withUser(u)` `.withTenant(t)` `.with(ctx)` | Simulate middleware injection |
| `.header(k,v)` `.body(data)` `.rawBody(str)` | Set request properties |
| `.send()` → `TestResponse` | Execute and get `{ status, headers, json(), text() }` |

### Database test isolation

```ts
import { createTestDb, withTestDb } from 'weifuwu'

// Isolated schema — each test gets its own schema, destroyed after
const db = await createTestDb()
await db.sql`CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT)`
await db.sql`INSERT INTO users (name) VALUES ('Alice')`
await db.destroy()  // DROP SCHEMA ... CASCADE

// Transaction rollback — all changes are rolled back after callback
await withTestDb(async (sql) => {
  await sql`INSERT INTO users ...`
  // Automatically rolled back
})
```

| Function | Description |
|----------|-------------|
| `createTestDb(opts?)` | Create isolated schema, returns `{ sql, url, schema, destroy }` |
| `withTestDb(url?, fn)` | Run callback in a transaction, auto-rollback |

Uses `TEST_DATABASE_URL` or `DATABASE_URL`. Automatically skipped in CI if unset.

---

## Module Reference

Modules are organized alphabetically. Each module shows its pattern badge (`[α]` Middleware, `[β]` Router, `[γ]` Standalone, `[δ]` Client-side) and category.

**Category key:** AI, API, Clientδ, Database, DevTools, Networking, Security, SSR, UX

---

### agent [β] [AI]

```ts
const provider = aiProvider()
const a = agent({ pg, provider })
await a.migrate()
app.use('/api', a)
await a.addKnowledge(agentId, 'Title', 'some knowledge content')
a.run(agentId, { input: 'summarize the data', stream: true })
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pg` | `object` | — | PostgreSQL client |
| `provider` | `AIProvider` | `aiProvider()` (from env) | AI provider for model & embedding resolution |
| `model` | `object` | — | Explicit AI model (overrides provider) |
| `embeddingModel` | `object` | — | Explicit embedding model (overrides provider) |
| `embeddingDimension` | `number` | `provider.dimension` | Embedding vector dimension |
| `tools` | `object[]` | — | Custom tool definitions |

| Method | Description |
|--------|-------------|
| `.run(agentId, { input, stream?, messages? })` | Execute agent with input |
| `.addKnowledge(agentId, title, content)` | Add knowledge document |
| `.migrate()` | DB setup |
| `.close()` | Cleanup |

### aiStream [β] [AI]

Creates an AI streaming chat endpoint using the Vercel AI SDK.

```ts
const provider = aiProvider()
const chat = await aiStream(async (req) => ({ messages: (await req.json()).messages }), provider)
app.use('/chat', chat)
```

| Param | Type | Description |
|-------|------|-------------|
| `handler` | `(req, ctx) => AIStreamOptions \| Promise<AIStreamOptions>` | Returns AI SDK options (model, messages, schema, etc.) |
| `provider` | `AIProvider` | Optional. If provided and handler omits `model`, `provider.model()` is used as default |

### analytics [β] [API]

In-memory or PostgreSQL page view tracking with built-in dashboard.

```ts
const a = analytics()
app.use(a.middleware())
app.use('/', a)       // GET /__analytics (dashboard), GET /__analytics/data?days=7 (JSON)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pg` | `object` | — | PostgreSQL client for persistence |
| `excluded` | `string[]` | `['/__analytics', '/__wfw', '/static']` | Paths to skip |

```ts
// With PostgreSQL
const a = analytics({ pg })
await a.migrate()
app.use(a.middleware())
app.use('/', a)            // dashboard routes
```

### auth [α] [Security]

```ts
app.use(auth({ token: 'sk-123' }))                              // static token
app.use(auth({ header: 'X-API-Key', token: 'my-key' }))         // custom header
app.use(auth({ verify: async (token, req) => ({ sub: 'abc' }) })) // custom verify → sets ctx.user
app.get('/protected', auth({ proxy: 'http://auth:3000/validate' }), handler)

// Session-based auth (must be placed after session() middleware)
app.use(session())
app.use(auth({
  session: true,
  resolveUser: async (userId) => {          // load user from DB
    const [user] = await sql`SELECT * FROM users WHERE id = ${userId}`
    return user ?? null                      // null → destroy stale session
  },
}))
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `token` | `string` | — | Static token to match |
| `header` | `string` | `'Authorization'` | Header name |
| `verify` | `(token, req) => object\|null` | — | Verify function, return value sets `ctx.user` |
| `proxy` | `string` | — | Auth service URL to proxy requests to |
| `session` | `boolean` | `false` | Enable session-based auth. Checks `ctx.session.userId` first |
| `resolveUser` | `(userId) => object\|null` | — | Load user from userId (called when `session: true`). Return falsy to reject + auto-destroy stale session |

When `session: true`, auth checks `ctx.session.userId` before the
Authorization header. This lets logged-in users authenticate via their
session cookie without sending a token. Falls back to header/token auth
if no session userId is present.

### compress [α] [DevTools]

```ts
app.use(compress())                         // brotli > gzip > deflate (min 1KB)
app.use(compress({ threshold: 2048, level: 4 }))      // custom threshold and level
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `threshold` | `number` | `1024` | Minimum byte size to compress |
| `level` | `number` | `6` | Compression level (zlib) |

### cors [α] [DevTools]

```ts
app.use(cors())                                            // allow all
app.use(cors({ origin: ['https://example.com'] }))         // whitelist
app.use(cors({ origin: (o) => o.endsWith('.trusted.com') && o }))
app.use(cors({ credentials: true, maxAge: 3600 }))
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `origin` | `string\|string[]\|function` | `'*'` | Allowed origins |
| `methods` | `string[]` | `['GET','POST','PUT','DELETE','PATCH','HEAD','OPTIONS']` | Allowed methods |
| `allowedHeaders` | `string[]` | — | Custom allowed headers |
| `exposedHeaders` | `string[]` | — | Response headers exposed to client |
| `credentials` | `boolean` | `false` | Allow cookies/credentials |
| `maxAge` | `number` | — | Preflight cache duration (seconds) |

### flash [α] [UX]

Cookie-based flash message. Read from request, write via redirect.

```ts
app.use(flash())

app.get('/', (req, ctx) => {
  const msg = ctx.flash.value  // { type: 'success', text: 'Saved!' } or undefined
})

app.post('/save', (req, ctx) => {
  return ctx.flash.set({ type: 'success', text: 'Saved!' }, '/articles')
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `'flash'` | Cookie name |

### cache [α] [DevTools]

Response caching middleware with memory and Redis stores. Caches GET/HEAD responses, with tag-based invalidation.

```ts
app.use(cache())                                                     // in-memory, 5min TTL
app.use(cache({ ttl: 60_000, store: 'redis', redis: ctx.redis }))    // Redis store
app.use(cache({
  ttl: 30_000,
  tag: (req, ctx) => ctx.user ? `user:${ctx.user.id}` : undefined,   // per-user invalidation
}))

// Programmatic invalidation
const c = cache({ store: 'redis', redis: ctx.redis })
app.use(c)
await c.invalidate('users')     // invalidate all entries tagged with 'users'
await c.flush()                 // clear entire cache
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttl` | `number` | `300000` (5min) | Cache TTL in ms |
| `store` | `'memory' \| 'redis' \| CacheStore` | `'memory'` | Cache store backend |
| `redis` | `Redis` | — | Redis client (required when `store: 'redis'`) |
| `key` | `(req) => string` | SHA256(method+URL) | Custom cache key |
| `tag` | `(req, ctx) => string \| string[]` | — | Tag for grouped invalidation |
| `cacheCookies` | `boolean` | `false` | Cache responses with Set-Cookie |
| `cacheStatus` | `number[]` | `[200]` | Status codes to cache |
| `maxBodySize` | `number` | `1048576` (1MB) | Max body bytes to cache |

Cached responses include `X-Cache: HIT` and `Age` headers. Requests with `Authorization` or `Cookie` headers are never cached. Binary content types (image, audio, video) are skipped.

```ts
import { MemoryCache, RedisCache } from 'weifuwu'

const mem = new MemoryCache()
await mem.set('key', { status: 200, statusText: 'OK', headers: {}, body: '...', createdAt: Date.now(), tags: [] }, 300_000)
mem.close()
```

### csrf [α] [Security]

```ts
app.use(csrf())
// ctx.csrf.token — set on GET/HEAD/OPTIONS
// Auto-validates x-csrf-token or x-xsrf-token header on POST/PUT/DELETE/PATCH
// Falls back to body field matching the key name
```

| Option | Default | Description |
|--------|---------|-------------|
| `cookie` | `'_csrf'` | Cookie name |
| `header` | `'x-csrf-token'` | Header name (also accepts `x-xsrf-token`) |
| `key` | `'_csrf'` | Body field fallback |
| `excludeMethods` | `['GET','HEAD','OPTIONS']` | Skip validation |

### deploy [β] [Networking]

Multi-process manager with reverse proxy, health checks, auto-restart, and zero-downtime updates. Works identically locally and in production.

```ts
import { deploy, defineConfig } from 'weifuwu'

// Local
await deploy(defineConfig({
  apps: { blog: {}, api: {} },
}))

// Production
await deploy(defineConfig({
  domain: 'example.com',
  deployToken: process.env.DEPLOY_TOKEN,
  apps: { blog: {}, api: {} },
}))
```

**Auto-derived defaults** — each app key derives `dir`, `port`, `entry`, and `path`:

| Field | Default | Rule |
|-------|---------|------|
| `dir` | App key | `blog` → `'./blog'` |
| `entry` | `'index.ts'` | Default entry file |
| `port` | `3001+` | Auto-incremented from 3001 |
| `path` | `'/key'` | Only for localhost domain |

Override any field explicitly:

```ts
defineConfig({
  apps: {
    blog: { dir: '../packages/blog', entry: 'server.ts', port: 8080, path: '/blog' },
  },
})
```

**Routing** — match priority: explicit path > app key > defaultApp.

```ts
apps: {
  api: { path: '/api' },     // example.com/api  or  localhost:3000/api
  blog: {},                   // blog.example.com or  localhost:3000/blog
}
```

**Blue-green** — zero-downtime via `ports`:

```ts
apps: { blog: { ports: [3001, 3002] } }
```

**WebSocket** — automatically bridged through the gateway.

**Process watchdog** — auto-restarts with exponential backoff on unexpected exit.

**Management API** — all endpoints require `Authorization: Bearer <deployToken>`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/_deploy/apps` | GET | List apps |
| `/_deploy/apps/:name` | GET | App details |
| `/_deploy/apps/:name/deploy` | POST | Restart |
| `/_deploy/apps/:name/restart` | POST | Restart |
| `/_deploy/apps/:name/stop` | POST | Stop |
| `/_deploy/apps/:name/start` | POST | Start |
| `/_deploy/apps/:name/logs` | GET | SSE log stream |

```bash
curl -H "Authorization: Bearer my-token" http://localhost:3000/_deploy/apps
```

**Running** — use systemd for production:

```ini
[Service]
WorkingDirectory=/opt/deploy
ExecStart=/usr/bin/node /opt/deploy/deploy.ts
Restart=always
```

**DeployConfig:**

| Option | Default | Description |
|--------|---------|-------------|
| `domain` | `'localhost'` | Root domain |
| `port` | `3000` | Gateway port |
| `deployToken` | — | Bearer token for management API |
| `defaultApp` | — | Fallback route |
| `apps` | — | `Record<string, AppConfig>` |

**AppConfig:**

| Field | Default | Description |
|-------|---------|-------------|
| `dir` | App key | Directory containing the app |
| `port` | Auto (3001+) | Internal port |
| `entry` | `'index.ts'` | Entry file |
| `path` | `'/key'` (local) | URL path prefix |
| `env` | — | Environment variables |
| `healthEndpoint` | `/` | Health check path |
| `buildCommand` | — | Build command |
| `ports` | — | `[port, port+1]` for blue-green |

### env [α] [DevTools]

Environment variable middleware. Injects `ctx.env` with all `WEIFUWU_PUBLIC_*` variables (prefix stripped).
Safe to expose to the client.

```ts
import { env, loadEnv } from 'weifuwu'
loadEnv()                                // Load .env into process.env
app.use(env())                           // → ctx.env

app.get('/config', (req, ctx) => {
  return Response.json({ apiUrl: ctx.env.API_URL })
})
```

Helper utilities:

```ts
import { isDev, isProd, isBundled, getPublicEnv } from 'weifuwu'

isDev()      // NODE_ENV === 'development'
isProd()     // NODE_ENV === 'production'
isBundled()  // Running from compiled dist/index.js?
getPublicEnv()  // { API_URL: '...' } — no middleware needed
```

| Function | Description |
|----------|-------------|
| `loadEnv(path?)` | Load `.env` file into `process.env` (does not override existing) |
| `env()` | Middleware — injects `ctx.env` with public vars |
| `getPublicEnv()` | Returns `WEIFUWU_PUBLIC_*` vars with prefix stripped |
| `isDev()` | `true` when `NODE_ENV === 'development'` |
| `isProd()` | `true` when `NODE_ENV === 'production'` |
| `isBundled()` | `true` when running from compiled bundle |

### graphql [β] [API]

```ts
const handler: GraphQLHandler = () => ({
  schema: `type Query { hello: String }`,
  resolvers: { Query: { hello: () => 'world' } },
  graphiql: true,         // GET / returns GraphiQL IDE
  maxDepth: 10,            // max query nesting (default 10, 0 = disable)
  timeout: 30_000,         // execution timeout in ms
})
app.use('/graphql', graphql(handler))
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `schema` | `string \| GraphQLSchema` | — | SDL string or pre-built schema |
| `resolvers` | `object` | — | Resolver map |
| `rootValue` | `any` | — | Root value for queries |
| `context` | `(req, ctx) => object` | — | Per-request context factory |
| `graphiql` | `boolean` | `false` | Serve GraphiQL IDE at GET / |
| `maxDepth` | `number` | `10` | Max query nesting depth |
| `timeout` | `number` | `30_000` | Execution timeout (ms) |

### health [β] [API]

```ts
app.use('/health', health())
// Returns 200 on success, 503 when check throws
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `path` | `string` | `'/health'` | Health check endpoint |
| `check` | `() => Promise<void>` | — | Async function; throws → 503 |

### helmet [α] [Security]

15 security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, etc.

```ts
app.use(helmet())
app.use(helmet({ contentSecurityPolicy: "default-src 'self'", xFrameOptions: 'DENY' }))
```

| Option | Default | Description |
|--------|---------|-------------|
| `contentSecurityPolicy` | `"default-src 'self'"` | CSP policy |
| `xFrameOptions` | `'SAMEORIGIN'` | Frame-embedding policy |
| `strictTransportSecurity` | `'max-age=15552000; includeSubDomains'` | HSTS |
| `referrerPolicy` | `'no-referrer'` | Referrer header |
| `xContentTypeOptions` | `'nosniff'` | MIME sniffing protection |
| `permissionsPolicy` | — | Feature permissions policy |
| `crossOriginEmbedderPolicy` | — | COEP header |
| `crossOriginOpenerPolicy` | — | COOP header |
| `crossOriginResourcePolicy` | — | CORP header |

### iii [β] — Worker / Function / Trigger [API]

Distributed function execution with WebSocket workers, triggers, and Redis streams.

```ts
import { createWorker } from 'weifuwu'
const engine = iii({ pg, redis })
app.use('/iii', engine)
app.ws('/iii', engine.wsHandler())

const w = createWorker('orders')
w.registerFunction('orders::create', async (payload) => db.query('INSERT INTO orders ...', [payload.items]))
engine.addWorker(w)
await engine.trigger({ function_id: 'orders::create', payload: { items: ['apple'] } })
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pg` | `object` | — | PostgreSQL client for persistent triggers |
| `redis` | `object` | — | Redis client for streams |
| `streamTTL` | `number` | `3600` | Redis stream key TTL (seconds, 0 = no expiry) |

| Method | Description |
|--------|-------------|
| `.addWorker(w)` | Register a worker |
| `.removeWorker(w)` | Remove a worker |
| `.trigger({ function_id, payload, action?, timeout_ms? })` | Invoke a function |
| `.listWorkers()` | List registered workers |
| `.listFunctions()` | List registered functions |
| `.listTriggers()` | List registered triggers |
| `.wsHandler()` | WebSocket handler |
| `.migrate()` | DB setup |
| `.shutdown()` | Clean shutdown |



### knowledgeBase [β] — RAG with pgvector [AI]

```ts
import { knowledgeBase, aiProvider } from 'weifuwu'

const kb = knowledgeBase({
  pg: postgres(),
  provider: aiProvider(),
  table: 'my_docs',
})

// Create table + HNSW index (safe to call multiple times)
await kb.migrate()

// Ingest a document (auto chunk → embed → store)
await kb.ingest('docs/intro.md', `# Welcome\n\nThis is the introduction...`, {
  title: 'Introduction',
  metadata: { source: 'docs', author: 'alice' },
})

// Semantic search
const results = await kb.search('how to get started?', { limit: 5 })
// → [{ key, title, content, score: 0.92, metadata }, ...]

// Delete
await kb.delete('docs/outdated.md')

// List all documents
const entries = await kb.list()
// → [{ key, title, chunks: 3 }, ...]

// Use as middleware (injects ctx.kb.search)
app.use(kb.middleware())
app.get('/search', async (req, ctx) => {
  const results = await ctx.kb.search(ctx.query.q)
  return Response.json(results)
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pg` | `PostgresClient` | — | **Required.** PostgreSQL client |
| `provider` | `AIProvider` | — | **Required.** AI provider for embedding |
| `table` | `string` | `'_kb_docs'` | Database table name |
| `chunkSize` | `number` | `512` | Max characters per chunk |
| `chunkOverlap` | `number` | `64` | Overlap between chunks |
| `searchLimit` | `number` | `5` | Default search result count |
| `searchThreshold` | `number` | `0` | Minimum similarity (0–1) |

Documents are split on paragraph boundaries (`\n\n`). Re-ingesting the same key
replaces old chunks. Provider's `embed()` is used automatically.
The HNSW index enables fast approximate nearest-neighbor search (cosine distance).


### logdb [β] [API]

PostgreSQL structured event logging with monthly partitioning.

```ts
const logger = logdb({ pg })
await logger.migrate()
app.use('/logs', logger)
await logger.clean(12)   // drop partitions older than 12 months
await logger.log({ level: 'info', source: 'app', message: 'hello', metadata: { userId: 1 } })
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pg` | `object` | — | PostgreSQL client |
| `table` | `string` | `'_log_entries'` | Table name |

| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Create log entry |
| GET | `/` | Query (`?level=`, `?source=`, `?after=`, `?before=`, `?meta.*=`) |
| GET | `/:id` | Get single entry |

### logger [α] [DevTools]

```ts
app.use(logger())                             // GET /hello 200 5ms
app.use(logger({ format: 'combined' }))       // with query params
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `format` | `'short' \| 'combined' \| 'json'` | `'short'` | Log format: path only, path + query params, or JSON to stderr |

### mailer [γ] [Networking]

```ts
const mail = mailer({ from: 'noreply@example.com', transport: 'smtp://user:pass@smtp.example.com:587' })
await mail.send({ to: 'user@test.com', subject: 'Hello', text: 'Body', html: '<p>Body</p>', cc: 'admin@test.com' })
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `transport` | `string\|object` | — | Nodemailer transport config or connection string |
| `from` | `string` | — | Default sender address |
| `send` | `function` | — | Custom send function (alternative to transport) |



### oauthLogin (via user()) — Social login (OAuth 2.0 client) [Security]

Social login is built into the [`user()`](#user-β) module via the `oauthLogin` option — no separate import needed.

```ts
app.use(session())                       // required — stores OAuth state
const u = user({
  pg,
  jwtSecret: process.env.JWT_SECRET!,
  oauthLogin: {
    redirectUrl: '/dashboard',
    providers: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      },
      github: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      },
    },
  },
})
await u.migrate()
app.use(u)   // POST /register, POST /login, GET /auth/:provider, GET /auth/:provider/callback
```

**Flow:** User clicks "Login with Google" → redirected to Google → back to app → user created/linked in database → JWT signed → session created → redirected to `redirectUrl` with `?token=` (or JSON response for API clients).

Supports custom providers via `authUrl`, `tokenUrl`, `userUrl`, and `parseUser`:

```ts
const u = user({
  pg,
  jwtSecret: process.env.JWT_SECRET!,
  oauthLogin: {
    providers: {
      discord: {
        clientId: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        authUrl: 'https://discord.com/api/oauth2/authorize',
        tokenUrl: 'https://discord.com/api/oauth2/token',
        userUrl: 'https://discord.com/api/users/@me',
        parseUser: (data) => ({
          id: data.id,
          email: data.email ?? '',
          name: data.global_name ?? data.username,
          avatarUrl: data.avatar
            ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png`
            : '',
        }),
      },
    },
  },
})
```

| Option (oauthLogin) | Type | Default | Description |
|--------|------|---------|-------------|
| `providers` | `Record<string, OAuthProviderConfig>` | — | **Required.** Provider configs (Google/GitHub built-in, any custom) |
| `redirectUrl` | `string` | `'/'` | Post-login redirect destination |

Built-in providers (Google, GitHub) have preset URLs — you only need to provide `clientId` and `clientSecret`. The module auto-creates a `_auth_providers` table on first request.


### messager [β] [Networking]

Real-time chat with channels, WebSocket, agent routing.

```ts
const msg = messager({ pg, agents, redis: redis() })
await msg.migrate()
app.use('/api', msg)
app.ws('/ws', msg.wsHandler())
await msg.send(channelId, 'System message', { sender_type: 'system', sender_id: 'bot' })
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pg` | `object` | — | PostgreSQL client |
| `agents` | `AgentModule` | — | Agent module for routing |
| `webhookTimeout` | `number` | — | Webhook timeout |
| `redis` | `object` | — | Redis client |

| Method | Description |
|--------|-------------|
| `.wsHandler()` | WebSocket handler (channels, typing, read receipts) |
| `.send(channel, content, opts?)` | Send message to channel |
| `.close()` | Cleanup |



### opencode [β] [AI]

AI programming assistant.

```ts
const oc = await opencode({
  pg,
  model: openai('gpt-4o'),
  workspace: '/home/user/project',
  permissions: { bash: { allow: true }, write: { allow: false } },
})
await oc.migrate()
app.use('/opencode', oc)
app.ws('/opencode', oc.wsHandler())
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pg` | `object` | — | PostgreSQL client |
| `model` | `string` | — | AI model name (e.g. `'gpt-4o'`, `'deepseek-v4-flash'`) |
| `baseURL` | `string` | — | OpenAI-compatible API base URL |
| `apiKey` | `string` | — | API key for the model |
| `workspace` | `string` | — | Project directory |
| `systemPrompt` | `string` | — | Custom system prompt |
| `skills` | `object[]` | — | Custom skill definitions |
| `permissions` | `object` | — | Tool permission rules |

### postgres [α] [Database]

Type-safe PostgreSQL client with schema builder, CRUD, migrations, soft delete, and JSONB/vector support.

```ts
const pg = postgres()          // reads DATABASE_URL
app.use(pg)                    // injects ctx.sql
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `connection` | `string` | `DATABASE_URL` env | PostgreSQL connection string |
| `max` | `number` | `10` | Max pool connections |
| `ssl` | `boolean\|object` | — | SSL options |
| `idle_timeout` | `number` | `30` | Idle timeout (seconds) |
| `connect_timeout` | `number` | `30` | Connection timeout |
| `statementTimeout` | `number` | `30_000` | Per-statement timeout (ms, 0 = disable) |
| `onQuery` | `(query, ms, rows) => void` | — | Query logging callback |

```ts
// Raw SQL via tagged template
await pg.sql`SELECT * FROM users WHERE email = ${email}`

// Define a table — one API, sql pre-bound
import { serial, text, boolean, timestamps } from 'weifuwu'

const users = pg.table('_users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  active: boolean('active').default(true),
  ...timestamps(),
})
await users.create()           // DDL — no need to pass sql
await users.createIndex('email')

// CRUD — sql already bound
await users.insert({ name: 'Alice' })
const { count, data } = await users.readMany({ role: 'admin' }, { orderBy: { name: 'asc' }, limit: 10 })
await users.upsert({ email: 'alice@test.com' }, 'email')

// Reuse schema without redefining fields
import { pgTable } from 'weifuwu'
const usersSchema = pgTable('_users', { id: serial('id'), name: text('name') })  // define once
const users = pg.table(usersSchema)  // bind — no field duplication

// Transactions — with auto-retry on deadlock/serialization failure
await pg.transaction(async (sql) => {
  const txUsers = users.withSql(sql)
  return txUsers.insert({ name: 'Bob' })
}, { maxRetries: 3 })

// Soft delete — automatic if deleted_at column exists
await users.delete(1)       // SET deleted_at = NOW()
await users.hardDelete(1)   // DELETE FROM
await users.read(1)         // auto-filters deleted_at IS NULL (use withDeleted: true to include)

// JSONB queries
const logs = pg.table('logs', { meta: jsonb<{ service: string }>('meta') })
await logs.readMany(contains('meta', { service: 'auth' }))

// Connection pool visibility
console.log(pg.poolStats())  // { active: 3, idle: 7, waiting: 0, max: 10 }

// Migration tracking
await pg.migrate()           // creates _weifuwu_migrations
await pg.markMigrated('myModule')  // idempotent
const done = await pg.isMigrated('myModule')

// Partitioned tables
await logs.create({ partitionBy: partitionBy('range', 'created_at') })
```

**When to use pgTable vs pg.table:**
| API | Use when |
|-----|---------|
| `pg.table('t', cols)` | You have `pg` available (factory, handler, migrate) |
| `pg.table(schema)` | Reusing a schema without duplicating field definitions |
| `pgTable('t', cols)` | No `pg` reference (utility modules, standalone schema files) |

| Column builder | Type | Notes |
|---------------|------|-------|
| `serial(name)` | `number` | Auto-increment |
| `uuid(name)` | `string` | — |
| `text(name)` | `string` | — |
| `integer(name)` | `number` | — |
| `boolean(name)` / `boolean_(name)` | `boolean` | `_` suffix for JS reserved word |
| `timestamptz(name)` | `string` | — |
| `jsonb<T>(name)` | `T` | Generic for typed JSONB access |
| `textArray(name)` | `string[]` | TEXT[] |
| `vector(name, dims)` | `number[]` | pgvector support |

**Column modifiers:** `.primaryKey()`, `.notNull()`, `.nullable()`, `.default(val)`, `.unique()`, `.references(table, column?, onDelete?)`.

**CRUD methods:**

| Method | Description |
|--------|-------------|
| `insert(data)` | INSERT + RETURNING \*, returns the inserted row |
| `insertMany(data)` | Bulk INSERT + RETURNING \*, returns rows |
| `read(id, opts?)` | SELECT by detected primary key + auto soft-delete filter |
| `readMany(where?, opts?)` | Filtered query with `{ count, data }` — auto-filters soft-deleted |
| `update(id, data)` | UPDATE by primary key + RETURNING \*, returns updated row |
| `updateMany(where, data)` | Bulk UPDATE, returns affected row count |
| `delete(id)` | Soft delete if `deleted_at` exists, else hard delete |
| `hardDelete(id)` | Always DELETE FROM |
| `deleteMany(where)` | Soft bulk delete if `deleted_at` exists |
| `hardDeleteMany(where)` | Always DELETE FROM |
| `upsert(data, conflict)` | INSERT ON CONFLICT DO UPDATE, returns row |
| `count(where?)` | SELECT COUNT(\*) — auto-filters soft-deleted |
| `create(opts?)` | CREATE TABLE IF NOT EXISTS |
| `drop(opts?)` | DROP TABLE IF EXISTS |
| `createIndex(columns, opts?)` | CREATE INDEX |
| `createUniqueIndex(columns)` | CREATE UNIQUE INDEX |
| `withSql(sql)` | Returns copy bound to a different sql (for transactions) |

**Where helpers** — composable query conditions:

| Helper | SQL |
|--------|-----|
| `eq(col, val)` | `"col" = val` |
| `ne(col, val)` | `"col" != val` |
| `gt` / `gte` / `lt` / `lte` | Comparison operators |
| `isNull(col)` / `isNotNull(col)` | `IS NULL` / `IS NOT NULL` |
| `like(col, pattern)` | `LIKE` |
| `contains(col, val)` | `@>` JSONB containment |
| `in_(col, vals)` | `= ANY(...)` |
| `and(...)` / `or(...)` / `not(...)` | Boolean composition |

**PgModule** — base class for modules that need DB access:

```ts
class MyModule extends PgModule {
  async migrate() { /* run DDL */ }
  async getUsers() { return this.table('users', {}).readMany() }
}
```

Where helpers + `and`/`or`/`not` can be imported from `'weifuwu'` alongside `postgres`. Full column builders and table helpers are in the same barrel.

### cron-utils [γ] [DevTools]

Shared cron expression parsing utilities. All functions operate in **local timezone**.

```ts
import { cronNext } from 'weifuwu'

// Next weekday at 09:00
const next = cronNext('0 9 * * 1-5')
console.log(new Date(next))
```

| Function | Description |
|----------|-------------|
| `parsePattern(pattern)` | Parse 5-field cron pattern into `Set<number>[]` |
| `matches(fields, date)` | Check if a date matches a parsed pattern |
| `cronNext(expr, from?)` | Calculate next matching timestamp (`from` defaults to now) |

### fts — Full-Text Search (PostgreSQL) [Database]

Utilities for PostgreSQL full-text search: create GIN indexes, search with ranking, and generate highlighted snippets.

```ts
import { fts } from 'weifuwu'

const articles = pg.table('articles', {
  id: serial('id').primaryKey(),
  title: text('title'),
  body: text('body'),
})

// Create search index
await fts.createIndex(pg.sql, articles, ['title', 'body'], { language: 'english' })

// Search with ranking
const results = await fts.search(pg.sql, articles, 'node.js framework', {
  fields: ['title', 'body'],
  limit: 20,
  headline: true, // highlighted snippets via ts_headline
})
// → [{ id, rank: 0.8, row: { title, body, ... }, headline: '...<b>Node.js</b> framework...' }]

// Drop index
await fts.dropIndex(pg.sql, articles)
```

| Function | Description |
|----------|-------------|
| `createIndex(sql, table, fields, opts?)` | Create GIN/GiST tsvector index |
| `search(sql, table, query, opts?)` | Search with ts_rank ordering |
| `dropIndex(sql, table, opts?)` | Drop the index |

Search options: `fields`, `limit` (20), `offset` (0), `headline` (false), `language` ('english'), `minRank`.

### theme [α] [UX]

```ts
// Single line — auto-registers middleware + /__theme/:value route
app.use(theme({ default: 'dark' }))

// ctx.theme = { value: 'dark', set: fn }
// ctx.theme.value — 'dark'
// ctx.theme.set('light', '/settings') — 302 + Set-Cookie

// Explicit form for more control:
// const t = theme()
// app.use(t.middleware())
// app.use('/', t)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `default` | `string` | `'system'` | Default theme |
| `cookie` | `string` | `'theme'` | Cookie name (empty to disable) |

```ts
// Server-side switching
app.post('/settings', async (req, ctx) => {
  const { theme } = await req.json()
  return ctx.theme.set(theme, '/settings')
})
```

See [`useTheme()`](#usetheme) for client-side usage.

### i18n [α] [UX]

```ts
// Single line — auto-registers middleware + /__lang/:locale route
app.use(i18n({ default: 'zh', dir: './locales' }))

// ctx.i18n = { locale: 'zh', t, set }
// ctx.i18n.t('welcome') → '欢迎'
// ctx.i18n.locale → 'zh'
// ctx.i18n.set('en', '/settings') — 302 + Set-Cookie

// Explicit form for more control:
// const l = i18n()
// app.use(l.middleware())
// app.use('/', l)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `default` | `string` | `'en'` | Default locale |
| `dir` | `string` | — | Directory with `{locale}.json` files |
| `messages` | `object` | — | Inline translations: `{ zh: { welcome: '欢迎' } }` |
| `cookie` | `string` | `'locale'` | Cookie name (empty to disable) |
| `fromAcceptLanguage` | `boolean` | `true` | Detect from Accept-Language header |

```ts
// Handler
app.get('/greet', async (req, ctx) => {
  const greeting = ctx.i18n?.t('welcome', { name: 'Alice' })
  return Response.json({ greeting, locale: ctx.i18n?.locale })
})
```

**Client-side:** import `useLocale` from `weifuwu/react`, `useTheme` from `weifuwu/react`.

### queue [α] [Database]

Async job queue. Supports immediate, delayed, and recurring (cron) tasks with three backends:

- `{ store: 'memory' }` — in-memory, zero dependency, suitable for dev & cron-like tasks
- `{ store: 'pg', pg }` — PostgreSQL-backed, persistent, multi-instance safe via `FOR UPDATE SKIP LOCKED`
- `{ store: 'redis', redis }` — Redis-backed, production-grade, distributed

```ts
// Create queue
const q = queue({ store: 'memory' })
// const q = queue({ store: 'pg', pg })
// const q = queue({ store: 'redis', redis })

// Register cron job (uses the same backend for persistence)
q.cron('*/5 * * * *', async () => { await cleanCache() })

// Or use process/add for full queue semantics
q.process('send-email', async (job) => {
  await sendMail(job.payload)
})

// Immediate
q.add('send-email', { to: 'user@test.com' })

// Delayed
q.add('send-email', { to: 'user@test.com' }, { delay: 60_000 })

// Scheduled (cron) — re-queues automatically
q.add('weekly-report', {}, { schedule: '0 9 * * 1' })

q.run()
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `store` | `'memory' \| 'pg' \| 'redis'` | `'memory'` | Backend store |
| `redis` | `object` | — | Redis client (required when `store: 'redis'`) |
| `url` | `string` | — | Redis URL (alternative to client) |
| `pg` | `object` | — | PostgreSQL client (required when `store: 'pg'`) |
| `prefix` | `string` | `'queue'` | Key/table prefix |
| `pollInterval` | `number` | `200` | Poll interval (ms) |

| Method | Description |
|--------|-------------|
| `.cron(pattern, handler)` | Register a cron job (uses process + add internally) |
| `.add(type, payload, opts?)` | Add job (opts: `delay`, `schedule`) |
| `.process(type, handler)` | Register job processor |
| `.run()` | Start processing |
| `.stop()` | Stop processing |
| `.jobs(limit?)` | List pending jobs |
| `.failedJobs(limit?)` | List failed jobs with error messages |
| `.retryFailed(jobId)` | Retry a specific failed job |
| `.retryAllFailed(type?)` | Retry all failed jobs (optionally by type) |
| `.dashboard()` | Returns a Router with management endpoints |
| `.close()` | Cleanup |

**Schedule (cron) field reference:**

| Field | Range |
|-------|-------|
| minute | 0–59 |
| hour | 0–23 |
| day of month | 1–31 |
| month | 1–12 |
| day of week | 0–6 (0=Sunday) |

Supported cron syntax: `*` (any), `*/n` (every n), `n-m` (range), `n,m,o` (list), `n` (exact).

**Dashboard endpoints** (mount via `app.use('/__queue', q.dashboard())`):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Queue stats + pending/failed counts by type |
| GET | `/:type/failed` | List failed jobs for a type |
| POST | `/:type/retry` | Retry all failed jobs of a type |
| POST | `/retry/:id` | Retry a specific failed job by ID |

### rateLimit [α] [Security]

```ts
app.use(rateLimit({ max: 100, window: 60_000 }))            // 100 req/min, in-memory
app.get('/api', rateLimit({ max: 10 }), handler)            // per-route
app.use(rateLimit({ key: (req) => req.headers.get('x-api-key') ?? 'anonymous' }))

// Multi-process: Redis-backed rate limiting
app.use(rateLimit({ max: 100, store: 'redis', redis: ctx.redis }))

// Sets X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After headers
// m.stop() — clear interval (memory) or Redis cleanup
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `max` | `number` | `100` | Max requests per window |
| `window` | `number` | `60_000` | Window duration (ms) |
| `key` | `(req) => string` | IP-based | Key function |
| `message` | `string` | `'Too Many Requests'` | 429 response body |
| `store` | `'memory' \| 'redis'` | `'memory'` | Backend store |
| `redis` | `Redis` | — | Redis client (required when `store: 'redis'`) |
| `prefix` | `string` | `'ratelimit:'` | Redis key prefix |

Redis mode uses `INCR` + `EXPIRE` for atomic counting, enabling accurate rate limiting across multiple server processes. Memory mode is ideal for single-process deployments.

### redis [α] [Database]

```ts
const r = redis()          // reads REDIS_URL
app.use(r)                 // injects ctx.redis
await ctx.redis.set('key', 'value')
// r.close() — cleanup
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | `REDIS_URL` env | Redis connection string |
| (all ioredis options) | — | — | Passed directly to ioredis |

### requestId [α] [DevTools]

```ts
app.use(requestId())
app.use(requestId({ header: 'X-Request-Id', generator: () => crypto.randomUUID() }))
// Sets X-Request-ID header on responses, available as ctx.requestId
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `header` | `string` | `'X-Request-ID'` | Header name to read/write |
| `generator` | `() => string` | `crypto.randomUUID()` | ID generator |

### trace [α] [DevTools]

Request-scoped tracing via `AsyncLocalStorage`. Use as middleware to inject `ctx.trace`:

```ts
import { trace } from 'weifuwu'
app.use(trace())                             // → ctx.trace
app.use(trace({ header: 'X-Trace-Id' }))     // custom header

app.get('/', (req, ctx) => {
  console.log(ctx.trace.requestId)  // 550e8400-e29b-...
  console.log(ctx.trace.traceId)    // trace UUID
  console.log(ctx.trace.elapsed())  // ms since request start
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `header` | `string` | `'X-Request-ID'` | Request ID header name |
| `generator` | `() => string` | `crypto.randomUUID()` | Custom ID generator |

Utility functions (also available standalone):

```ts
import { currentTraceId, runWithTrace, traceElapsed, currentTrace } from 'weifuwu'

const traceId = currentTraceId()  // UUID or incoming X-Trace-Id
const elapsed = traceElapsed()    // ms since request started
runWithTrace(incomingId, () => { ... })  // manual scope
```

| Function | Description |
|----------|-------------|
| `currentTraceId()` | Current request trace ID, or `undefined` outside a request |
| `currentTrace()` | Full `{ traceId, startTime }` context |
| `traceElapsed()` | Milliseconds elapsed since the trace started |
| `runWithTrace(traceId, fn)` | Execute `fn` inside a trace scope |

### s3 [α] — S3-compatible object storage [Networking]

```ts
import { s3 } from 'weifuwu'

app.use(s3({
  bucket: 'my-app',
  region: 'us-east-1',
  endpoint: process.env.S3_URL,              // MinIO / R2 / AWS
  forcePathStyle: true,                       // required for MinIO
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  publicUrl: 'https://cdn.example.com',       // for unsigned public URLs
}))
```

Injects `ctx.s3` with methods for S3-compatible object storage.

```ts
// Upload
await ctx.s3.put('images/logo.png', buffer, { contentType: 'image/png' })

// Download
const buf = await ctx.s3.get('images/logo.png')  // Buffer | null

// Delete
await ctx.s3.delete('images/logo.png')

// Check existence
if (await ctx.s3.exists('images/logo.png')) { ... }

// Signed URL (expires in 1 hour by default)
const url = await ctx.s3.url('images/logo.png')
const shortUrl = await ctx.s3.url('images/logo.png', { expiresIn: 60 })

// Public URL (requires publicUrl in options)
const publicUrl = await ctx.s3.url('images/logo.png', { expiresIn: 0 })

// List objects under a prefix
const keys = await ctx.s3.list('images/')
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `bucket` | `string` | — | **Required.** S3 bucket name |
| `region` | `string` | `'us-east-1'` | AWS region |
| `endpoint` | `string` | — | Custom endpoint (MinIO, R2, B2) |
| `forcePathStyle` | `boolean` | `false` | Path-style addressing (required for MinIO) |
| `credentials` | `{ accessKeyId, secretAccessKey }` | — | Falls back to AWS env vars / IAM role |
| `publicUrl` | `string` | — | Base URL for unsigned public URLs via `url(key, { expiresIn: 0 })` |

Credentials can be omitted to use AWS environment variables (`AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`) or IAM roles (EC2, ECS, Lambda).

The module can also be used standalone without the middleware:

```ts
const storage = s3({ bucket: 'my-app', endpoint: '...' })
await storage.put('key', body)
const data = await storage.get('key')
```

Requires MinIO or another S3-compatible service for local development.
Add to `docker-compose.yml`:

```yml
minio:
  image: minio/minio
  ports:
    - '9000:9000'
  environment:
    MINIO_ROOT_USER: minioadmin
    MINIO_ROOT_PASSWORD: minioadmin
  command: server /data
```


### seo [β] + seoMiddleware [α] [API]

```ts
app.use('/', seo({ baseUrl: 'https://example.com', robots: [{ userAgent: '*', allow: '/' }], sitemap: { urls: [{ loc: '/' }] } }))
// GET /robots.txt, GET /sitemap.xml

app.use(seoMiddleware({ headers: { 'X-Robots-Tag': (path) => path.startsWith('/admin') ? 'noindex' : undefined } }))
```

Also exports `seoTags(config)` for generating meta/og/twitter tags as an HTML string.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | — | Base URL for sitemap URLs |
| `robots` | `RobotsRule[]` | `[{ userAgent: '*', allow: '/' }]` | Robots.txt rules |
| `sitemap` | `SitemapConfig` | — | Sitemap configuration (urls, resolve, cacheTTL) |
| `headers` | `SeoHeadersConfig` | — | Response headers (e.g. `X-Robots-Tag`) |

### session [α] [Security]

Cookie-based server-side session management with memory and Redis stores.

```ts
app.use(session())                                          // in-memory store (default)
app.use(session({ store: 'redis', redis: ctx.redis }))       // Redis store
app.use(session({ store: 'redis', redis, ttl: 30 * 60_000, cookieName: 'sid' }))

app.get('/login', async (req, ctx) => {
  ctx.session.userId = 42
  ctx.session.role = 'admin'
  // Auto-saved on response — cookie set automatically
  return Response.json({ ok: true })
})

app.get('/logout', async (req, ctx) => {
  ctx.session.destroy()     // or ctx.session = null
  return Response.json({ ok: true })
})

// ctx.session.id — readonly session ID
// ctx.session.save() — explicit dirty mark (for deep mutations)
// ctx.session.destroy() — clear session + remove cookie
// Session mutations are auto-detected on property set/delete
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `store` | `'memory' \| 'redis' \| SessionStore` | `'memory'` | Session store backend |
| `redis` | `Redis` | — | Redis client (required when `store: 'redis'`) |
| `ttl` | `number` | `86400000` (24h) | Session TTL in ms |
| `cookieName` | `string` | `'__session'` | Cookie name |
| `cookie.httpOnly` | `boolean` | `true` | Cookie httpOnly flag |
| `cookie.secure` | `boolean` | `auto` | Cookie Secure flag (true in production) |
| `cookie.sameSite` | `string` | `'lax'` | SameSite policy |
| `cookie.path` | `string` | `'/'` | Cookie path |
| `cookie.domain` | `string` | — | Cookie domain |
| `secret` | `string` | — | HMAC-SHA256 sign the session cookie (`uuid.signature`). Prevents tampering **strongly recommended in production** |
| `rotateInterval` | `number` | `900000` (15min) | Auto-rotate session ID to prevent fixation attacks. Set `0` to disable |

When `secret` is set, the cookie value is signed with HMAC-SHA256:
`uuid.base64url(hmac)`. Tampered cookies are rejected and treated as new
sessions (no error message, no data leak).

Session ID auto-rotation copies data to a new ID and deletes the old one
from the store. Rotation happens transparently on the next request after
`rotateInterval` has elapsed.

**Stores** are also exported for standalone use:

```ts
import { MemoryStore, RedisStore } from 'weifuwu'

const mem = new MemoryStore()  // auto-cleanup every 60s
await mem.set('sid', { userId: 1 }, 86400000)
mem.close()

const redis = new RedisStore(redisClient, 'myapp:session:')
await redis.destroy('sid')
```

### ssr({ dir }) [β] [SSR]

One-stop Server-Side Rendering. Accepts a directory and returns a Router that handles all SSR routes, tailwind CSS, hydration, and livereload — using Next.js-style file conventions.

```ts
import { Router, ssr } from 'weifuwu'
const app = new Router()
app.use('/', ssr({ dir: './ui' }))
```

**Directory conventions (Next.js-style):**

```
./ui/
├── app/                 ← only this directory affects routing
│   ├── globals.css      ← tailwind CSS + CSS variables (optional)
│   ├── layout.tsx       → root layout (wraps all pages)
│   ├── page.tsx         → GET /
│   ├── not-found.tsx    → 404 page (optional)
│   ├── error.tsx        → error boundary (optional)
│   ├── about/
│   │   ├── page.tsx     → GET /about
│   │   └── layout.tsx   → group layout
│   └── posts/
│       ├── page.tsx     → GET /posts
│       └── [id]/
│           └── page.tsx → GET /posts/:id
├── components/          ← shared components (does not affect routing)
└── lib/                 ← utilities (does not affect routing)
```

| Location | Route |
|----------|-------|
| `app/page.tsx` | `GET /` |
| `app/[param]/page.tsx` | `GET /:param` |
| `app/layout.tsx` | Root layout (wraps all pages in its subtree) |
| `app/not-found.tsx` | 404 fallback for that subtree |
| `app/error.tsx` | Error boundary for that subtree |
| `app/globals.css` | Tailwind CSS entry (compiled via `@tailwindcss/postcss`) |

**How hydration works:**

- Each page is lazy-resolved on first request — only the `page.tsx` and its layout chain are compiled
- An inline `<script type="module">` in the HTML handles hydration
- It imports `{ setCtx, TsxContext }` from the vendor bundle (`/__wfw/v/bundle`) via importmap
- Then dynamically imports the page component: `await import('/__ssr/[hash].js')`
- The vendor bundle (react + react-dom + weifuwu client libs) is compiled once and cached
- Page components are pre-compiled to `/__ssr/{hash}.js` — no runtime esbuild after first request
- **Dev:** `createRoot` + render; **Production:** `hydrateRoot` (reuses SSR DOM)
- The hydration script and page component share the same SSR context store — data flows seamlessly from server to client
- Tailwind CSS served at `/__wfw/style/{hash}.css` (cached, content-hashed)
- Dev mode extras: HMR WebSocket, file watcher, hot component replacement

```ts
// Multiple independent SSR directories
app.use('/',      ssr({ dir: './www' }))
app.use('/admin', ssr({ dir: './admin' }))

// API routes coexist normally
app.get('/api/ping', () => Response.json({ pong: true }))
```

Layout components receive `{ children }` and wrap from outer to inner:

### tenant [β] [Networking]

Multi-tenant BaaS with dynamic table API and GraphQL.

```ts
const t = tenant({ pg, usersTable: '_users' })
await t.migrate()
app.use('/api', t.middleware())   // → ctx.tenant
app.use('/api', t)      // dynamic CRUD
app.use('/graphql', t.graphql()) // dynamic GraphQL
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pg` | `object` | — | PostgreSQL client |
| `usersTable` | `string` | — | Users table name for tenant membership lookup |

### upload [α] [DevTools]

```ts
app.post('/upload', upload({ dir: './uploads', maxFileSize: 10_485_760, allowedTypes: ['image/jpeg', 'image/png'] }), (req, ctx) => {
  // ctx.parsed.files.avatar → { name, type, size, path } or { name, type, size, buffer } (when no dir)
  // Multiple files with same field name → array
  // ctx.parsed.fields.title → 'hello'
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dir` | `string` | — | Write files to disk (omit for in-memory) |
| `maxFileSize` | `number` | — | Max bytes per file |
| `allowedTypes` | `string[]` | — | Allowed MIME types |

### user [β] [Security]

Authentication: register, login, JWT, OAuth2 服务端, 社会化登录.

```ts
const u = user({
  pg,
  jwtSecret: process.env.JWT_SECRET!,
  oauthLogin: {                                          // 可选 — 社会化登录
    providers: {
      github: { clientId: '...', clientSecret: '...' },
      google: { clientId: '...', clientSecret: '...' },
    },
  },
})
await u.migrate()
app.use(u)                              // POST /register, POST /login
app.use(u.middleware())                  // ctx.user
// GET /auth/github, GET /auth/github/callback  (如配置 oauthLogin)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pg` | `object` | — | PostgreSQL client |
| `jwtSecret` | `string` | — | JWT signing secret |
| `table` | `string` | `'_users'` | Users table name |
| `expiresIn` | `string` | `'24h'` | JWT expiration |
| `oauth2` | `object` | — | OAuth2 服务端 config (PKCE flow) |
| `oauthLogin` | `object` | — | 社会化登录: `{ providers: Record<string, OAuthProviderConfig>, redirectUrl? }` |

| Method | Description |
|--------|-------------|
| `.register(data)` | Register a new user programmatically |
| `.login(data)` | Log in programmatically |
| `.verify(token)` | Verify JWT token |
| `.middleware()` | JWT verify middleware — sets `ctx.user` |

### permissions [α] — RBAC [Security]

Role-based access control.

```ts
const perm = permissions({ pg })
await perm.migrate()

// Assign roles & permissions
await perm.assignRole(userId, 'admin')
await perm.grantPermission('admin', 'posts:create')
await perm.grantPermission('admin', 'posts:edit')
await perm.grantPermission('admin', '*')         // wildcard — all permissions

// Use as middleware
app.use((req, ctx, next) => { ctx.user = { id: userId }; return next(req, ctx) })
app.use(perm)                                     // → ctx.roles, ctx.permissions

// Route guards
app.get('/admin', perm.requireRole('admin'), adminHandler)
app.post('/posts', perm.requirePermission('posts:create'), createHandler)

// Handler-level check
app.get('/posts/:id', async (req, ctx) => {
  if (!ctx.permissions.has('posts:read')) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }
  return Response.json(post)
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pg` | `object` | — | PostgreSQL client |
| `prefix` | `string` | `''` | Table prefix (e.g. `'myapp'` → `myapp_roles`) |

| Method | Description |
|--------|-------------|
| `.assignRole(userId, role)` | Assign role to user (creates role if missing) |
| `.removeRole(userId, role)` | Remove role from user |
| `.grantPermission(role, permission)` | Grant permission to role |
| `.revokePermission(role, permission)` | Revoke permission from role |
| `.getUserRoles(userId)` | List user's roles |
| `.getUserPermissions(userId)` | List user's permissions (union of all roles) |
| `.requireRole(...roles)` | Middleware — rejects if user lacks any of the roles |
| `.requirePermission(...perms)` | Middleware — rejects if user lacks any permission |
| `.migrate()` | Create tables |

### validate [α] [DevTools]

```ts
import { z } from 'zod'
const CreateUser = z.object({ name: z.string().min(1), email: z.string().email() })
app.post('/users', validate({ body: CreateUser, query: z.object({ ref: z.string().optional() }) }), (req, ctx) => {
  // ctx.parsed.body — typed & validated
  // ctx.parsed.query — typed & validated
  // ctx.parsed.params — typed & validated (for dynamic routes)
  // ctx.parsed.headers — typed & validated
})
// Validation failure: returns 400 with { error: 'Validation failed', issues: [...] }

**Form body auto-parsing** — `application/x-www-form-urlencoded` bodies are automatically parsed into `Record<string, string>` via `URLSearchParams`, even without a Zod schema:

```ts
// No schema needed — just parse the form
app.post('/contact', validate(), (req, ctx) => {
  const email = ctx.parsed.body.email  // string
  const msg = ctx.parsed.body.message  // string
  return Response.json({ received: true })
})

// Or validate with Zod
app.post('/contact', validate({ body: z.object({ email: z.string().email() }) }), handler)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `body` | `ZodSchema` | — | Body validation schema (omit to skip) |
| `query` | `ZodSchema` | — | Query validation schema |
| `params` | `ZodSchema` | — | URL params validation schema |
| `headers` | `ZodSchema` | — | Header validation schema |

### webhook [β] [API]

Webhook receiver with built-in signature verification for Stripe, GitHub, and Slack. Event-based dispatch with replay protection.

```ts
import { webhook } from 'weifuwu'

const wh = webhook({
  stripe: { secret: process.env.STRIPE_WEBHOOK_SECRET! },
  github: { secret: process.env.GITHUB_WEBHOOK_SECRET! },
  slack: { secret: process.env.SLACK_WEBHOOK_SECRET! },
})

app.use('/webhooks', wh)

wh.on('checkout.session.completed', async (event, ctx) => {
  await fulfillOrder(event.payload.data.object)
})

wh.on('push', async (event, ctx) => {
  await triggerCI(event.payload)
})

wh.on('*', (event) => {
  console.log(`Received ${event.provider}.${event.event}`)
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `stripe` | `PlatformConfig` | — | Stripe webhook config with `secret` |
| `github` | `PlatformConfig` | — | GitHub webhook config |
| `slack` | `PlatformConfig` | — | Slack webhook config |
| `custom` | `CustomVerifierConfig[]` | — | Custom signature verifiers |
| `replayProtection` | `boolean` | `true` | Deduplicate by event ID |
| `idempotencyTTL` | `number` | `3600000` | Dedup TTL (ms) |

Built-in verifiers handle HMAC-SHA256, timestamp validation (Slack's 5-min window), and Stripe's `t=` / `v1=` signature format. Slack URL verification challenges are auto-responded.

### Client-side navigation [δ] [Client]

```tsx
import { Link, navigate, useNavigate, useNavigating } from 'weifuwu/react'

<Link href="/about" prefetch>About</Link>   // client-side nav + prefetch on hover/visible
const n = useNavigate()                      // hook: n('/contact')
navigate('/contact')                         // bare function (no hook needed)
const loading = useNavigating()              // reactive loading state
```

`navigate()` fetches the SSR page, extracts the root container content, and replaces it in-place. Middleware runs on server each nav — data is always fresh.

**Preference URLs** (`/__lang/`, `/__theme/`) are intercepted by modular interceptors registered via `addInterceptor()` — no page reload needed. Importing `useLocale` or `useTheme` registers the interceptor automatically.

### Client-side hooks [δ] [Client]

```tsx
import { useWebsocket, useAction, useFetch, useQueryState, createStore, Head } from 'weifuwu/react'
import { useLocale, useTheme, applyTheme, addInterceptor, useLoaderData, useFlashMessage } from 'weifuwu/react'

// WebSocket — auto-reconnecting
const { send, lastMessage, readyState, close, reconnect } = useWebsocket('/ws/chat', {
  onMessage: (d) => console.log(d),
  reconnect: { maxRetries: 10, delay: 3000 },
  protocols: [],          // optional sub-protocols
  enabled: true,          // pause/resume connection
})

// Form action
const { submit, data, error, pending, reset } = useAction('/api/feedback', {
  method: 'POST',
  headers: { 'X-Custom': 'value' },
  onSuccess: (data) => console.log(data),
  onError: (err) => console.error(err),
})
// Auto-reads _csrf cookie, sends as x-csrf-token or x-xsrf-token

// Data fetching — cache + dedup + mutate
const { data, error, loading, mutate } = useFetch('/api/posts', { fallback: loadData, ttl: 30_000 })

// URL query state
const [q, setQ] = useQueryState('q', '')
const [page, setPage] = useQueryState('page', '1')

// Shared state — persists across client navs
const useStore = createStore({ count: 0 })
const count = useStore(s => s.count)

// Per-page meta tags
<Head><title>Page Title</title><meta name="description" content="..." /></Head>
```

**`TsxContext`** — React context holding page data (`params`, `query`, `user`, `parsed`, `theme`, `i18n`, `flash`, `loaderData`, `env`). Used internally by hooks; rarely needed directly.

### Locale & Theme [δ] [Client]

```tsx
import { useLocale } from 'weifuwu/react'
function LangSwitch() {
  const { locale, setLocale, t } = useLocale()
  return <button onClick={() => setLocale('zh-CN')}>{t('switch_lang')}</button>
}
```

| Return | Description |
|--------|-------------|
| `locale` | Current locale string (from `ctx.i18n.locale`) |
| `setLocale(locale)` | Switch locale (calls `navigate('/__lang/' + locale)`) |
| `t` | Translate a key using loaded locale messages |

```tsx
import { useTheme } from 'weifuwu/react'
function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  return (
    <>
      <span>Current: {resolvedTheme}</span>  {/* 'dark' | 'light' — never 'system' */}
      <select value={theme} onChange={e => setTheme(e.target.value)}>
        <option value="light">☀ Light</option>
        <option value="dark">🌙 Dark</option>
        <option value="system">💻 System</option>
      </select>
    </>
  )
}
```

| Return | Description |
|--------|-------------|
| `theme` | Raw preference (`'light'` \| `'dark'` \| `'system'`) |
| `resolvedTheme` | Resolved value (`'light'` \| `'dark'`) — `'system'` → matchMedia |
| `setTheme(theme)` | Switch theme (calls `navigate('/__theme/' + theme)`) |

**`applyTheme(theme)`** — DOM-only theme application. Sets `data-theme` on `<html>`, registers `matchMedia` listener for `'system'`. Used by the interceptor; exported for custom scenarios.

**`useLoaderData()`** — Returns middleware-injected data from the request context. Works identically on server (SSR) and client (hydration/SPA). Re-renders on SPA navigation.

```tsx
import { useLoaderData } from 'weifuwu/react'
function Page() {
  const data = useLoaderData<{ posts: Post[] }>()
  return <ul>{data.posts.map(p => <li key={p.id}>{p.title}</li>)}</ul>
}
```

On the server, data flows from middleware → `ctx` → `setCtx(ctxValue)` (serialized via JSON). On the client, the hydration script calls `setCtx(ctxData)` which populates the shared context store. `useLoaderData()` reads from the snapshot via `useSyncExternalStore` — no SSR-specific code needed in your components.

**`addInterceptor(fn)`** — Register a URL interceptor. Interceptors run before SPA navigation; if one returns `true`, `navigate()` skips the fetch-and-swap.

```ts
import { addInterceptor } from 'weifuwu/react'
addInterceptor(async (url) => {
  if (!url.pathname.startsWith('/__custom/')) return false
  // handle without page reload
  return true
})
```

### Flash messages [δ] [Client]

```ts
import { flash } from 'weifuwu'

app.use(flash())

// Read flash
app.get('/', (req, ctx) => {
  const msg = ctx.flash.value  // { type: 'success', text: 'Saved!' }
})

// Set flash + redirect
app.post('/save', async (req, ctx) => {
  await saveArticle()
  return ctx.flash.set({ type: 'success', text: '已保存' }, '/articles')
  // → 302 /articles + Set-Cookie flash=...
})
```

```tsx
// Client
import { useFlashMessage } from 'weifuwu/react'

function Toast() {
  const flash = useFlashMessage<{ type: string; text: string }>()
  if (!flash) return null
  return <div className={`toast toast-${flash.type}`}>{flash.text}</div>
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `'flash'` | Cookie name |

### Dev mode [δ] [Client]

Auto-detected when `NODE_ENV === 'development'`. `ssr({dir})` automatically registers importmap, vendor bundle, HMR WebSocket, and file watcher. No explicit setup needed.

- Inline hydration script uses `createRoot` + render (replaces SSR DOM)
- Vendor bundle served at `/__wfw/v/bundle?h=<hash>` — compiled from source, unminified
- Hot component replacement: file changes → WebSocket message → browser imports hot bundle → component refreshed in place — `useState` values preserved
- Tailwind CSS hot-reloads without page refresh
- Layout changes trigger a full page reload

---

## AI

```ts
import { openai, streamText, generateText, streamObject, generateObject, tool, embed, embedMany, aiProvider } from 'weifuwu'
import { runWorkflow } from 'weifuwu'

const provider = aiProvider()
```

For AI streaming endpoints see [`aiStream`](#aistream-β). For AI agent APIs see [`agent`](#agent-β).

### aiProvider [α] — AI model & embedding configuration [AI]

```ts
const provider = aiProvider()                 // auto from env
app.use(provider)                              // → ctx.ai

// Handler
app.post('/ask', async (req, ctx) => {
  const { text } = await ctx.ai.generateText({ prompt: 'hello' })
  const vec = await ctx.ai.embed('some text')
  const stream = ctx.ai.streamText({ system: 'assistant', messages: [...] })
  return stream.toTextStreamResponse()
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseURL` | `string` | `OPENAI_BASE_URL` env or `http://localhost:11434/v1` | API base URL |
| `apiKey` | `string` | `OPENAI_API_KEY` env or `'ollama'` | API key |
| `model` | `string` | `OPENAI_MODEL` env or `'qwen3:0.6b'` | Chat model name |
| `embeddingModel` | `string` | `OPENAI_EMBEDDING_MODEL` env or `'qwen3-embedding:0.6b'` | Embedding model name |
| `embeddingDimension` | `number` | `EMBEDDING_DIMENSION` env or `1024` | Vector dimension |

| Method | Description |
|--------|-------------|
| `.model(name?)` | Get `LanguageModel` instance |
| `.embeddingModel(name?)` | Get `EmbeddingModel` instance |
| `.embed(text)` | Embed single text → `Promise<number[]>` |
| `.embedMany(texts)` | Batch embed → `Promise<number[][]>` |
| `.generateText(params)` | Generate text (model auto-injected) |
| `.streamText(params)` | Stream text (model auto-injected) |
| `.dimension` | Configured embedding dimension |

### DAG Workflow [AI]

```ts
const tools = { queryUser: tool({ ... }) }

// Via provider:
const wf = runWorkflow({ tools, provider })

// Or explicit model:
const wf = runWorkflow({ tools, model: openai('gpt-4o') })
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tools` | `object` | — | Registered tool definitions |
| `provider` | `AIProvider` | — | AI provider (uses `provider.model()` for LLM-generated workflow) |
| `model` | `LanguageModel` | — | Explicit model (overrides provider) |
| `maxSteps` | `number` | `200` | Max execution steps |

---

## Server-Sent Events

```ts
import { createSSEStream, formatSSE, formatSSEData } from 'weifuwu'
async function* events() { yield formatSSE('chat', 'Hello'); yield formatSSE('chat', 'World') }
app.get('/stream', (req, ctx) => createSSEStream(events()))
```

---

## Complete export index

Every public symbol can be imported from `'weifuwu'`:

### Core

```ts
serve, createTestServer, Router, ssr,
Context, Handler, Middleware, ErrorHandler, ServeOptions, Server,
loadEnv, env, isDev, isProd, isBundled, getPublicEnv,
currentTraceId, currentTrace, runWithTrace, traceElapsed, trace, TraceContext,
testApp, TestApp, TestRequest, TestResponse,
createTestDb, withTestDb,
getCookies, setCookie, deleteCookie,
createSSEStream, formatSSE, formatSSEData, SSEEvent,
DEFAULT_MAX_BODY, MIGRATIONS_TABLE,
```

### Middleware / DevTools

```ts
logger, cors, compress, helmet,
rateLimit, requestId, validate, upload,
csrf, session, MemoryStore, RedisStore, SessionStore,
cache, MemoryCache, RedisCache, CacheStore,
flash, permissions,
serveStatic, s3,
```

### Database

```ts
postgres, PostgresOptions, PostgresClient,
redis, RedisOptions, RedisClient,
queue, QueueOptions, QueueJob, Queue,
PostgresInjected, RedisInjected, QueueInjected,
// Schema helpers:
pgTable, SQL, sql,
ColumnBuilder, serial, uuid, text, integer, boolean, boolean_, timestamptz, jsonb, textArray, vector,
partitionBy, timestamps, toDDL, PartitionByDef,
Table, BoundTable, IndexOptions, FindOptions, CreateOptions,
eq, ne, gt, gte, lt, lte, isNull, isNotNull, like, contains, in_, and, or, not,
fts,
```

### Security / Auth

```ts
auth,
user, UserModule, UserData, UserOptions, UserInjected, OAuthProviderConfig, OAuth2Client,
permissions, PermissionsModule, PermissionsOptions,
csrf, CsrfOptions, CsrfInjected,
helmet, HelmetOptions,
session, SessionStore, SessionOptions, SessionData, SessionInjected,
rateLimit, RateLimitOptions,
```

### UX Middleware

```ts
theme, ThemeOptions, ThemeInjected,
i18n, I18nOptions, I18nInjected,
flash, FlashOptions, FlashInjected,
```

### AI

```ts
aiProvider, AIProvider, AIProviderOptions, AIProviderInjected,
streamText, generateText, streamObject, generateObject,
tool, embed, embedMany, smoothStream,
openai, createOpenAI,
aiStream, AIHandler,
runWorkflow,
agent, AgentModule, AgentOptions,
knowledgeBase, KBModule, KBOptions,
opencode, OpencodeModule, OpencodeOptions,
```

### API / Routing

```ts
analytics, AnalyticsModule, AnalyticsOptions,
health, HealthOptions,
graphql, GraphQLOptions, GraphQLHandler,
logdb, LogdbModule, LogdbOptions,
seo, seoMiddleware, seoTags, SeoOptions,
webhook, WebhookModule, WebhookOptions,
iii, createWorker, registerWorker, IIIModule, IIIOptions,
```

### Networking / Storage

```ts
s3, S3Options, S3Module, S3Body,
mailer, MailerOptions, Mailer,
messager, MessagerModule, MessagerOptions,
hub, createHub, Hub, HubOptions,
deploy, defineConfig, DeployConfig, AppConfig,
tenant, TenantModule, TenantOptions, TenantContext,
```

### Client-side (from `'weifuwu/react'`)

```ts
TsxContext, setCtx, useCtx, addCtxRebuilder, useLoaderData,
useWebsocket, useAction, useFetch, useQueryState, createStore,
Link, useNavigate, useNavigating, addInterceptor,
useLocale, useTheme, applyTheme, useFlashMessage,
useAgentStream,
Head,

// Types:
StoreApi,
UseActionOptions, UseActionReturn,
UseWebsocketOptions, UseWebsocketReturn,
UseAgentStreamOptions, UseAgentStreamReturn, AgentStreamState,
```

---

## License

MIT
