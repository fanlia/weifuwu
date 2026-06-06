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
import { serve, Router, tsx, preferences } from 'weifuwu'
const app = new Router()
app.use(preferences({ dir: './locales' }))
app.use('/', await tsx({ dir: './ui' }))
serve(app.handler(), { port: 3000 })
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

### Middleware

```ts
type Middleware = (req: Request, ctx: Context, next: Handler) => Response | Promise<Response>
app.use(mw)                          // global
app.use('/admin', mw)                // path-scoped
app.get('/admin', mw, handler)       // route-level
```

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
app.use('/health', health())                                    // no extras
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
| `.close()` | Cleanup |

### aiStream [β]

```ts
const chat = await aiStream(async (req) => ({ model: openai('gpt-4o'), messages: (await req.json()).messages }))
app.use('/chat', chat)
```

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

### auth [A]

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

### compress [A]

```ts
app.use(compress())                         // brotli > gzip > deflate (min 1KB)
app.use(compress({ threshold: 2048, level: 4 }))      // custom threshold and level
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `threshold` | `number` | `1024` | Minimum byte size to compress |
| `level` | `number` | `6` | Compression level (zlib) |

### cors [A]

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

### csrf [A]

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

### deploy

```ts
import { deploy, defineConfig } from 'weifuwu'
const config = defineConfig({
  domain: 'example.com',
  apps: {
    api: { repo: 'git@github.com:user/api.git', entry: 'app.ts', port: 3001, subdomain: 'api' },
  },
})
const server = await deploy(config)
// server.close(), server.ready, server.url
// server.apps.list(), server.apps.status(name), server.apps.deploy(name)
```

### health [β]

```ts
app.use('/health', health())
// Returns 200 on success, 503 when check throws
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `path` | `string` | `'/health'` | Health check endpoint |
| `check` | `() => Promise<void>` | — | Async function; throws → 503 |

### helmet [A]

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

### logger [A]

```ts
app.use(logger())                             // GET /hello 200 5ms
app.use(logger({ format: 'combined' }))       // with query params
```

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

### messager [C]

Real-time chat with channels, WebSocket, agent routing.

```ts
const msg = messager({ pg, agents, redis: redis() })
await msg.migrate()
app.ws('/ws', msg.wsHandler())
await msg.send(channelId, 'System message', { sender_type: 'system', sender_id: 'bot' })
```

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
| `model` | `object` | — | AI model |
| `baseURL` | `string` | — | OpenAI-compatible API base URL |
| `apiKey` | `string` | — | API key for the model |
| `workspace` | `string` | — | Project directory |
| `systemPrompt` | `string` | — | Custom system prompt |
| `skills` | `object[]` | — | Custom skill definitions |
| `permissions` | `object` | — | Tool permission rules |

### postgres [B]

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
// Type-safe DDL
const users = pgTable('_users', { id: serial('id').primaryKey(), name: text('name').notNull(), email: text('email').unique().notNull(), active: boolean('active').default(true), ...timestamps() })
await users.create()
await users.createIndex('email')

