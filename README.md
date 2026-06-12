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
interface Server { stop: () => Promise<void>; readonly port: number; readonly hostname: string; ready: Promise<void> }
const { server, url } = await createTestServer(handler)
```

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
3. **Global middleware** runs in `use()` order (e.g. `preferences()`, `postgres()`, `cors()`)
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
| `csrfToken` | `csrf()` | `string` | CSRF token |
| `requestId` | `requestId()` | `string` | Request ID |
| `sql` | `postgres()` | `Sql<{}>` | PostgreSQL tagged-template client |
| `redis` | `redis()` | `Redis` | Redis client |
| `queue` | `queue()` | `Queue` | Job queue |
| `prefs` | `preferences()` | `{ locale, theme }` | User preferences (locale, theme) |
| `deploy` | `deploy()` | `{ appName? }` | Deploy gateway info |
| `layoutStack` | `ssr()` internal | `LayoutEntry[]` | React layout component stack |
| `loaderData` | User middleware | `Record<string, unknown>` | SSR data passed to client |
| `user` | `auth()` / `user().middleware()` | `{ id?: string }` | Authenticated user |
| `parsed` | `validate()` / `upload()` | `{ body, query, params, headers, files }` | Validated/parsed request data |
| `t` | `preferences()` | `(key) => string` | Translation function |
| `setPref` | `preferences()` | `(key, val) => Response` | Set preference cookie + redirect |
| `compiledTailwindCss` | `ssr()` internal | `string` | Compiled CSS content (internal) |
| `tailwindCssUrl` | `ssr()` internal | `string` | Compiled CSS route URL (internal) |

### Type-Safe Context

Middleware-injected properties are **automatically typed** through chained `use()` calls:

```ts
const app = new Router()
  .use(csrf())          // → Router<Context & { csrfToken: string }>
  .use(requestId())     // → Router<Context & { csrfToken, requestId }>
  .use(postgres())      // → Router<Context & { csrfToken, requestId, sql }>

app.get('/me', (_req, ctx) => {
  ctx.csrfToken   // ✅ string (IDE autocomplete)
  ctx.requestId   // ✅ string
  ctx.sql`SELECT 1` // ✅ Sql<{}>
})
```

Each module exports an `XxxInjected` type (e.g. `PostgresInjected`, `UserInjected`) for composing custom context types. `Context` is an interface — modules augment it via `declare module` for ambient compatibility.

---

## Module Patterns

All modules follow one of **2 patterns** — learn these and you know every module.

| Pattern | How to mount | Example |
|---------|-------------|---------|
| `[α]` | `app.use(mod())` | `compress()`, `preferences()`, `postgres()` |
| `[β]` | `app.use('/path', mod())` | `health()`, `ssr({dir})`, `graphql(handler)`, `user()` |

### Pattern α — Middleware

```ts
app.use(compress())           // basic
const pg = postgres()         // with extras: .sql, .table, .migrate(), .close()
app.use(pg)
app.use(rateLimit({ max: 100 }))  // with .stop()
```

### Pattern β — Router

```ts
app.use('/health', health())                                    // with path
app.use('/graphql', graphql(handler))
app.use('/logs', logdb({ pg }))                                 // with .log(), .migrate()
app.use('/auth', user({ pg, jwtSecret }))                       // with .middleware(), .register()
app.ws('/ws', messager({ pg }).wsHandler())
```

β modules that need **separate middleware** use `.middleware()`:
```ts
const a = analytics()
app.use(a.middleware())   // tracking
app.use('/', a)           // dashboard
```

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

---

## Module Reference

### agent [β]

```ts
const a = agent({ pg, model: openai('gpt-4o'), embeddingModel: openai.embedding('text-embedding-3-small') })
await a.migrate()
app.use('/api', a)
await a.addKnowledge(agentId, 'Title', 'some knowledge content')
a.run(agentId, { input: 'summarize the data', stream: true })
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pg` | `object` | — | PostgreSQL client |
| `model` | `object` | — | AI model (e.g. `openai('gpt-4o')`) |
| `embeddingModel` | `object` | — | Embedding model for knowledge search |
| `embeddingDimension` | `number` | `1536` | Embedding vector dimension |
| `tools` | `object[]` | — | Custom tool definitions |

| Method | Description |
|--------|-------------|
| `.run(agentId, { input, stream?, messages? })` | Execute agent with input |
| `.addKnowledge(agentId, title, content)` | Add knowledge document |
| `.migrate()` | DB setup |
| `.close()` | Cleanup |

### aiStream [β]

Creates an AI streaming chat endpoint using the Vercel AI SDK.

```ts
const chat = await aiStream(async (req) => ({ model: openai('gpt-4o'), messages: (await req.json()).messages }))
app.use('/chat', chat)
```

| Param | Type | Description |
|-------|------|-------------|
| `handler` | `(req, ctx) => AIStreamOptions \| Promise<AIStreamOptions>` | Returns AI SDK options (model, messages, schema, etc.) |

### analytics [β]

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

### auth [α]

```ts
app.use(auth({ token: 'sk-123' }))                              // static token
app.use(auth({ header: 'X-API-Key', token: 'my-key' }))         // custom header
app.use(auth({ verify: async (token, req) => ({ sub: 'abc' }) })) // custom verify → sets ctx.user
app.get('/protected', auth({ proxy: 'http://auth:3000/validate' }), handler)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `token` | `string` | — | Static token to match |
| `header` | `string` | `'Authorization'` | Header name |
| `verify` | `(token, req) => object\|null` | — | Verify function, return value sets `ctx.user` |
| `proxy` | `string` | — | Auth service URL to proxy requests to |

