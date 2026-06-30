# weifuwu

**Web-standard HTTP microframework for Node.js** — `(req, ctx) => Response`

Pure Node.js, no build step. Native TypeScript via Node.js 24+.

```
npm install weifuwu
```

---

## Quick start

```ts
import { serve, Router } from 'weifuwu'

const app = new Router()
app.get('/', () => new Response('Hello world!'))
app.get('/api/ping', () => Response.json({ pong: true }))

serve(app.handler(), { port: 3000 })
```

## Core concepts

### Handler

```ts
type Handler = (req: Request, ctx: Context) => Response | Promise<Response>
```

Standard `Request` in, standard `Response` out. No framework-specific request/response objects.

### Router

```ts
const app = new Router()
app.get('/users', handler)
app.post('/users', handler)
app.get('/users/:id', handler)
app.ws('/chat', { message(ws, ctx, data) { ... } })
```

Returns a `handler()` function compatible with `serve()`.

### Middleware

```ts
type Middleware = (req: Request, ctx: Context, next: Handler) => Response | Promise<Response>
```

Middleware enriches `ctx` with additional properties:

```ts
app.use(postgres()) // → ctx.sql
app.use(redis()) // → ctx.redis
app.use(aiProvider()) // → ctx.ai
app.use(queue()) // → ctx.queue
app.use(cors())
app.use(rateLimit({ window: 60 }))
```

---

## Public API

### serve

```ts
import { serve } from 'weifuwu'

const server = serve(handler, {
  port: 3000, // default: 3000
  websocket: wsHandler, // optional WebSocket handler from Router
  shutdown: true, // graceful shutdown on SIGTERM/SIGINT (default: true)
  maxBody: 1024 * 1024, // max request body size (default: 1MB)
})
```

Returns `{ close(): Promise<void> }`.

### Router

```ts
import { Router } from 'weifuwu'

const r = new Router()

// HTTP methods
r.get(path, handler)
r.post(path, handler)
r.put(path, handler)
r.patch(path, handler)
r.delete(path, handler)
r.head(path, handler)
r.options(path, handler)

// Middleware (applied to all routes)
r.use(middleware)           // global middleware
r.use('/prefix', middleware) // scoped to prefix

// WebSocket
r.ws(path, {
  open(ws, ctx) { ... },
  message(ws, ctx, data) { ... },
  close(ws, ctx) { ... },
})

// Compose
r.handler()                  // → (req, ctx) => Response (for serve())
r.websocketHandler()         // → WebSocket upgrade handler
```

### Context

```ts
interface Context {
  params: Record<string, string> // URL parameters
  query: Record<string, string> // query string
  mountPath?: string // prefix path if mounted under Router.use()
  [key: string]: unknown // middleware-injected fields
}
```

### Middleware modules

#### postgres()

```ts
import { postgres } from 'weifuwu'

app.use(postgres({ connection: process.env.DATABASE_URL }))
// ctx.sql → SqlClient

const rows = await ctx.sql`SELECT * FROM users WHERE id = ${id}`
```

Includes table builder and migrations:

```ts
const { sql, migrate } = postgres({ connection: '...' })
await migrate() // run all pending migrations
await sql.close()
```

Options: `connection`, `max`, `ssl`, `idle_timeout`, `connect_timeout`, `statementTimeout`, `onQuery`, `signal`, `closeTimeout`

Types:

- `PostgresOptions`, `PostgresClient`, `PostgresInjected`, `SqlClient`, `Sql`

#### redis()

```ts
import { redis } from 'weifuwu'

app.use(redis({ url: process.env.REDIS_URL }))
// ctx.redis → Redis client

await ctx.redis.set('key', 'value')
const val = await ctx.redis.get('key')
```

Options: `url`, `host`, `port`, `password`, `db`, `keyPrefix`, `maxRetriesPerRequest`, `enableReadyCheck`, `lazyConnect`, `retryStrategy`

Types: `RedisOptions`, `RedisClient`, `RedisInjected`, `Redis`

#### aiProvider()

