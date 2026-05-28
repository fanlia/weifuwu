# weifuwu

**Web-standard HTTP framework for Node.js.** `(req, ctx) => Response` — no framework-specific objects, just the Web API your browser already speaks.

### Design

weifuwu doesn't invent its own request/response abstraction. `Request` and `Response` are the same objects you use in `fetch()` — what you learn in the browser applies directly on the server. `ctx` is the only framework object, and it only carries what the router parsed for you (`params`, `query`).

Everything follows the same `(req, ctx) => Response` contract. The Router handles HTTP routing and WebSocket. All other features — auth, validation, database, GraphQL, AI, workflow — are standalone modules you import and mount with `app.use()`.

## Features

- **Web Standard** — `Request` / `Response` / `ReadableStream`, zero abstractions
- **Trie router** — static > param > wildcard, sub-router mounting, path params
- **Middleware** — global, path-scoped, route-level — onion model, short-circuit
- **Middleware modules** — `auth()`, `cors()`, `logger()`, `rateLimit()`, `compress()`, `validate()`, `upload()`
- **React SSR + Hydration** — `tsx({ dir })` — page.tsx / load.ts / layout.tsx / route.ts / not-found.tsx
- **WebSocket** — `router.ws()` with upgrade middleware (auth before connect)
- **GraphQL** — `graphql(handler)` sub-Router with GraphiQL IDE
- **AI streaming** — `ai(handler)` sub-Router via Vercel AI SDK
- **AI workflows** — `workflow(handler)` sub-Router — intent-to-execution pipelines with `tool()` + SSE
- **PostgreSQL** — `postgres()` — zod-to-DDL, auto-migration, 6 CRUD methods, `ctx.sql` escape hatch
- **Static files** — `serveStatic()` with ETag, 304, MIME, directory index
- **Cookie** — `getCookies()`, `setCookie()`, `deleteCookie()` — immutable
- **Error handling** — global `onError()`
- **Zero build** — native TypeScript in Node.js v24+
- **Zero deps** (core) — only `node:http` and `node:stream`

## Quick start

```ts
import { serve } from 'weifuwu'
serve((req, ctx) => new Response('Hello, World!'), { port: 3000 })
```

## Router

```ts
import { serve, Router } from 'weifuwu'

const app = new Router()
  .use((req, ctx, next) => {
    console.log(`${req.method} ${new URL(req.url).pathname}`)
    return next(req, ctx)
  })
  .get('/hello/:name', (req, ctx) =>
    Response.json({ message: `Hello, ${ctx.params.name}!` }),
  )
  .post('/data', async (req, ctx) => {
    const body = await req.json()
    return Response.json(body, { status: 201 })
  })

serve(app.handler(), { port: 3000 })
```

## Built-in middleware

### Auth

```ts
import { auth } from 'weifuwu'

// Static bearer token
app.use(auth({ token: 'sk-123' }))

// Custom verify (JWT, DB, etc.) — return object to set ctx.user
app.use(auth({
  verify: async (token) => {
    const user = await db.findUserByToken(token)
    return user ? { sub: user.id, role: user.role } : null
  },
}))

// Proxy validation to external auth service
app.get('/protected', auth({ proxy: 'http://auth:3000/validate' }), handler)

// Custom header
app.use(auth({ header: 'X-API-Key', token: 'my-key' }))
```

### CORS

```ts
import { cors } from 'weifuwu'

app.use(cors())                                          // allow all
app.use(cors({ origin: ['https://example.com'] }))       // whitelist
app.use(cors({ origin: (o) => o.endsWith('.trusted.com') ? o : false }))
app.use(cors({ credentials: true, maxAge: 3600 }))
```

### Logger

```ts
import { logger } from 'weifuwu'

app.use(logger())                           // GET /hello 200 5ms
app.use(logger({ format: 'combined' }))     // with query params
```

### Rate limit

```ts
import { rateLimit } from 'weifuwu'

app.use(rateLimit({ max: 100, window: 60_000 }))          // 100 req/min
app.get('/api', rateLimit({ max: 10 }), handler)          // per-route

// Custom key (by API key, user ID, etc.)
app.use(rateLimit({
  max: 1000,
  key: (req) => req.headers.get('x-api-key') ?? 'anonymous',
}))
```