### compress [α]

```ts
app.use(compress())                         // brotli > gzip > deflate (min 1KB)
app.use(compress({ threshold: 2048, level: 4 }))      // custom threshold and level
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `threshold` | `number` | `1024` | Minimum byte size to compress |
| `level` | `number` | `6` | Compression level (zlib) |

### cors [α]

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

### csrf [α]

```ts
app.use(csrf())
// ctx.csrfToken — set on GET/HEAD/OPTIONS
// Auto-validates x-csrf-token or x-xsrf-token header on POST/PUT/DELETE/PATCH
// Falls back to body field matching the key name
```

| Option | Default | Description |
|--------|---------|-------------|
| `cookie` | `'_csrf'` | Cookie name |
| `header` | `'x-csrf-token'` | Header name (also accepts `x-xsrf-token`) |
| `key` | `'_csrf'` | Body field fallback |
| `excludeMethods` | `['GET','HEAD','OPTIONS']` | Skip validation |

### deploy [β]

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



### graphql [β]

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

### health [β]

```ts
app.use('/health', health())
// Returns 200 on success, 503 when check throws
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `path` | `string` | `'/health'` | Health check endpoint |
| `check` | `() => Promise<void>` | — | Async function; throws → 503 |

### helmet [α]

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

### iii [β] — Worker / Function / Trigger

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



### logdb [β]

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

### logger [α]

```ts
app.use(logger())                             // GET /hello 200 5ms
app.use(logger({ format: 'combined' }))       // with query params
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `format` | `'short' \| 'combined'` | `'short'` | Log format: path only, or path + query params |

### mailer

```ts
const mail = mailer({ from: 'noreply@example.com', transport: 'smtp://user:pass@smtp.example.com:587' })
await mail.send({ to: 'user@test.com', subject: 'Hello', text: 'Body', html: '<p>Body</p>', cc: 'admin@test.com' })
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `transport` | `string\|object` | — | Nodemailer transport config or connection string |
| `from` | `string` | — | Default sender address |
| `send` | `function` | — | Custom send function (alternative to transport) |

### messager [β]

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



### opencode [β]

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

### postgres [α]

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

### preferences [α]

Locale detection + theme + translations. `/__lang/:locale` and `/__theme/:theme` auto-routed.

```ts
app.use(preferences({ dir: './locales', locale: { default: 'en' }, theme: { default: 'system' } }))
// ctx.prefs.locale, ctx.prefs.theme, ctx.t('key'), ctx.setPref('locale', 'zh')
// ctx.setPref() returns a 302 Response with Set-Cookie — return it from your handler
// GET /__lang/zh → 302 + Set-Cookie  (or JSON if Accept: application/json)
// GET /__theme/dark → same pattern
```

| Option | Default | Description |
|--------|---------|-------------|
| `dir` | — | Translation JSON directory |
| `locale.default` | `'en'` | Fallback locale |
| `locale.cookie` | `'locale'` | Cookie name |
| `locale.fromAcceptLanguage` | `true` | Detect from header |
| `theme.default` | `'system'` | `'light'` \| `'dark'` \| `'system'` |
| `theme.cookie` | `'theme'` | Cookie name |

```tsx
// Client-side no-refresh switching — import enables it automatically
import { useLocale, useTheme } from 'weifuwu/react'

<Link href="/__lang/zh">中文</Link>         // <Link> handles it via interceptor
<button onClick={() => setLocale('en')}>EN</button>  // or programmatic
const { theme, resolvedTheme, setTheme } = useTheme()
// resolvedTheme resolves 'system' → 'dark'|'light' based on prefers-color-scheme
```

