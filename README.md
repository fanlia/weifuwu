# weifuwu

Web-standard HTTP microframework for Node.js — `(req, ctx) => Response`.

```bash
npm install weifuwu
```

```ts
import { serve, Router } from 'weifuwu'

const app = new Router()
app.get('/', () => new Response('Hello'))
serve(app, { port: 3000 })
```

## Exports

### Core

| Export | Description |
|---|---|
| `serve(app, opts?)` | Start HTTP server. Returns `Server` with `port`, `hostname`, `ready`, `close()`. |
| `Router` | Trie-based HTTP router with WebSocket support. |
| `HttpError` | `new HttpError(message, status)`. Throw to return that status code. |
| `DEFAULT_MAX_BODY` | `10 * 1024 * 1024` (10MB). |

### Router API

```ts
const app = new Router()

// HTTP methods
app.get(path, ...handlers)
app.post / put / delete / patch / head / options(path, ...handlers)
app.all(path, ...handlers)    // any method

// WebSocket
app.ws(path, ...middlewares, handler)
// handler: { open?, message?, close?, error? }

// Middleware & mounting
app.use(middleware)           // global middleware
app.mount(prefix, router)     // sub-router at prefix
app.onError(handler)          // error handler: (error, req, ctx) => Response
app.routes()                  // debug: list all registered routes

// Path params
app.get('/users/:id', (req, ctx) => {
  ctx.params.id   // string
  ctx.query.search // from ?search=...
})
```

### Middleware

| Export | Description |
|---|---|
| `cors(opts?)` | CORS headers. `origin`, `methods`, `headers`, `credentials`, `maxAge`. |
| `helmet(opts?)` | Security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, etc. |
| `compress(opts?)` | gzip / brotli / deflate response compression. |
| `rateLimit(opts?)` | Sliding-window rate limiter. `windowMs`, `max`, `keyGenerator`, Redis backend. |
| `logger(opts?)` | Request logging. `format: 'short' | 'combined' | 'json'`. |
| `upload(opts?)` | Multipart file upload via `req.formData()`. Injects `ctx.parsed`. |
| `serveStatic(root, opts?)` | Static file handler. `cacheControl`, `index`. |
| `trace(opts?)` | Injects `ctx.trace = { requestId, traceId, elapsed(), startTime }`. |

### Tracing

| Export | Description |
|---|---|
| `currentTraceId()` | Current request's trace ID (AsyncLocalStorage). |
| `currentTrace()` | Current trace context `{ traceId, startTime }`. |
| `runWithTrace(id, fn)` | Run `fn` in a trace context. Auto-generates UUID if id is null. |
| `traceElapsed()` | Milliseconds since trace start. |
| `trace(opts?)` | Middleware that injects `ctx.trace`. |

### Postgres

```ts
import { postgres, MIGRATIONS_TABLE } from 'weifuwu'

const sql = postgres({ url: process.env.DATABASE_URL })
app.use(sql)  // injects ctx.sql

const rows = await sql.sql`SELECT * FROM users WHERE id = ${id}`

// Migrations
await sql.migrate({
  '001_init': async (s) => await s`CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT)`,
})
```

### Redis

```ts
import { redis } from 'weifuwu'

const r = redis({ url: process.env.REDIS_URL })
app.use(r)  // injects ctx.redis
await r.redis.set('key', 'value')
```

### Queue & Cron

```ts
import { queue } from 'weifuwu'

const q = queue()
app.use(q)  // injects ctx.queue

q.process('email', async (job) => {
  await sendEmail(job.payload.to)
})

q.cron('cleanup', '0 3 * * *', async () => {
  await cleanupOldSessions()
})

await q.add('email', { to: 'user@example.com' })
await q.add('remind', {}, { delay: 60_000 })
await q.add('report', {}, { schedule: '0 9 * * 1' })

q.run()  // start processing
```

### WebSocket Hub

```ts
import { createHub } from 'weifuwu'

const hub = createHub()
app.ws('/chat', {
  open(ws, ctx) {
    ctx.ws.join('lobby')
    ctx.ws.json({ type: 'join' })
  },
  message(ws, ctx, data) {
    ctx.ws.sendRoom('lobby', { text: data.toString() })
  },
})
```