### Compression

```ts
import { compress } from 'weifuwu'

app.use(compress())                       // brotli > gzip > deflate
app.use(compress({ threshold: 2048 }))    // only compress > 2KB
```

## Validation

```ts
import { z } from 'zod'
import { validate } from 'weifuwu'

const CreateUser = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

router.post('/users',
  validate({ body: CreateUser }),
  (req, ctx) => {
    // ctx.parsed.body — typed & validated
  },
)
```

## File upload

```ts
import { upload } from 'weifuwu'

router.post('/upload',
  upload({ dir: './uploads', maxFileSize: 10_485_760 }),
  (req, ctx) => {
    // ctx.parsed.files.avatar  → { name, type, size, path }
    // ctx.parsed.fields.title  → 'hello'
  },
)
```

## Cookie

```ts
import { getCookies, setCookie, deleteCookie } from 'weifuwu'

// Read
const cookies = getCookies(req)        // { session: 'abc' }

// Set (immutable — returns new Response)
let res = new Response('ok')
res = setCookie(res, 'session', 'token', { httpOnly: true, secure: true, maxAge: 3600 })

// Delete
res = deleteCookie(res, 'session')
```

## Static files

```ts
import { serveStatic } from 'weifuwu'

router.get('/static/*', serveStatic('./public'))
```

Features: MIME type detection (20+ types), ETag + If-None-Match (304), directory index (index.html), path traversal protection, Cache-Control.

## PostgreSQL

Built-in PostgreSQL — zero config, zero ORM, zero migration files.

```ts
import { serve, Router, postgres } from 'weifuwu'
import { z } from 'zod'

const app = new Router()
const pg = postgres()

const User = pg.table('users', {
  id:    z.number().optional(),    // → SERIAL PRIMARY KEY
  name:  z.string().min(1),       // → TEXT NOT NULL
  email: z.string().email(),      // → TEXT NOT NULL
  age:   z.number().optional(),   // → INTEGER
})

await pg.migrate()
// Auto-creates tables / adds missing columns via information_schema
app.use(pg)  // injects ctx.sql into handlers
```

### 6 methods — HTTP semantics

```ts
User.get(1)                          // GET    /users/:id
User.list({ name: 'a' },             // GET    /users?name=a
  { limit: 10, offset: 0, sort: { id: 'desc' } })
// → { rows: User[], count: number }

User.create({ name: 'A', email: 'a@b.com' })           // POST   /users
User.patch(1, { name: 'B' })                           // PATCH  /users/:id
User.remove(1)                                          // DELETE /users/:id
```

Every method validates input against your zod schema automatically. Complex queries use `ctx.sql`:

```ts
app.get('/users/stats', async (req, ctx) => {
  const rows = await ctx.sql`
    SELECT u.*, count(p.id) as posts
    FROM users u LEFT JOIN posts p ON p.user_id = u.id
    GROUP BY u.id
  `
  return Response.json(rows)
})
```

### Migration-free sync

`pg.migrate()` queries `information_schema.columns` and only runs the DDL needed:

- **Table missing** → `CREATE TABLE IF NOT EXISTS`
- **Column missing** → `ALTER TABLE ADD COLUMN IF NOT EXISTS`
- **Existing** → no-op

Safe for production: never drops or alters existing columns. Destructive operations (rename, type change, drop) are done via `ctx.sql`.

### Connection lifecycle

```ts
const pg = postgres()                        // reads DATABASE_URL
const pg = postgres('postgres://...')        // explicit connection
const pg = postgres({ signal: ac.signal })   // abort → sql.end()
await pg.close()                             // explicit close
```

### Primary keys

| zod field | PostgreSQL |
|-----------|-----------|
| `id: z.number().optional()` | `SERIAL PRIMARY KEY` |
| `id: z.string().uuid().optional()` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` |
| `id: z.string()` | `TEXT PRIMARY KEY` (you pass the value) |

## WebSocket

```ts
const app = new Router()
  .ws('/chat/:room', {
    open(ws, ctx) {
      ws.send(`Connected to room: ${ctx.params.room}`)
    },
    message(ws, ctx, data) {
      ws.send(`echo: ${data}`)
    },
    close(ws, ctx) {
      console.log('disconnected')
    },
  })