```ts
import { aiProvider } from 'weifuwu'

app.use(aiProvider())
// ctx.ai → AIProvider

app.get('/ask', async (req, ctx) => {
  const result = await ctx.ai.generateText({
    prompt: 'Explain quantum computing',
  })
  return Response.json(result)
})

// Streaming
app.get('/stream', async (req, ctx) => {
  const result = ctx.ai.streamText({ prompt: 'Tell me a story' })
  return result.toTextStreamResponse()
})
```

Configured via environment variables:

- `OPENAI_API_KEY` — API key (default: `ollama`)
- `OPENAI_BASE_URL` — API base URL (default: `http://localhost:11434/v1`)
- `OPENAI_MODEL` — model name (default: `gpt-4o`)

Types: `AIProviderOptions`, `AIProvider`, `AIProviderInjected`

Also exports the raw SDK functions:

```ts
import { streamText, generateText, embed, embedMany, tool, openai } from 'weifuwu'
```

#### queue()

```ts
import { queue } from 'weifuwu'

app.use(queue({ store: 'memory' }))
// ctx.queue → Queue

// In-memory queue (default)
const q = queue()

// Redis-backed queue
const q = queue({ store: 'redis', redis: ctx.redis })

// PostgreSQL-backed queue
const q = queue({ store: 'pg', pg: { sql: ctx.sql } })

q.process('email', async (job) => {
  await sendEmail(job.payload)
})

await q.add('email', { to: 'user@example.com', subject: 'Hello' })
```

Methods: `add(type, payload, opts?)`, `process(type, handler)`, `cron(pattern, handler)`, `run()`, `stats()`, `jobs(limit?)`, `failedJobs(limit?)`, `retryFailed(jobId)`, `retryAllFailed(type?)`, `close()`, `dashboard()`, `migrate()`

Types: `QueueOptions`, `Queue`, `QueueJob`, `QueueInjected`

#### graphql()

```ts
import { graphql } from 'weifuwu'

app.use(
  '/graphql',
  graphql({
    schema: `
    type Query { hello: String }
  `,
    resolvers: { Query: { hello: () => 'world' } },
  }),
)

// With GraphiQL IDE:
app.use(
  '/graphql',
  graphql({
    schema: `type Query { hello: String }`,
    graphiql: true,
  }),
)
```

Options: `schema`, `rootValue`, `resolvers`, `context`, `graphiql`, `maxDepth`, `timeout`

Types: `GraphQLOptions`, `GraphQLHandler`

#### cors()

```ts
import { cors } from 'weifuwu'
app.use(cors({ origin: 'https://myapp.com' }))
```

Options: `origin`, `methods`, `allowedHeaders`, `exposedHeaders`, `credentials`, `maxAge`

#### compress()

```ts
import { compress } from 'weifuwu'
app.use(compress({ threshold: 1024, brotli: true }))
```

Options: `threshold`, `brotli`, `level`

#### helmet()

```ts
import { helmet } from 'weifuwu'
app.use(helmet())
```

Sets security headers (CSP, HSTS, X-Frame-Options, etc.).

#### rateLimit()

```ts
import { rateLimit } from 'weifuwu'

// In-memory (default)
app.use(rateLimit({ window: 60, max: 100 }))

// Redis-backed
app.use(rateLimit({ window: 60, max: 100, redis: ctx.redis }))
```

Options: `window`, `max`, `redis`, `key`, `statusCode`, `message`

#### validate()

```ts
import { validate } from 'weifuwu'
import { z } from 'zod'

app.post(
  '/users',
  validate({
    body: z.object({ name: z.string() }),
    query: z.object({ ref: z.string().optional() }),
    params: z.object({}),
    headers: z.object({ authorization: z.string() }),
  }),
  handler,
)
// ctx.parsed → { body, query, params, headers }

function handler(req, ctx) {
  const { name } = ctx.parsed.body
}
```

#### upload()

```ts
import { upload } from 'weifuwu'

app.post('/files', upload({ maxFiles: 5, maxSize: 10 * 1024 * 1024 }), handler)
// ctx.parsed → { files: UploadedFile[], fields: Record<string, string> }
```

Options: `maxFiles`, `maxSize`, `allowedTypes`, `keepExtensions`

#### static()

