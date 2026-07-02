# weifuwu

Web-standard HTTP microframework for Node.js — `(req, ctx) => Response`.

## Usage

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

Everything is exported from `'weifuwu'`:

### Core

| Export | Kind | Description |
|---|---|---|
| `serve(app, opts?)` | function | Start HTTP server. Takes a `Router`. Returns `Server`. |
| `Router` | class | Trie-based HTTP router with WebSocket support. |
| `loadEnv(path?)` | function | Load `.env` file into `process.env`. |
| `isDev()` | function | `true` unless `NODE_ENV` is `production` or `test`. |
| `isProd()` | function | `true` if `NODE_ENV` is `production`. |
| `isBundled()` | function | `true` when running the esbuild bundle (checks `__WFW_BUNDLED__`). |
| `getPublicEnv()` | function | Returns all `process.env` keys prefixed with `WEIFUWU_PUBLIC_`. |
| `DEFAULT_MAX_BODY` | const | `10 * 1024 * 1024` (10MB). |

### Router

```ts
const app = new Router()

// HTTP methods
app.get(path, ...handlers)
app.post(path, ...handlers)
app.put(path, ...handlers)
app.delete(path, ...handlers)
app.patch(path, ...handlers)
app.head(path, ...handlers)
app.options(path, ...handlers)
app.all(path, ...handlers)    // match any method

// WebSocket
app.ws(path, ...middlewares, handler)
// handler: { open?, message?, close?, error? }

// Middleware & mounting
app.use(middleware)           // global middleware
app.mount(prefix, router)     // mount sub-router at prefix
app.onError(handler)          // global error handler
app.routes()                  // debug: string[] of all registered routes

// Path params
app.get('/users/:id', (req, ctx) => {
  const id = ctx.params.id   // string
  const q = ctx.query.search // from ?search=...
})
```

### Middleware

| Export | Kind | Description |
|---|---|---|
| `cors(opts?)` | middleware | CORS headers. `origin`, `methods`, `headers`, `credentials`, `maxAge`. |
| `helmet(opts?)` | middleware | Security headers (CSP, HSTS, X-Frame-Options, etc). |
| `compress(opts?)` | middleware | gzip / brotli / deflate response compression. |
| `rateLimit(opts?)` | middleware | Sliding-window rate limiter. `windowMs`, `max`, `keyGenerator`. |
| `requestId(opts?)` | middleware | Generates `X-Request-ID` header. `header`, `generator`. |
| `logger(opts?)` | middleware | Structured request logging. `format`, `level`, `stream`. |
| `upload(opts?)` | middleware | Multipart file upload. `maxSize`, `dest`, `preservePath`. |
| `health(opts?)` | function→Router | Health check router. Mount at `/_health` or custom path. |
| `env()` | middleware | Injects `WEIFUWU_PUBLIC_*` env vars into `ctx.env`. |
| `trace(opts?)` | middleware | Injects trace context into `ctx.trace` (requestId, traceId, startTime, elapsed). |

### Route-level tools

| Export | Kind | Description |
|---|---|---|
| `serveStatic(root, opts?)` | handler | Serve static files. `cacheControl`, `index`, `dotfiles`. |
| `graphql(options)` | function→Router | GraphQL endpoint. Pass a `GraphQLHandler` function `({ query, variables, ctx })`. |

### HTML rendering

| Export | Kind | Description |
|---|---|---|
| `html(template, ...values)` | tagged template | Auto-escaped HTML builder. Signal/Computed-aware. |
| `raw(content)` | function | Raw unescaped HTML string (use with caution). |

### SSE (Server-Sent Events)

| Export | Kind | Description |
|---|---|---|
| `createSSEStream()` | function | Create an SSE stream controller for `text/event-stream` responses. |
| `formatSSE(event, data)` | function | Format a single SSE event string. |
| `formatSSEData(data)` | function | Format SSE data string. |

### Cookies

| Export | Kind | Description |
|---|---|---|
| `getCookies(req)` | function | Parse cookies from `Request`. Returns `Record<string, string>`. |
| `setCookie(headers, name, value, opts?)` | function | Set `Set-Cookie` header. `path`, `domain`, `maxAge`, `httpOnly`, `secure`, `sameSite`, `partitioned`. |
| `deleteCookie(headers, name, opts?)` | function | Delete a cookie (Max-Age=0). |

