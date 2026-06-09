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
import { serve, Router, preferences, ssr, rootLayout } from 'weifuwu'
const app = new Router()
app.use(preferences({ dir: './locales' }))
app.use(rootLayout('./ui'))
app.get('/', ssr('./ui/pages/home.tsx'))
serve(app.handler(), { port: 3000, websocket: app.websocketHandler() })
```

```bash
npx weifuwu init my-app && cd my-app && npm run dev
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
| `maxBodySize` | `number` | — | Max body bytes |
| `shutdown` | `boolean` | `true` | Auto SIGTERM/SIGINT |

```ts
interface Server { stop: () => void; readonly port: number; readonly hostname: string; ready: Promise<void> }
const { server, url } = await createTestServer(handler)
```

### Router

```ts
const app = new Router()
app.get('/hello/:name', (req, ctx) => Response.json({ message: `Hello, ${ctx.params.name}!` }))
app.post('/data', async (req, ctx) => { const body = await req.json(); return Response.json(body, { status: 201 }) })
app.use('/admin', authMW)                    // path-scoped middleware
app.use('/admin', adminRouter)               // sub-router (flattened into parent trie)
app.ws('/echo', { open(ws) { ws.send('connected') }, message(ws, _ctx, data) { ws.send(`echo: ${data}`) } })
app.onError((err, req, ctx) => Response.json({ error: err.message }, { status: 500 }))

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
| `layoutStack` | `rootLayout()` / `layout()` | `LayoutEntry[]` | React layout component stack |
| `loaderData` | User middleware | `Record<string, unknown>` | SSR data passed to client |
| `user` | `auth()` / `user().middleware()` | `{ id?: string }` | Authenticated user |
| `parsed` | `validate()` / `upload()` | `{ body, query, params, headers, files }` | Validated/parsed request data |
| `t` | `preferences()` | `(key) => string` | Translation function |
| `setPref` | `preferences()` | `(key, val) => Response` | Set preference cookie + redirect |
| `compiledTailwindCss` | `tailwind()` | `string` | Compiled CSS content (internal) |
| `tailwindCssUrl` | `tailwind()` | `string` | Compiled CSS route URL (internal) |

---

## Module Patterns

All modules follow one of **2 patterns** — learn these and you know every module.

| Pattern | How to mount | Example |
|---------|-------------|---------|
| `[α]` | `app.use(mod())` | `compress()`, `preferences()`, `postgres()` |
| `[β]` | `app.use('/path', mod())` | `health()`, `graphql(handler)`, `user()` |

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

```ts
// Raw SQL via tagged template
await pg.sql`SELECT * FROM users WHERE email = ${email}`

// Type-safe DDL
import { pgTable, serial, text, boolean, timestamps } from 'weifuwu'

const users = pgTable('_users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  active: boolean('active').default(true),
  ...timestamps(),
})
await users.create(pg.sql)
await users.createIndex(pg.sql, 'email')

// BoundTable — sql bound once, no need to pass sql to every call
const t = pg.table('_users', { id: serial('id'), name: text('name'), email: text('email'), ...timestamps() })
await t.insert({ name: 'Alice' })
// vs unbound Table — sql passed as first argument each time
// const t = pgTable('_users', { ... })
// await t.insert(pg.sql, { name: 'Alice' })
const { count, data } = await t.readMany({ role: 'admin' }, { orderBy: { name: 'asc' }, limit: 10 })
await t.upsert({ email: 'alice@test.com' }, 'email')

// Transactions
await pg.transaction(async (sql) => {
  const users = pg.table('_users', {}).withSql(sql)
  return users.insert({ name: 'Bob' })
})

// Soft delete — automatic if deleted_at column exists
await t.delete(1)       // SET deleted_at = NOW()
await t.hardDelete(1)   // DELETE FROM
await t.readMany()      // WHERE deleted_at IS NULL (use withDeleted: true to include)

// JSONB queries
const logs = pg.table('logs', { meta: jsonb<{ service: string }>('meta') })
await logs.readMany(contains('meta', { service: 'auth' }))

