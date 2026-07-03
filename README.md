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
| `Router` | Trie-based HTTP router with WebSocket support and `plugin()` method. |
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
app.plugin(fn)                // extension: (app) => { app.get(), app.use(), ... }
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
| `sandbox(opts?)` | Filesystem isolation for agent operations. `baseDir`, `timeout`, `isolateBy`. |
| `auth(opts?)` | Authentication: JWT, session cookies, API keys. Injects `ctx.user`. |

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
// server.ts — the only file you need
import { serve, Router } from 'weifuwu'
import { react } from 'weifuwu/react'

const app = new Router()
  .use(trace())
  .use(logger())
  .plugin(react({
    pages: {
      '/':          './pages/Home.tsx',
      '/users':     './pages/Users.tsx',
      '/users/:id': './pages/UserDetail.tsx',
    },
    layout:   './layouts/Root.tsx',
    notFound: './pages/NotFound.tsx',
    tailwind: { entry: './styles/input.css' },
  }))

app.get('/api/hello', () => Response.json({ message: 'hi' }))
serve(app, { port: 3000 })
```

**One `react()` call handles:** SSR rendering, routing, data loading, Tailwind CSS, client bundle auto-generation, and error pages. No `client.ts`, `routes.ts`, or manual middleware setup needed.

#### Page components

```tsx
// pages/UserDetail.tsx
import type { Context } from 'weifuwu'
import { HttpError } from 'weifuwu'
import { useServerData } from 'weifuwu/react'

export async function loader(ctx: Context) {
  const user = await db.find(ctx.params.id)
  if (!user) throw new HttpError('Not found', 404)
  return { user }
}

export default function UserDetailPage() {
  const { user } = useServerData<{ user: User }>()
  return (
    <div>
      <title>{`${user.name} — My App`}</title>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  )
}
```

- `export async function loader(ctx)` — runs on the server, returns data for `useServerData()`
- `throw new HttpError('Not found', 404)` — renders the NotFound page with correct status
- `<title>` auto-hoists to `<head>` via React 19
- `export default` is auto-detected; named exports work too

#### Layout with shared data

```tsx
// layouts/Root.tsx
export async function loader(ctx: Context) {
  return { currentUser: await getCurrentUser(ctx) }
}

export function Root({ children }: { children: ReactNode }) {
  const { currentUser } = useServerData()
  return (
    <>
      <nav>
        <a href="/">Home</a>
        <a href="/users">Users</a>
        <span>{currentUser?.name}</span>
      </nav>
      <main>{children}</main>
    </>
  )
}
```

Layout `loader` data merges with page data. Page loader overrides same keys.

#### Data flow

```
layout loader  ──┐
                  ├──→  merge → useServerData()  ──→  Layout + Page
page loader   ───┘
```

#### Client-side SPA

Every page is automatically code-split into a separate chunk. On first visit the server renders HTML and the client hydrates. Subsequent navigations intercept `<a>` clicks, `import()` the page chunk, and fetch fresh server data — all automatic, zero config.

#### Streaming SSR

```tsx
import { Suspense, use } from 'react'

export default function StreamingPage() {
  return (
    <div>
      <h1>Instant shell</h1>
      <Suspense fallback={<Spinner />}>
        <SlowData promise={fetchSlowData()} />
      </Suspense>
    </div>
  )
}
```

`<Suspense>` boundaries stream to the browser as data resolves.

| Feature | Description |
|---|---|
| `react({ pages, layout, notFound, tailwind })` | One call: SSR + routing + client bundle + error handling |
| `export async function loader(ctx)` | Server-side data loading, auto-detected by the framework |
| `useServerData<T>()` | Type-safe access to loader data in any component |
| `Link` | `<a>` that does SPA navigation on the client |
| `ErrorBoundary` | Catches render errors on server and client |
| `<title>`, `<meta>` | Auto-hoisted to `<head>` via React 19 |
| `<Suspense>` | Streaming SSR, works out of the box |
| `client: false` | Disable client JS for static SSR only |

**Import paths:**

```ts
// Server-side
import { react, Link, ErrorBoundary, useServerData } from 'weifuwu'

// Client-side (for custom advanced setups)
import { createBrowserRouter, hydrate, navigate } from 'weifuwu/react/client'
```

See [examples/react-ssr/](examples/react-ssr/) for the full demo.

### AI Agent

> Requires `ai` (Vercel AI SDK). Install with a model provider:
> ```bash
> npm install ai @ai-sdk/openai
> ```

```ts
import { agent } from 'weifuwu'
import { openai } from '@ai-sdk/openai'
import { tool } from 'ai'
import { z } from 'zod'