serve(app.handler(), { port: 3000, websocket: app.websocketHandler() })
```

Middleware runs **before** WebSocket upgrade — you can reject connections with HTTP status codes:

```ts
app.ws('/secure',
  (req, _ctx, next) => {
    const auth = req.headers.get('Authorization')
    if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return next(req, _ctx)
  },
  { open(ws) { ws.send('authorized') } },
)
```

## GraphQL

GraphQL endpoint with GraphiQL IDE. Mount as a sub-Router:

```ts
import { serve, Router, graphql } from 'weifuwu'

const app = new Router()
app.use('/graphql', graphql(() => ({
  schema: `
    type Query { hello: String }
    type Mutation { setMessage(msg: String!): String }
  `,
  resolvers: {
    Query: { hello: () => 'world' },
    Mutation: { setMessage: (_, { msg }) => msg },
  },
  graphiql: true,
})))

serve(app.handler(), { port: 3000 })
```

The handler receives `(req, ctx)` so you can customize the schema based on the request.

## AI streaming

Server-sent event streaming via the Vercel AI SDK:

```ts
import { serve, Router, ai } from 'weifuwu'
import { openai } from '@ai-sdk/openai'

const app = new Router()
app.use('/chat', ai(async (req, ctx) => {
  const { messages } = await req.json()
  return { model: openai('gpt-4o'), messages }
}))

serve(app.handler(), { port: 3000 })
```

## Workflow

Define business capabilities as **Tools** (`tool()`), then chain them into **workflows** for AI-driven multi-step execution. Works with or without an LLM — hand-write the workflow JSON or let AI generate it from a goal.

```ts
import { Router, tool, workflow } from 'weifuwu'
import { z } from 'zod'

// 1. Define tools (business capabilities)
const tools = {
  queryUser: tool({
    description: 'Query user info, returns email, name',
    inputSchema: z.object({ userId: z.string() }),
    execute: async ({ userId }) => ({ id: userId, email: 'user@test.com', name: 'Test' }),
  }),
  sendEmail: tool({
    description: 'Send an email',
    inputSchema: z.object({ to: z.string(), subject: z.string() }),
    execute: async ({ to, subject }) => ({ sent: true }),
  }),
}

// 2. Mount workflow sub-router
const app = new Router()
app.use('/agent', workflow(() => ({ tools })))
// POST /agent  { nodes: [...] }  →  200 { workflow: {...}, result: ... }

// With SSE streaming:
app.use('/agent-stream', workflow(() => ({ tools, stream: true })))
// POST /agent-stream  { nodes: [...] }
// → 200 { workflowId: "xxx", eventsUrl: "/xxx/events" }
// GET  /agent-stream/:workflowId/events
// → SSE: workflow-start → node-start → node-end → complete

// With LLM model (generates workflow from goal):
app.use('/agent-llm', workflow(() => ({
  tools,
  model: openai('gpt-4o'),
})))
// POST /agent-llm  { goal: "给用户123发欢迎邮件" }
// ← LLM generates → executes → returns result
```

### Tool

```ts
import { tool } from 'weifuwu'
import { z } from 'zod'