### Postgres

| Export | Kind | Description |
|---|---|---|
| `postgres(opts?)` | middleware+client | Create a Postgres client. `url`, `host`, `port`, `database`, `user`, `password`, `max`. |
| `MIGRATIONS_TABLE` | const | Migration table name: `_weifuwu_migrations`. |

```ts
const sql = postgres({ url: process.env.DATABASE_URL })

// As middleware — injects ctx.sql
app.use(sql)
// As query client
const rows = await sql.client`SELECT * FROM users WHERE id = ${id}`

// Migrations
await sql.migrate({
  '001_init': async (s) => {
    await s`CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT)`
  },
})
```

### Redis

| Export | Kind | Description |
|---|---|---|
| `redis(opts?)` | middleware+client | Create a Redis client (ioredis). `url`, `host`, `port`, `password`, `db`. |

```ts
const r = redis({ url: process.env.REDIS_URL })
app.use(r)  // injects ctx.redis
await r.client.set('key', 'value')
```

### Queue & Cron

| Export | Kind | Description |
|---|---|---|
| `queue(opts?)` | middleware+instance | In-process job queue with cron support. `concurrency`. |

```ts
const q = queue({ concurrency: 3 })
app.use(q)  // injects ctx.queue

q.process('send-email', async (job) => {
  await sendEmail(job.data.to)
})

q.cron('cleanup', '0 3 * * *', async () => {
  await cleanupOldSessions()
})

await q.add('send-email', { to: 'user@example.com' })
```

### WebSocket Hub

| Export | Kind | Description |
|---|---|---|
| `createHub(opts?)` | function | Pub/Sub hub for cross-connection broadcast. Supports Redis adapter for multi-process. |

```ts
const hub = createHub()
app.ws('/chat', {
  open(ws, ctx) {
    ctx.ws.join('lobby')
    ctx.ws.json({ type: 'join', room: 'lobby' })
  },
  message(ws, ctx, data) {
    ctx.ws.sendRoom('lobby', { type: 'chat', text: data.toString() })
  },
})
```

### Theme & I18n

| Export | Kind | Description |
|---|---|---|
| `theme(opts?)` | middleware+Router | Theme middleware. Injects `ctx.theme` with `get()`, `set(theme)`, `toggle()`. Routes: `/__theme/:theme`. |
| `i18n(opts?)` | middleware+Router | I18n middleware. Injects `ctx.i18n` with `locale`, `t(key, params?)`, `set(locale)`. `dir` for locale JSON files. Routes: `/__lang/:locale`. |
| `flash()` | middleware | Flash messages. Injects `ctx.flash` with `set(msg)`, `get()`. One-time messages across redirects. |
| `csrf()` | middleware | CSRF protection. Injects `ctx.csrf` with `token`. Auto-validates on `POST`/`PUT`/`PATCH`/`DELETE`. |

### Tracing

| Export | Kind | Description |
|---|---|---|
| `currentTraceId()` | function | Get current request's trace ID (from AsyncLocalStorage). |
| `currentTrace()` | function | Get current trace context `{ traceId, startTime }`. |
| `runWithTrace(id, fn)` | function | Run `fn` with a trace context. Auto-generates ID if null. |
| `traceElapsed()` | function | Milliseconds since trace start. |

### Error handling

| Export | Kind | Description |
|---|---|---|
| `HttpError` | class | `new HttpError(message, status)`. Throw to return that status. |
| `app.onError(handler)` | Router method | Global error handler: `(error, req, ctx) => Response`. |

### Types

| Export | Description |
|---|---|
| `Context` | `{ params, query, mountPath?, user?, loaderData?, env?, [key: string] }` |
| `Handler<T>` | `(req: Request, ctx: T) => Response \| Promise<Response>` |
| `Middleware<In, Out>` | `(req, ctx, next) => Response \| Promise<Response>` |
| `WebSocketHandler` | `{ open?, message?, close?, error? }` |
| `HttpError` | `Error` subclass with `.status: number` |
| `Closeable` | `{ close(): Promise<void> }` |
| `Server` | `{ stop, close, port, hostname, ready }` |
| `ServeOptions` | `{ port, hostname, signal, maxBodySize, timeout, keepAliveTimeout, headersTimeout, shutdown }` |