app.use(agent({
  model: openai('gpt-4o'),
  system: 'You are a helpful assistant.',
  knowledge: {
    // RAG — search a knowledge base before each response
    search: async (query, ctx) => {
      const { embeddings } = await embedModel.doEmbed({ values: [query] })
      return ctx.sql`
        SELECT content, 1 - (embedding <=> ${embeddings[0]}::vector) AS score
        FROM docs ORDER BY embedding <=> ${embeddings[0]}::vector LIMIT 3
      `
    },
  },
  tools: {
    getWeather: tool({
      description: 'Get weather for a city',
      parameters: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ temp: 22, unit: 'C' }),
    }),
  },
  maxSteps: 5,
}))

app.post('/api/chat', async (req, ctx) => {
  const { messages } = await req.json()
  return ctx.agent.chatStreamResponse({ messages })
})
```

**`agent()` handles:** multi-turn conversations, automatic tool-calling loops (maxSteps), knowledge retrieval (RAG) injected into the system prompt, and SSE streaming compatible with `useChat` from `@ai-sdk/react`.

| Feature | Description |
|---|---|
| `ctx.agent.chat(prompt, opts?)` | Non-streaming chat with tool calling and RAG |
| `ctx.agent.chatStreamResponse({ messages })` | SSE streaming response (useChat-compatible) |
| `knowledge.search` | User-defined RAG callback — query any data source via `ctx` |
| `tools` | Tool definitions (from `ai` package). Executed in automatic loops |
| `agents` | Named sub-agents with different models/tools |
| `sandbox: true` | Auto-integrate with `ctx.sandbox` for file operations |
| `store` | Session persistence (save/load conversation history) |

### Auth

```ts
import { auth } from 'weifuwu'

// JWT
app.use(auth({ jwt: { secret: process.env.JWT_SECRET } }))

// Session cookie
app.use(auth({
  session: {
    secret: '...',
    loadUser: async (data, ctx) => ctx.sql`SELECT * FROM users WHERE id = ${data.userId}`,
  },
}))

// API key
app.use(auth({ apiKey: { validate: async (key, ctx) => ctx.sql`SELECT * FROM users WHERE api_key = ${key}` } }))

// ctx.user is now available
app.get('/me', (req, ctx) => {
  if (!ctx.user) return new Response('Unauthorized', { status: 401 })
  return Response.json(ctx.user)
})
```

Supports JWT (HS256 via cookie or Authorization header), signed session cookies with `loadUser` callback, and API key validation. All are optional — requests proceed without a user identity unless handlers enforce it.

### Sandbox

```ts
import { sandbox } from 'weifuwu'

app.use(sandbox({
  baseDir: '/tmp/workspaces',
  timeout: 30000,
  isolateBy: 'user',  // one directory per ctx.user.id
}))

// ctx.sandbox provides isolated file + exec operations
await ctx.sandbox.writeFile('hello.txt', 'world')
const content = await ctx.sandbox.readFile('hello.txt')
const { stdout } = await ctx.sandbox.exec('ls -la')
await ctx.sandbox.destroy()  // clean up workspace
```

All file paths are validated — escapes (`../`) are rejected. `exec()` enforces timeout and sets `HOME` to the workspace directory. When `isolateBy: 'user'` is set, each user gets their own directory under `baseDir`.

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
import { serve, Router, cors, helmet, compress, logger, trace, rateLimit, postgres, redis, auth, sandbox, HttpError } from 'weifuwu'
import { agent } from 'weifuwu/agent'
import { react } from 'weifuwu/react'
import { openai } from '@ai-sdk/openai'

const app = new Router()
  .use(trace())
  .use(logger())
  .use(cors())
  .use(helmet())
  .use(compress())
  .use(postgres())
  .use(redis())
  .use(auth({ jwt: { secret: process.env.JWT_SECRET! } }))
  .use(sandbox({ isolateBy: 'user' }))
  .use(agent({
    model: openai('gpt-4o'),
    system: 'You are a helpful assistant.',
    knowledge: {
      search: async (q, ctx) => ctx.sql`...`,
    },
    sandbox: true,
  }))
  .plugin(react({ pages: { '/': './Chat.tsx' }, layout: './Layout.tsx', tailwind: {} }))

app.post('/api/chat', async (req, ctx) => {
  if (!ctx.user) return new Response('Unauthorized', { status: 401 })
  const { messages } = await req.json()
  return ctx.agent.chatStreamResponse({ messages })
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
│   ├── ai/                  ← AI + agent middleware
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