### queue [α]

```ts
const q = queue({ redis })
app.use(q)                     // injects ctx.queue
await q.add('send-email', { to: 'user@test.com' }, { cron: '0 8 * * *' })
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `redis` | `object` | — | Redis client |
| `url` | `string` | — | Redis URL (alternative to client) |
| `prefix` | `string` | `'queue:'` | Redis key prefix |
| `pollInterval` | `number` | `1000` | Poll interval (ms) |

| Method | Description |
|--------|-------------|
| `.add(name, data, opts?)` | Add job to queue |
| `.process(handler)` | Register job processor |
| `.run()` | Start processing |
| `.stop()` | Stop processing |
| `.close()` | Cleanup |

### rateLimit [α]

```ts
app.use(rateLimit({ max: 100, window: 60_000 }))            // 100 req/min
app.get('/api', rateLimit({ max: 10 }), handler)            // per-route
app.use(rateLimit({ key: (req) => req.headers.get('x-api-key') ?? 'anonymous' }))
// Sets X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After headers
// m.stop() — clear interval
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `max` | `number` | `100` | Max requests per window |
| `window` | `number` | `60_000` | Window duration (ms) |
| `key` | `(req) => string` | IP-based | Key function |
| `message` | `string` | `'Too Many Requests'` | 429 response body |

### redis [α]

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

### requestId [α]

```ts
app.use(requestId())
app.use(requestId({ header: 'X-Request-Id', generator: () => crypto.randomUUID() }))
// Sets X-Request-ID header on responses, available as ctx.requestId
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `header` | `string` | `'X-Request-ID'` | Header name to read/write |
| `generator` | `() => string` | `crypto.randomUUID()` | ID generator |



### seo [β] + seoMiddleware [α]

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

### ssr({ dir }) [β]

One-stop Server-Side Rendering. Accepts a directory and returns a Router that handles all SSR routes, tailwind CSS, hydration bundles, and livereload — using Next.js-style file conventions.

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

**How it works:**

- Each page is lazy-resolved on first request — only the `page.tsx` and its layout chain are compiled
- Hydration bundle generated per-page at `/__ssr/{hash}.js`
- Tailwind CSS served at `/__wfw/style/{hash}.css` (cached, content-hashed)
- Dev mode: vendor bundle, HMR WebSocket, file watcher — all automatic
- Page components and layouts are compiled via esbuild at runtime — no build step needed

```ts
// Multiple independent SSR directories
app.use('/',      ssr({ dir: './www' }))
app.use('/admin', ssr({ dir: './admin' }))

// API routes coexist normally
app.get('/api/ping', () => Response.json({ pong: true }))
```

Layout components receive `{ children }` and wrap from outer to inner:

### tenant [β]

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

### upload [α]

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

### user [β]

Authentication: register, login, JWT, OAuth2.

```ts
const auth = user({ pg, jwtSecret: process.env.JWT_SECRET! })
await auth.migrate()
app.use('/auth', auth)               // POST /register, POST /login, OAuth2 routes
app.get('/me', auth.middleware(), (req, ctx) => Response.json(ctx.user))
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pg` | `object` | — | PostgreSQL client |
| `jwtSecret` | `string` | — | JWT signing secret |
| `table` | `string` | `'_users'` | Users table name |
| `expiresIn` | `string` | `'7d'` | JWT expiration |
| `oauth2` | `object` | — | OAuth2 client config (PKCE flow) |

| Method | Description |
|--------|-------------|
| `.register(data)` | Register a new user programmatically |
| `.login(data)` | Log in programmatically |
| `.verify(token)` | Verify JWT token |
| `.middleware()` | JWT verify middleware — sets `ctx.user` |

### validate [α]

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
```
### Client-side navigation

```tsx
import { Link, useNavigate, useNavigating } from 'weifuwu/react'

<Link href="/about" prefetch>About</Link>   // client-side nav + prefetch on hover/visible
const navigate = useNavigate()               // programmatic: navigate('/contact')
const loading = useNavigating()              // reactive loading state
```

`navigate()` fetches SSR, extracts `__weifuwu_root`, replaces in-place. Middleware runs on server each nav — data is always fresh.

**Preference URLs** (`/__lang/`, `/__theme/`) are intercepted by modular interceptors registered via `addInterceptor()` — no page reload needed. Importing `useLocale` or `useTheme` registers the interceptor automatically.

### Client-side hooks

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

**`TsxContext`** — React context holding page data (`params`, `query`, `user`, `parsed`, `prefs`, `env`). Used internally by hooks; rarely needed directly.