// BoundTable CRUD
const t = pg.table('_users', { ... })
await t.insert({ name: 'Alice' })
const { count, data } = await t.readMany({ role: 'admin' }, { orderBy: { name: 'asc' }, limit: 10 })
await t.upsert({ email: 'alice@test.com' }, 'email')
await pg.transaction(async (tx) => { const users = pg.table('_users', { ... }).withSql(tx); return users.insert({ name: 'Bob' }) })
```

Where helpers: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `isNull`, `isNotNull`, `like`, `contains`, `in_`, `and`, `or`, `not`.

### preferences [A]

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

### queue [B]

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

### rateLimit [B]

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

### redis [B]

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

### requestId [A]

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

### tenant [β]

Multi-tenant BaaS with dynamic table API and GraphQL.

```ts
const t = tenant({ pg, usersTable: '_users' })
await t.migrate()
app.use('/api', t.middleware())   // → ctx.tenant
app.use('/api', t)      // dynamic CRUD
app.use('/graphql', t.graphql()) // dynamic GraphQL
```

### upload [A]

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

### validate [A]

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

---

## React SSR (tsx)

```ts
app.use('/', await tsx({ dir: './ui/' }))
```

```
ui/
├── pages/
│   ├── page.tsx          → GET /
│   ├── layout.tsx        → root layout
│   ├── not-found.tsx     → 404
│   ├── about/page.tsx    → GET /about
│   ├── blog/[slug]/
│   │   ├── page.tsx      → GET /blog/:slug
│   │   ├── load.ts       → server data fetching
│   │   └── route.ts      → API (named exports: POST, PUT...)
│   ├── blog/layout.tsx   → nested layout
│   └── api/search/
│       └── route.ts      → GET /api/search
└── components/
```

```tsx
// page.tsx
export default function Page() {
  const { t } = useLocale()
  const data = useLoaderData()
  return <h1>{t('title') ?? data.title}</h1>
}
```

```tsx
// layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html><head/><body><main>{children}</main></body></html>
}
```

```ts
// load.ts — server-only data fetching
export default async function load({ params, query }) { return { data: await db.query(params.slug) } }
```

```ts
// route.ts — API co-located with page
export const POST: Handler = async (req, ctx) => Response.json({ slug: ctx.params.slug })
```

### Client-side navigation

```tsx
import { Link, useNavigate, useNavigating } from 'weifuwu/react'

<Link href="/about" prefetch>About</Link>   // client-side nav + prefetch on hover/visible
const navigate = useNavigate()               // programmatic: navigate('/contact')
const loading = useNavigating()              // reactive loading state
```

`navigate()` fetches SSR, extracts `__weifuwu_root`, replaces in-place. `load.ts` runs on server each nav.

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

**`useLoaderData()`** — Returns the data returned by `load.ts`. Update-triggered; re-renders on SPA navigation.

```tsx
import { useLoaderData } from 'weifuwu/react'
function Page() {
  const data = useLoaderData<{ post: { title: string } }>()
  return <h1>{data.post.title}</h1>
}
```

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

Auto-detected when `NODE_ENV !== 'production'`. File watching, live reload, Tailwind v4 auto-compile.

---

## AI

```ts
import { openai, streamText, generateText, streamObject, generateObject, tool, embed, embedMany } from 'weifuwu'
import { runWorkflow } from 'weifuwu'
```

### Streaming

```ts
const chat = await aiStream(async (req) => ({ model: openai('gpt-4o'), messages: (await req.json()).messages }))
app.use('/chat', chat)
```

### Agents

```ts
const agents = agent({ pg })
await agents.migrate()
app.use('/api', agents)
await agents.addKnowledge(agentId, 'Title', 'content')
```

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

## Utility Functions

### Common

| Function | Description |
|----------|-------------|
| `loadEnv(path?)` | Load `.env` into `process.env` |
| `serveStatic(root, opts?)` | Static file serving (20+ MIME, ETag, 304, path traversal protection) |
| `getCookies(req)` | Parse cookies |
| `setCookie(res, name, value, opts?)` | Set cookie |
| `deleteCookie(res, name, opts?)` | Delete cookie |
| `createTestServer(handler)` | `→ { server, url }` |

### AI re-exports

```ts
streamText, generateText, streamObject, generateObject,
tool, embed, embedMany, smoothStream,
openai, createOpenAI
```

### pgTable helpers

```ts
pgTable, pg.table,
serial, uuid, text, integer, boolean, timestamptz, jsonb, textArray, vector, timestamps,
eq, ne, gt, gte, lt, lte, isNull, isNotNull, like, contains, in_, and, or, not
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

```ts
import { createTestServer } from 'weifuwu'
const { server, url } = await createTestServer(handler)
const res = await fetch(`${url}/api/ping`)
```

---

## License

MIT
