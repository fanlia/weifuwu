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

All modules follow one of 5 patterns. The pattern letter is marked in each module's heading.

| Pattern | How to mount | Example |
|---------|-------------|---------|
| `[A]` | `app.use(mod())` | `compress()`, `preferences()` |
| `[B]` | `app.use(mod())` + call `.stop()` / `.close()` etc. | `rateLimit({...})` |
| `[C]` | `app.use(mod.middleware())` + `app.use('/', mod.router())` | `analytics()`, `user()` |
| `[D]` | `app.use(mod().handler())` | `health()`, `seo()` |
| `[E]` | `app.use('/', g.router().handler())` | `graphql(handler)` |

---

## Module Reference

### agent [C]

```ts
const a = agent({ pg })
await a.migrate()
app.use('/api', a.router())
await a.addKnowledge(agentId, 'Title', 'docs')
a.run(agentId, { task: 'summarize' })
```

### aiStream [E]

```ts
const chat = await aiStream(async (req) => ({ model: openai('gpt-4o'), messages: (await req.json()).messages }))
app.use('/chat', chat.router().handler())
```

### analytics [C]

In-memory or PostgreSQL page view tracking with built-in dashboard.

```ts
const a = analytics()
app.use(a.middleware())
app.use('/', a.router())       // GET /__analytics (dashboard), GET /__analytics/data?days=7 (JSON)
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
app.use('/', a.router())
```

### auth [A]

```ts
app.use(auth({ token: 'sk-123' }))                              // static token
app.use(auth({ header: 'X-API-Key', token: 'my-key' }))         // custom header
app.use(auth({ verify: async (token) => ({ sub: 'abc' }) }))    // custom verify
app.get('/protected', auth({ proxy: 'http://auth:3000/validate' }), handler)
```

### compress [A]

```ts
app.use(compress())                         // brotli > gzip > deflate
app.use(compress({ threshold: 2048 }))      // only > 2KB
```

### cors [A]

```ts
app.use(cors())                                            // allow all
app.use(cors({ origin: ['https://example.com'] }))         // whitelist
app.use(cors({ origin: (o) => o.endsWith('.trusted.com') && o }))
app.use(cors({ credentials: true, maxAge: 3600 }))
```

### csrf [A]

```ts
app.use(csrf())
// ctx.csrfToken available in handlers
// Auto-validates X-CSRF-Token header on POST/PUT/DELETE/PATCH
```

| Option | Default | Description |
|--------|---------|-------------|
| `cookie` | `'_csrf'` | Cookie name |
| `header` | `'x-csrf-token'` | Header name |
| `key` | `'_csrf'` | Body field fallback |
| `excludeMethods` | `['GET','HEAD','OPTIONS']` | Skip validation |

### deploy

```ts
import { deploy, defineConfig } from 'weifuwu'
const config = defineConfig({ apps: [{ name: 'api', dir: './api', domain: 'api.example.com', port: 3001 }] })
await deploy(config)
```

### health [D]

```ts
app.use(health())                         // GET /health → 200
app.use(health({ checks: { db: async () => { await pg.sql`SELECT 1`; return { ok: true } } } }))
```

### helmet [A]

13 security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, etc.

```ts
app.use(helmet())
app.use(helmet({ contentSecurityPolicy: "default-src 'self'", xFrameOptions: 'DENY' }))
```

### iii [C] — Worker / Function / Trigger

```ts
const engine = iii({ pg, redis })
app.use('/iii', engine.router())

const w = createWorker('orders')
w.registerFunction('orders::create', async (payload) => db.query('INSERT INTO orders ...', [payload.items]))
engine.addWorker(w)
await engine.trigger({ function_id: 'orders::create', payload: { items: ['apple'] } })
```

| Method | Description |
|--------|-------------|
| `.addWorker(w)` | Register a worker |
| `.trigger({ function_id, payload, action? })` | Invoke a function (sync or void) |
| `.router()` | REST + WS API |

### logdb [C]

PostgreSQL structured event logging with monthly partitioning.

```ts
const logger = logdb({ pg })
await logger.migrate()
app.use('/logs', logger.router())
await logger.clean(12)   // drop partitions older than 12 months
await logger.log({ level: 'info', source: 'app', message: 'hello' })
```

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
const mail = mailer({ host: 'smtp.example.com', port: 587, auth: { user, pass } })
await mail.send({ to: 'user@test.com', subject: 'Hello', text: 'Body', html: '<p>Body</p>' })
```

### messager [C]

Real-time chat with channels, WebSocket, agent routing.

```ts
const msg = messager({ pg, agents, redis: redis() })
await msg.migrate()
app.ws('/ws', u.middleware(), msg.wsHandler())
await msg.send(channelId, 'System message', { sender_type: 'system' })
```

### opencode [C]

AI programming assistant.

```ts
const oc = await opencode({ pg, permissions: { bash: { allow: true }, write: { allow: false } } })
await oc.migrate()
app.use('/opencode', await oc.router())
app.ws('/opencode', oc.wsHandler())
```

### postgres [B]

```ts
const pg = postgres()          // reads DATABASE_URL
app.use(pg)                    // injects ctx.sql
```

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
await q.add('send-email', { to: 'user@test.com' }, { cron: '0 8 * * *' })
```