### Locale & Theme

```tsx
import { useLocale } from 'weifuwu/react'
function LangSwitch() {
  const { locale, setLocale, t } = useLocale()
  return <button onClick={() => setLocale('zh-CN')}>{t('switch_lang')}</button>
}
```

| Return | Description |
|--------|-------------|
| `locale` | Current locale string (from `ctx.prefs.locale`) |
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

On the server, data flows from middleware → `ctx` → `ctx.loaderData` (serialized). On the client, it's restored from `window.__WEIFUWU_CTX`. Under the hood, `useLoaderData()` uses `AsyncLocalStorage` on the server and `window.__WEIFUWU_CTX` on the client — no SSR-specific code needed in your components.

**`addInterceptor(fn)`** — Register a URL interceptor. Interceptors run before SPA navigation; if one returns `true`, `navigate()` skips the fetch-and-swap.

```ts
import { addInterceptor } from 'weifuwu/react'
addInterceptor(async (url) => {
  if (!url.pathname.startsWith('/__custom/')) return false
  // handle without page reload
  return true
})
```

### Flash messages

```ts
// Server — set flash cookie on redirect, auto-cleared after first read
return ctx.setPref('flash', JSON.stringify({ type: 'success', message: 'Done' }))  // 302 + Set-Cookie
```

```tsx
// Client
import { useFlashMessage } from 'weifuwu/react'

function Toast() {
  const flash = useFlashMessage<{ type: string; message: string }>()
  if (!flash) return null
  return <div className={`toast toast-${flash.type}`}>{flash.message}</div>
}
```

### Dev mode

Auto-detected when `NODE_ENV !== 'production'`. `ssr({dir})` automatically registers vendor bundle, HMR WebSocket, and file watcher. No explicit setup needed.

When a `.tsx` or `.css` file changes under the `ssr` dir, the browser hot-updates without refreshing — `useState` values are preserved. Layout changes trigger a full page reload.

---

## AI

```ts
import { openai, streamText, generateText, streamObject, generateObject, tool, embed, embedMany } from 'weifuwu'
import { runWorkflow } from 'weifuwu'
```

For AI streaming endpoints see [`aiStream`](#aistream-β). For AI agent APIs see [`agent`](#agent-β).

### DAG Workflow

```ts
const tools = { queryUser: tool({ ... }) }
const wf = runWorkflow({ tools })
```

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
loadEnv, testApp, TestApp, TestRequest, TestResponse,
currentTraceId, currentTrace, runWithTrace, traceElapsed, TraceContext,
```

### Middleware modules

```ts
auth, cors, csrf, compress, helmet, logger, rateLimit, requestId, validate, upload,
preferences, serveStatic
```

### Database

```ts
postgres, PostgresOptions, PostgresClient,
redis, RedisOptions, RedisClient,
queue, QueueOptions, QueueJob, Queue,
PostgresInjected, RedisInjected, QueueInjected,
// Schema helpers — importable alongside postgres:
pgTable, SQL, sql,
ColumnBuilder, serial, uuid, text, integer, boolean, boolean_, timestamptz, jsonb, textArray, vector,
partitionBy, timestamps, toDDL, PartitionByDef,
Table, BoundTable, IndexOptions, FindOptions, CreateOptions,
eq, ne, gt, gte, lt, lte, isNull, isNotNull, like, contains, in_, and, or, not
```

### Client-side (from `'weifuwu/react'`)

```ts
TsxContext, useLoaderData,
useWebsocket, useAction, useFetch, useQueryState, createStore,
Link, useNavigate, useNavigating, addInterceptor,
useLocale, useTheme, applyTheme, useFlashMessage,
useAgentStream,
Head
```
export type { UseAgentStreamOptions, UseAgentStreamReturn, AgentStreamState } from 'weifuwu/react'

### AI SDK (re-exported from `ai`)

```ts
streamText, generateText, streamObject, generateObject,
tool, embed, embedMany, smoothStream,
openai, createOpenAI
```

### Other modules

```ts
preferences, health, analytics, seo, seoMiddleware, seoTags,
user, mailer, graphql, aiStream, runWorkflow,
logdb, messager, agent, iii, createWorker, registerWorker,
opencode, deploy, defineConfig,
testApp, TestApp, TestRequest, TestResponse,
getCookies, setCookie, deleteCookie,
createSSEStream, formatSSE, formatSSEData,
currentTraceId, currentTrace, runWithTrace, traceElapsed,
createHub, Hub, HubOptions,
DEFAULT_MAX_BODY, MIGRATIONS_TABLE,
```

---

## License

MIT