### GraphQL

```ts
import { graphql } from 'weifuwu'

const gql = graphql((req, ctx) => ({
  schema: `
    type Query {
      hello: String
      user(id: ID!): User
    }
    type User {
      id: ID
      name: String
    }
  `,
  resolvers: {
    Query: {
      hello: () => 'world',
      user: (_, { id }) => ctx.sql`SELECT * FROM users WHERE id = ${id}`.then(r => r[0]),
    },
  },
  graphiql: true,
}))

app.mount('/graphql', gql)
```

### React SSR

> Requires `react >= 19`, `react-dom >= 19` (optional peerDependencies).

```bash
npm install react react-dom
```

```ts
import { react, Link, useServerData, ErrorBoundary } from 'weifuwu'
import { createElement as h } from 'react'

// ── Server ──────────────────────────────────────────────

app.use(react({
  layout: ({ children }) =>
    h('html', null,
      h('head', null, h('title', null, 'My App')),
      h('body', null, h('div', { id: 'root' }, children)),
    ),
}))

// Render React components to HTML
app.get('/', (_req, ctx) =>
  ctx.render(h('h1', null, 'Hello SSR'), {
    head: { title: 'Home' },
    data: { greeting: 'Hello' },
  })
)

// Streaming SSR
app.get('/dashboard', (_req, ctx) =>
  ctx.renderStream(h(Dashboard))
)

// Layout nesting via mount
const admin = new Router()
admin.use(react({ layout: AdminLayout }))
admin.get('/dashboard', (_req, ctx) => ctx.render(h(AdminDashboard)))
app.mount('/admin', admin)

// ── Shared components ──────────────────────────────────

// Use the same component on server and client
function Page() {
  const { greeting } = useServerData<{ greeting: string }>()
  return h('h1', null, greeting)
}

// Link works on both sides: <a> on server, SPA <a> on client
function Nav() {
  return h('nav', null,
    h(Link, { href: '/' }, 'Home'),
    h(Link, { href: '/users' }, 'Users'),
  )
}

// ErrorBoundary catches client-side render errors
function SafeUserProfile() {
  return h(ErrorBoundary, { fallback: h('div', null, 'Error') },
    h(UserProfile),
  )
}

// ── Client (SPA navigation) ────────────────────────────

// client.ts — bundled separately with esbuild
import { hydrate, createClientRouter, defineRoute } from 'weifuwu/react/client'

const userRoute = defineRoute({
  path: '/users/:id',
  component: UserPage,
  loader: (params) => fetch(`/users/${params.id}?_data`).then(r => r.json()),
})

const router = createClientRouter([
  { path: '/', component: HomePage },
  userRoute,
])

hydrate(router.App)
```

**Key concepts:**

| Feature | Description |
|---|---|
| `ctx.render(el, opts)` | Render React to HTML. Auto-detects `?_data` → returns JSON. |
| `ctx.renderStream(el)` | Streaming SSR via `renderToReadableStream`. |
| `useServerData<T>()` | Access data on both server (via `ctx.render({ data })`) and client (via `loader`). |
| `Link` | Shared component — `<a>` on server, SPA `<a>` on client. |
| `Form` | Shared — `<form>` on server, `fetch` + revalidate on client. |
| `ErrorBoundary` | Catches render errors on client (SSR uses `onError`). |
| `useNavigation()` | `{ state: 'idle' \| 'loading' }` for progress indicators. |
| `useParams()` / `useNavigate()` / `useRevalidate()` | Router hooks. |
| `defineRoute()` | Type-safe route config — captures loader return type. |
| `createClientRouter()` | Client-side SPA router with loader-based data fetching. |
| `hydrate(App)` | Hydrate server-rendered HTML on the client. |
| `head: { title, meta }` | Inject dynamic `<title>` and `<meta>` tags. |

**Import paths:**

```ts
// Server-side
import { react, Link, Form, ErrorBoundary, useServerData } from 'weifuwu'

// Client-side (for browser bundles)
import { hydrate, createClientRouter, defineRoute, Link } from 'weifuwu/react/client'

// Shared primitives (safe for both, pure React — no react-dom import)
import { Link, Form, useServerData, useParams, useNavigation } from 'weifuwu/react/navigation'
```