```ts
import { serveStatic } from 'weifuwu'
app.use('/assets', serveStatic({ root: './public', index: 'index.html' }))
```

Options: `root`, `index`, `maxAge`, `immutable`, `brotli`, `headers`

#### csrf()

```ts
import { csrf } from 'weifuwu'
app.use(csrf())
// ctx.csrf.token → string (for forms)
```

Protects POST/PUT/DELETE endpoints by requiring a valid CSRF token in `X-CSRF-Token` header.

Options: `secret`, `cookie`, `header`

#### flash()

```ts
import { flash } from 'weifuwu'
app.use(flash())
// ctx.flash.value → string | undefined (read-once)
// ctx.flash.set('success', 'Saved!')
```

Options: `cookie`, `maxAge`

#### requestId()

```ts
import { requestId } from 'weifuwu'
app.use(requestId())
// ctx.requestId → string (UUID)
// Response gets X-Request-Id header
```

Options: `header`, `generator`

#### health()

```ts
import { health } from 'weifuwu'
app.use('/health', health())
// GET /health → { status: 'ok', uptime: 12345 }
```

#### theme()

```ts
import { theme } from 'weifuwu'
app.use(theme({ cookie: 'theme' }))
// ctx.theme → { value: 'light' | 'dark', set(newValue) }
```

Options: `cookie`, `default`, `param`

#### i18n()

```ts
import { i18n } from 'weifuwu'
app.use(i18n({ dir: './locales', defaultLocale: 'en' }))
// ctx.i18n → { locale: 'en', t(key), set(locale) }
```

Options: `dir`, `defaultLocale`, `cookie`, `param`, `header`

### Standalone utilities

#### mailer()

```ts
import { mailer } from 'weifuwu'

const m = mailer({
  host: 'smtp.example.com',
  port: 587,
  auth: { user: '...', pass: '...' },
  from: 'noreply@example.com',
})

await m.send({ to: 'user@example.com', subject: 'Hello', text: '...' })
await m.close()
```

Options: `host`, `port`, `auth`, `from`, `secure`

#### SSE

```ts
import { createSSEStream, formatSSE, formatSSEData } from 'weifuwu'

const stream = createSSEStream()
stream.write(formatSSE('eventType', { data: 'hello' }))
stream.end()
```

#### Hub (pub/sub)

```ts
import { createHub } from 'weifuwu'

const hub = createHub({ redis: optionalRedisClient })
hub.join('room:1', ws)
hub.sendRoom('room:1', { type: 'message', text: 'hello' })
hub.leave(ws)
```

#### Cookie helpers

```ts
import { getCookies, setCookie, deleteCookie } from 'weifuwu'
```

### Test utilities

```ts
import { testApp, TestApp, createTestDb, withTestDb } from 'weifuwu'

const app = new Router().handler()
const res = await testApp(app, new Request('http://localhost/'))
// res.status, res.headers, await res.json()

// With database
const db = await createTestDb()
// db.sql, db.close()
```

### Environment

```ts
import { loadEnv, isDev, isProd, env } from 'weifuwu'

loadEnv() // loads .env file
isDev() // NODE_ENV === 'development'
isProd() // NODE_ENV === 'production'
env('MY_VAR', 'default')
getPublicEnv() // env vars starting with PUBLIC_
```

### Tracing

```ts
import { trace, currentTraceId } from 'weifuwu'

trace('fetch-user', async () => {
  // auto-tracked with trace ID
})
currentTraceId() // get current trace ID
```

### Error handling

```ts
import { HttpError } from 'weifuwu'

throw new HttpError('Not found', 404) // caught by serve(), returns 404
```

---

## CLI

```bash
npx weifuwu init my-api
cd my-api
npm run dev
```

Creates a minimal API project with `app.ts`, `index.ts`, and TypeScript config.

---

## Dependencies

- `postgres` — PostgreSQL client
- `ioredis` — Redis client
- `ai`, `@ai-sdk/openai` — AI SDK
- `graphql`, `@graphql-tools/schema` — GraphQL
- `ws` — WebSocket
- `zod` — Schema validation
- `nodemailer` — Email

Zero build tools. Zero frontend framework dependencies.