// Partitioned tables
await logs.create({ partitionBy: partitionBy('range', 'created_at') })
```

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

**BoundTable CRUD methods:**

| Method | Description |
|--------|-------------|
| `insert(data)` | INSERT + RETURNING \*, returns the inserted row |
| `insertMany(data)` | Bulk INSERT + RETURNING \*, returns rows |
| `read(id, opts?)` | SELECT by primary key, returns row or undefined |
| `readMany(where?, opts?)` | Filtered query with `{ count, data }` — auto-filters soft-deleted |
| `update(id, data)` | UPDATE by id + RETURNING \*, returns updated row |
| `updateMany(where, data)` | Bulk UPDATE, returns affected row count |
| `delete(id)` | Soft delete if `deleted_at` exists, else hard delete |
| `hardDelete(id)` | Always DELETE FROM |
| `deleteMany(where)` | Soft bulk delete if `deleted_at` exists |
| `hardDeleteMany(where)` | Always DELETE FROM |
| `upsert(data, conflict)` | INSERT ON CONFLICT DO UPDATE, returns row |
| `count(where?)` | SELECT COUNT(\*) |
| `create(opts?)` | CREATE TABLE IF NOT EXISTS |
| `drop(opts?)` | DROP TABLE IF EXISTS |
| `createIndex(columns, opts?)` | CREATE INDEX |
| `createUniqueIndex(columns)` | CREATE UNIQUE INDEX |
| `withSql(sql)` | Returns a new BoundTable bound to a different sql (for transactions) |

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

---

## React SSR (weifuwu)

Import from `'weifuwu'` (no separate ssr entry):

```ts
import { ssr, layout, rootLayout, errorBoundary, notFound } from 'weifuwu'
```

### rootLayout(dir) [α]

One-stop middleware for a page structure. Compiles `layout.tsx` and `app.css` from the given directory, and in dev mode registers vendor bundle, HMR WebSocket, and file watcher.

```ts
app.use(rootLayout('./ui'))
// Scans ./ui/layout.tsx → layout component
// Scans ./ui/app.css → tailwind CSS at /{mountPath}/__wfw/style/{hash}.css
// Dev: vendor bundle + HMR WS + file watcher
```

- Sets `ctx.layoutStack` (consumed by `ssr()`)
- Registers CSS route at `/__wfw/style/:hash.css` — Tailwind CSS compiled via `@tailwindcss/postcss` if `app.css` exists in the dir. Hash is content-based, ensuring cache invalidation on changes.
- Each `rootLayout` instance is independent — sub-routes can define their own

### layout(path) [β]

Compiles a `.tsx` file and returns middleware that pushes the layout component onto `ctx.layoutStack`. Pages rendered by `ssr()` consume this stack. Use after `rootLayout()` to extend a shared structure.

```ts
app.use(rootLayout('./ui'))
app.use(layout('./extra.tsx'))   // appended after rootLayout
```

Layout components receive `{ children }` (the child page or nested layout). Multiple layouts wrap from outer to inner in `use()` order.

### ssr(path) [β]

Compiles a `.tsx` file and returns a Router handler that renders the React component to HTML with streaming, client bundle injection, and context serialization.

```ts
app.get('/about', ssr('./ui/pages/about.tsx'))
```

- Compiles via esbuild at runtime (no build step)
- Reads `ctx.layoutStack` (set by `rootLayout()` or `layout()`) and wraps the component from outer to inner
- Injects hydration script pointing to the auto-generated client bundle at `/__ssr/{entryId}.js`
- Injects `<link>` for tailwind CSS from `ctx.tailwindCssUrl` (set by `rootLayout()`)
- Serializes middleware-injected `ctx` data to `window.__WEIFUWU_CTX` for client-side hydration
- **Dev mode:** uses `createRoot` instead of `hydrateRoot` — all hooks (`useState`, `useEffect`) work correctly; SSR content is still streamed for fast first paint
- **Prod mode:** uses `hydrateRoot` for full SSR hydration

### errorBoundary(path) [β]

Wraps child routes in an error boundary. If a page or middleware throws, the error component is rendered via SSR with head injection (CSS, theme, context) and layout wrapping.

```ts
app.use('/blog', errorBoundary('./blog-error.tsx'))
```

The error component receives `{ error, reset }` as props (`reset` is a no-op on the server):

```tsx
export default function BlogError({ error, reset }: { error: Error; reset: () => void }) {
  return <div><h2>Error</h2><p>{error.message}</p></div>
}
```

Error boundaries nest — the nearest one up the middleware chain catches the error.

### notFound(path) [β]

Returns a catch-all handler for 404 pages. When a path is given, the component is rendered via SSR with layout support. Falls back to plain text if compilation fails or no path given.

```ts
// No path — plain text
app.all('/*', notFound())

// Path to a .tsx component — renders via SSR
app.all('/*', notFound('./not-found.tsx'))
```

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

Auto-detected when `NODE_ENV !== 'production'`. `rootLayout(dir)` automatically registers vendor bundle, HMR WebSocket, and file watcher. No explicit setup needed.

When a `.tsx` or `.css` file changes under the `rootLayout` dir, the browser hot-updates without refreshing — `useState` values are preserved. Layout changes trigger a full page reload.

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
serve, createTestServer, Router,
Context, Handler, Middleware, ErrorHandler, ServeOptions, Server,
loadEnv
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
// Schema helpers — importable alongside postgres:
pgTable, SQL, sql,
ColumnBuilder, serial, uuid, text, integer, boolean, boolean_, timestamptz, jsonb, textArray, vector,
partitionBy, timestamps, toDDL, PartitionByDef,
Table, BoundTable, IndexOptions, FindOptions, CreateOptions,
eq, ne, gt, gte, lt, lte, isNull, isNotNull, like, contains, in_, and, or, not
```

### React SSR

```ts
ssr, layout, rootLayout, errorBoundary, notFound, clearCompileCache
```

### Client-side (from `'weifuwu/react'`)

```ts
TsxContext, useLoaderData,
useWebsocket, useAction, useFetch, useQueryState, createStore,
Link, useNavigate, useNavigating, addInterceptor,
useLocale, useTheme, applyTheme, useFlashMessage,
Head
```

### AI SDK (re-exported from `ai`)

```ts
streamText, generateText, streamObject, generateObject,
tool, embed, embedMany, smoothStream,
openai, createOpenAI
```

### Other modules

```ts
health, analytics, seo, seoMiddleware, seoTags,
user, mailer, graphql, aiStream, runWorkflow,
logdb, messager, agent, iii, createWorker, registerWorker,
opencode, deploy, defineConfig,
getCookies, setCookie, deleteCookie,
createSSEStream, formatSSE, formatSSEData
```

---

## License

MIT