## Handler / Middleware patterns

```ts
// Handler — standard Web API
app.get('/api/data', (req, ctx) => {
  const { q } = ctx.query
  const id = ctx.params.id
  return Response.json({ q, id })
})

// Async
app.get('/db/users', async (req, ctx) => {
  const rows = await sql`SELECT * FROM users`
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

// Route-level middleware (before handler)
app.get('/admin', validate(bodySchema), authCheck, adminHandler)

// Error handler
app.onError((err, req, ctx) => {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status })
  }
  console.error(err)
  return new Response('Internal error', { status: 500 })
})
```

## Complete example

```ts
import { serve, Router, loadEnv, cors, helmet, compress, logger, requestId, rateLimit, postgres, redis, queue, HttpError, html } from 'weifuwu'

loadEnv()

const app = new Router()

// Global middleware
app.use(requestId())
app.use(logger())
app.use(cors())
app.use(helmet())
app.use(compress())
app.use(rateLimit({ windowMs: 60_000, max: 100 }))

// Database & services
const sql = postgres({ url: process.env.DATABASE_URL })
const cache = redis({ url: process.env.REDIS_URL })
const jobs = queue()

app.use(sql)
app.use(cache)
app.use(jobs)

// Routes
app.get('/', () => html`<h1>weifuwu</h1><p>Running on ${process.version}</p>`)

app.get('/api/users', async (req, ctx) => {
  const users = await ctx.sql`SELECT id, name, email FROM users ORDER BY id`
  return Response.json(users)
})

app.get('/api/users/:id', async (req, ctx) => {
  const [user] = await ctx.sql`SELECT * FROM users WHERE id = ${ctx.params.id}`
  if (!user) throw new HttpError('User not found', 404)
  return Response.json(user)
})

app.post('/api/users', async (req, ctx) => {
  const { name, email } = await req.json()
  const [user] = await ctx.sql`INSERT INTO users (name, email) VALUES (${name}, ${email}) RETURNING *`
  return Response.json(user, { status: 201 })
})

// Background job
jobs.process('welcome-email', async (job) => {
  const { userId } = job.data
  const [user] = await sql.client`SELECT * FROM users WHERE id = ${userId}`
  await sendWelcomeEmail(user.email)
})

app.post('/api/register', async (req, ctx) => {
  const { name, email } = await req.json()
  const [user] = await ctx.sql`INSERT INTO users (name, email) VALUES (${name}, ${email}) RETURNING *`
  await ctx.queue.add('welcome-email', { userId: user.id })
  return Response.json(user, { status: 201 })
})

// WebSocket chat
app.ws('/chat', {
  open(ws, ctx) {
    ctx.ws.join('lobby')
  },
  message(ws, ctx, data) {
    ctx.ws.sendRoom('lobby', { text: data.toString() })
  },
})

// Error handling
app.onError((err, req, ctx) => {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status })
  }
  return Response.json({ error: 'Internal error' }, { status: 500 })
})

// Health check
import { health } from 'weifuwu'
app.mount('/_health', health())

serve(app, { port: 3000 })
```

## Project Structure

```
weifuwu/
├── package.json
├── tsconfig.json
├── scripts/
│   ├── build.mjs
│   └── release.mjs
├── src/
│   ├── index.ts              ← all exports
│   ├── types.ts              ← Context, Handler, Middleware, HttpError
├── core/                 ← serve, router, trace, env, logger, cookie, sse, html
│   ├── middleware/        ← cors, compress, helmet, rate-limit, static, validate, upload, health, theme, i18n, flash, csrf, request-id
├── postgres/             ← postgres client, migrations, module injection
│   ├── redis/                ← redis client
│   ├── queue/                ← job queue, cron
│   ├── graphql.ts            ← schema-first GraphQL handler
│   ├── hub.ts                ← pub/sub hub (WebSocket rooms)
└── dist/
```

## Development

```bash
npm run build          # esbuild bundle → dist/index.js
npm run typecheck      # tsc --noEmit
```