See [examples/react-ssr/](examples/react-ssr/) for a complete demo.

### Types

| Export | Description |
|---|---|
| `Context` | `{ params, query, mountPath?, [key: string] }` |
| `Handler<T>` | `(req: Request, ctx: T) => Response \| Promise<Response>` |
| `Middleware` | `(req, ctx, next) => Response \| Promise<Response>` |
| `WebSocketHandler` | `{ open?, message?, close?, error? }` |
| `HttpError` | `Error` subclass with `.status: number` |
| `Closeable` | `{ close(): Promise<void> }` |
| `Server` | `{ close, port, hostname, ready }` |
| `ServeOptions` | `{ port, hostname, signal, maxBodySize, timeout, keepAliveTimeout, headersTimeout, shutdown }` |

## Handler / Middleware patterns

```ts
// Handler — standard Web API
app.get('/api/data', (req, ctx) => {
  const q = ctx.query.q
  return Response.json({ q })
})

// Async
app.get('/db/users', async (req, ctx) => {
  const rows = await ctx.sql`SELECT * FROM users`
  return Response.json(rows)
})

// Throwing HttpError
app.get('/item/:id', (req, ctx) => {
  const item = db.get(ctx.params.id)
  if (!item) throw new HttpError('Not found', 404)
  return Response.json(item)
})

// Middleware
app.use(async (req, ctx, next) => {
  const start = Date.now()
  const res = await next(req, ctx)
  console.log(`${req.method} ${req.url} ${Date.now() - start}ms`)
  return res
})

// Error handler
app.onError((err, req, ctx) => {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status })
  }
  return new Response('Internal error', { status: 500 })
})
```

## Complete example

```ts
import { serve, Router, cors, helmet, compress, logger, trace, rateLimit, postgres, redis, queue, HttpError } from 'weifuwu'

const app = new Router()

// Global middleware
app.use(trace())
app.use(logger())
app.use(cors())
app.use(helmet())
app.use(compress())
app.use(rateLimit({ windowMs: 60_000, max: 100 }))

// Database
const sql = postgres()
app.use(sql)

// Routes
app.get('/api/users', async (req, ctx) => {
  const users = await ctx.sql`SELECT id, name FROM users ORDER BY id`
  return Response.json(users)
})

app.post('/api/users', async (req, ctx) => {
  const { name, email } = await req.json()
  const [user] = await ctx.sql`INSERT INTO users (name,email) VALUES (${name},${email}) RETURNING *`
  return Response.json(user, { status: 201 })
})

app.get('/api/users/:id', async (req, ctx) => {
  const [user] = await ctx.sql`SELECT * FROM users WHERE id = ${ctx.params.id}`
  if (!user) throw new HttpError('Not found', 404)
  return Response.json(user)
})

// WebSocket
app.ws('/chat', {
  open(ws, ctx) { ctx.ws.join('lobby') },
  message(ws, ctx, data) { ctx.ws.sendRoom('lobby', { text: data.toString() }) },
})

// Error handling
app.onError((err) => {
  if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status })
  return Response.json({ error: 'Internal error' }, { status: 500 })
})

serve(app, { port: 3000 })
```

## Project Structure

```
weifuwu/
├── package.json
├── tsconfig.json
├── docker-compose.yml      ← postgres + redis for tests
├── scripts/
│   ├── build.mjs
│   └── release.mjs
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── core/               ← serve, router, ws, trace, logger
│   ├── middleware/          ← cors, helmet, compress, rate-limit, static, upload
│   ├── postgres/
│   ├── redis/
│   ├── react/              ← react SSR (render, navigation, client)
│   ├── queue/              ← cron, index, types
│   ├── graphql.ts
│   ├── hub.ts
│   └── test/               ← 131 tests (18 files)
├── examples/
│   └── react-ssr/          ← full SPA demo
└── dist/
```

## Development

```bash
npm run build          # esbuild → dist/index.js
npm run typecheck      # tsc --noEmit
npm test              # 131 tests (requires docker compose)
```