### rateLimit [B]

```ts
app.use(rateLimit({ max: 100, window: 60_000 }))            // 100 req/min
app.get('/api', rateLimit({ max: 10 }), handler)            // per-route
app.use(rateLimit({ key: (req) => req.headers.get('x-api-key') ?? 'anonymous' }))
// m.stop() — clear interval
```

### redis [B]

```ts
const r = redis()        // reads REDIS_URL
app.use(r)               // injects ctx.redis
await ctx.redis.set('key', 'value')
// r.close() — cleanup
```

### requestId [A]

```ts
app.use(requestId())
// Sets X-Request-ID header on responses, available as ctx.requestId
```

### seo [D] + seoMiddleware [A]

```ts
app.use(seo({ baseUrl: 'https://example.com', robots: [{ userAgent: '*', allow: '/' }], sitemap: { urls: [{ loc: '/' }] } }))
// GET /robots.txt, GET /sitemap.xml

app.use(seoMiddleware({ headers: { 'X-Robots-Tag': (path) => path.startsWith('/admin') ? 'noindex' : undefined } }))
```

### tenant [C]

Multi-tenant BaaS with dynamic table API and GraphQL.

```ts
const t = tenant({ pg, usersTable: '_users' })
await t.migrate()
app.use('/api', t.middleware())   // → ctx.tenant
app.use('/api', t.router())      // dynamic CRUD
app.use('/graphql', t.graphql()) // dynamic GraphQL
```

### upload [A]

```ts
app.post('/upload', upload({ dir: './uploads', maxFileSize: 10_485_760 }), (req, ctx) => {
  // ctx.parsed.files.avatar → { name, type, size, path }
  // ctx.parsed.fields.title → 'hello'
})
```

### user [C]

```ts
const auth = user({ pg, jwtSecret: process.env.JWT_SECRET! })
await auth.migrate()
app.use('/auth', auth.router())               // POST /register, POST /login
app.get('/me', auth.middleware(), (req, ctx) => Response.json(ctx.user))
```

### validate [A]

```ts
import { z } from 'zod'
const CreateUser = z.object({ name: z.string().min(1), email: z.string().email() })
app.post('/users', validate({ body: CreateUser }), (req, ctx) => {
  // ctx.parsed.body — typed & validated
})
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
export default function Page({ params, query }: { params: { slug: string }; query: Record<string, string> }) {
  const { t } = useCtx()
  return <h1>{t('title')}</h1>
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
import { useWebsocket, useAction, useData, useQueryState, createStore, Head, setCtx } from 'weifuwu/react'
import { useLocale, useTheme, applyTheme, addInterceptor } from 'weifuwu/react'

// WebSocket — auto-reconnecting
const { send, lastMessage, readyState } = useWebsocket('/ws/chat', { onMessage: (d) => console.log(d), reconnect: { maxRetries: 10, delay: 3000 } })

// Form action
const { submit, data, error, pending } = useAction('/api/feedback', { method: 'POST' })
// Auto-reads _csrf cookie, sends as X-CSRF-Token

// Data fetching — cache + dedup + mutate
const { data, error, loading, mutate } = useData('/api/posts', { fallback: loadData })

// URL query state
const [q, setQ] = useQueryState('q', '')
const [page, setPage] = useQueryState('page', '1')

// Shared state — persists across client navs
const useStore = createStore({ count: 0 })
const count = useStore(s => s.count)

// Per-page meta tags
<Head><title>Page Title</title><meta name="description" content="..." /></Head>

// Update context (locale switch etc.)
setCtx({ locale: 'en', prefs: { locale: 'en' } })
```

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
| `t` | Translation function (same as `useCtx().t`) |

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
// Server
return ctx.setPref('flash', JSON.stringify({ type: 'success', message: 'Done' }))  // 302 + Set-Cookie

// Client (tsx)
function Toast() { const { prefs } = useCtx(); const flash = prefs?.flash ? JSON.parse(prefs.flash) : null; ... }
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
app.use('/chat', chat.router().handler())
```

### Agents

```ts
const agents = agent({ pg })
await agents.migrate()
app.use('/api', agents.router())
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