const myTool = tool({
  description: '做什么的，返回什么',
  inputSchema: z.object({ key: z.string() }),
  execute: async (input, ctx) => {
    return { result: input.key }
  },
})
```

`ctx.onStream` 用于流式推送（如 LLM token 输出）：

```ts
const llmTool = tool({
  description: '生成文本',
  inputSchema: z.object({ prompt: z.string() }),
  execute: async (input, ctx) => {
    const stream = await openai.chat.completions.create({ ... })
    let full = ''
    for await (const chunk of stream) {
      full += chunk.choices[0]?.delta?.content || ''
      ctx.onStream?.({ type: 'llm-stream', chunk, accumulated: full })
    }
    return { text: full }
  },
})
```

### Core Nodes

7 built-in node types:

| Node | Purpose | Input |
|------|---------|-------|
| `call` | Call a tool or sub-workflow | `{ tool: "name", args: {...} }` or `{ function: "name", args: {...} }` |
| `set` | Declare or assign a variable | `{ name: "x", value: 42 }` |
| `get` | Read a variable | `{ name: "x" }` |
| `eval` | Evaluate an expression | `{ expression: "$var.x + 1" }` |
| `if` | Conditional branch | `{ conditions: [{ test: ..., body: [nodes] }] }` |
| `while` | Loop | `{ condition: "$var.i < 5" }, body: [nodes]` |
| `http` | HTTP request | `{ url: "https://...", method: "GET" }` |

### Variable Reference Syntax

| Pattern | Meaning | Example |
|---------|---------|---------|
| `$var.x` | Variable `x` | `$var.counter` |
| `$nodes.u.output` | Full output of node `u` | `$nodes.u.output` |
| `$nodes.u.output.field` | Specific field | `$nodes.u.output.email` |
| `$input.userId` | Workflow input param | `$input.userId` |
| `42`, `true`, `"hello"` | Literal values | Passed as-is |

### Engine API

For programmatic use outside of Router:

```ts
import { createWorkflowEngine, createSSEManager } from 'weifuwu'

const sse = createSSEManager()
const engine = createWorkflowEngine({ tools, sseManager: sse })

// Sync execution
const result = await engine.execute({ nodes: [...] })

// Async execution with SSE
engine.runAsync('wf-1', { nodes: [...] })
```

### SSE Events

```ts
const sse = createSSEManager()
const stream = sse.createStream('wf-1')

const reader = stream.getReader()
//   event: workflow-start   — { workflowId, goal }
//   event: node-start       — { nodeId, tool, input }
//   event: node-end         — { nodeId, output }
//   event: llm-stream       — { nodeId, chunk, accumulated }
//   event: complete         — { result, duration }
//   event: error            — { error }
```

### Sub-workflows

Define reusable sub-workflows in the `functions` field:

```json
{
  "functions": {
    "double": {
      "inputSchema": { "type": "object", "properties": { "x": { "type": "number" } } },
      "workflow": {
        "nodes": [
          { "id": "calc", "tool": "eval", "input": { "expression": "$input.x * 2" } }
        ]
      }
    }
  },
  "nodes": [
    { "id": "call_double", "tool": "call", "input": { "function": "double", "args": { "x": 21 } } }
  ]
}
```

## React pages with tsx()

```ts
import { serve, Router } from 'weifuwu'
import { tsx } from 'weifuwu/tsx'

const app = new Router()
app.use('/', await tsx({ dir: './pages/' }))

serve(app.handler(), { port: 3000 })
```

### File conventions

```
pages/
  page.tsx              → GET /           (React component, default export)
  layout.tsx            → root layout     (HTML shell, receives req/ctx, NOT hydrated)
  not-found.tsx         → 404 error page  (rendered for unmatched routes, wrapped in layout)
  about/page.tsx        → GET /about
  blog/[slug]/
    page.tsx            → GET /blog/:slug
    load.ts             → data fetching   (server-only, default export)
    route.ts            → POST /blog/:slug (API, named exports POST/PUT/DELETE/...)
  blog/layout.tsx       → /blog/* layout  (UI structure, receives children, hydrated)
  api/search/
    route.ts            → GET /api/search (standalone API, no page.tsx needed)
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
  return { data }   // merged into props passed to page.tsx
}
```

### layout.tsx

**Root layout** (`pages/layout.tsx`) — receives `{ children, req, ctx }`:

```tsx
export default function RootLayout({ children, req, ctx }: {
  children: React.ReactNode
  req: Request
  ctx: Context
}) {
  return (
    <html>
      <head><title>App</title></head>
      <body><div id="__weifuwu_root">{children}</div></body>
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

### not-found.tsx — 404 page

```tsx
export default function NotFound() {
  return <h1 class="text-4xl">404 – Not Found</h1>
}
```

## Usage within a full app

```ts
import { serve, Router, ai, graphql, workflow } from 'weifuwu'
import { tsx } from 'weifuwu/tsx'

const app = new Router()
app.use('/', await tsx({ dir: './pages/' }))
app.use('/chat', ai(async (req) => ({ model: openai('gpt-4o'), messages: (await req.json()).messages })))
app.use('/graphql', graphql(() => ({ schema: `type Query { hello: String }`, resolvers: { Query: { hello: () => 'world' } } })))
app.use('/agent', workflow(() => ({ tools: myTools, stream: true })))
app.ws('/chat', { message(ws, _, data) { ws.send(data) } })

serve(app.handler())
```

```bash
node --watch app.ts    # development
node app.ts            # production
```

No build step, no configuration file — just Node.js.

## Graceful shutdown

```ts
import { serve } from 'weifuwu'
import type { Server } from 'weifuwu'

const ac = new AbortController()
let server: Server

process.on('SIGTERM', () => {
  ac.abort()
  server.stop()
})

server = serve((req, ctx) => new Response('Hello'), {
  port: 3000,
  signal: ac.signal,
})
await server.ready
```

### Using with WebSocket

```ts
const app = new Router().ws('/chat', { … })
const server = serve(app.handler(), {
  port: 3000,
  signal: ac.signal,
  websocket: app.websocketHandler(),
})
```

## Error handling

```ts
const app = new Router()
  .onError((err, req, ctx) =>
    Response.json({ error: err.message }, { status: 500 }),
  )
  .get('/crash', () => { throw new Error('boom') })
```

## API

### `serve(handler, options?)`

| Option | Default | Description |
|--------|---------|-------------|
| `port` | `0` | Listen port (`0` = random) |
| `hostname` | `'0.0.0.0'` | Bind address |
| `signal` | — | `AbortSignal` for graceful shutdown |
| `websocket` | — | Upgrade handler from `router.websocketHandler()` |

Returns `{ stop, port, hostname, ready }`.

### `tsx(options)`

| Option | Default | Description |
|--------|---------|-------------|
| `dir` | — | Pages directory path |

Returns `Promise<Router>`.

### `Router`

| Method | Description |
|--------|-------------|
| `get/post/put/delete/patch/head/options/all(path, ...mws, handler)` | Route registration |
| `use(mw)` / `use(path, mw)` / `use(path, subRouter)` | Middleware / sub-router |
| `ws(path, ...mws, handler)` | WebSocket route |
| `onError(handler)` | Global error handler |
| `handler()` | Returns `(req, ctx) => Response` for `serve()` |
| `websocketHandler()` | Returns upgrade handler for `serve({ websocket })` |

### Middleware modules

| Import | Description |
|--------|-------------|
| `auth(options)` | Bearer token / custom header / verify / proxy |
| `cors(options?)` | CORS with preflight, origin whitelist, credentials |
| `logger(options?)` | Request logging with duration |
| `rateLimit(options?)` | In-memory rate limiting with headers |
| `compress(options?)` | Brotli / Gzip / Deflate compression |
| `validate(schemas)` | Zod validation middleware |
| `upload(options?)` | Multipart file upload middleware |

### Sub-Router modules (mount via `app.use()`)

| Import | Description |
|--------|-------------|
| `postgres(options?)` | PostgreSQL connection + auto-migration + 6 CRUD methods |
| `graphql(handler)` | GraphQL endpoint (GET/POST + GraphiQL) |
| `ai(handler)` | AI streaming endpoint (POST) |
| `workflow(handler)` | Workflow engine (POST + SSE) |

### Utilities

| Function | Description |
|----------|-------------|
| `serveStatic(root, options?)` | Static file serving handler |
| `getCookies(req)` | Parse Cookie header → object |
| `setCookie(res, name, value, options?)` | Set cookie (returns new Response) |
| `deleteCookie(res, name)` | Delete cookie (returns new Response) |
| `useTsx()` | Hook returning `{ params, query, user, parsed }` from `TsxContext` |
| `createWorkflowEngine(options)` | Programmatic workflow engine |
| `createSSEManager()` | SSE event manager for workflows |
| `tool(def)` | Define a workflow tool |

Import `useTsx` and `TsxContext` from `'weifuwu'`.

## License

MIT
