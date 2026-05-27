# weifuwu

**Web-standard HTTP framework for Node.js.** `(req, ctx) => Response` — no framework-specific objects, just the Web API your browser already speaks.

## Features

- **Web Standard** — `Request` / `Response` / `ReadableStream`, zero abstractions
- **Trie router** — static > param > wildcard, sub-router mounting, path params
- **Middleware** — global, path-scoped, route-level — onion model, short-circuit
- **Built-in middleware** — `auth()`, `cors()`, `logger()`, `rateLimit()`, `compress()`
- **React SSR + Hydration** — `tsx({ dir })` — page.tsx / load.ts / layout.tsx / route.ts
- **WebSocket** — `router.ws()` with upgrade middleware (auth before connect)
- **GraphQL** — `router.graphql()` with GraphiQL IDE
- **AI streaming** — `router.ai()` via Vercel AI SDK
- **Static files** — `serveStatic()` with ETag, 304, MIME, directory index
- **Request validation** — `validate()` with Zod (body / query / params / headers)
- **File upload** — `upload()` multipart parser with disk save, size & type limits
- **Cookie** — `getCookies()`, `setCookie()`, `deleteCookie()` — immutable
- **Error handling** — global `onError()`
- **Zero build** — native TypeScript in Node.js v24+
- **Zero deps** (core) — only `node:http` and `node:stream`

## Quick start

```ts
import { serve } from 'weifuwu'

serve((req, ctx) => new Response('Hello, World!'), { port: 3000 })
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
  layout.tsx            → root layout     (wraps all pages)
  about/page.tsx        → GET /about
  blog/[slug]/
    page.tsx            → GET /blog/:slug
    load.ts             → data fetching   (server-only, default export)
    route.ts            → POST /blog/:slug (API, named exports GET/POST/...)
  blog/layout.tsx       → /blog/* layout  (auto-wraps blog pages)
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
import { db } from './db.ts'

export default async function load({ params, query }: {
  params: Record<string, string>
  query: Record<string, string>
}) {
  const data = await db.query(params.slug)
  return { data }   // merged into props passed to page.tsx
}
```

`load()` runs only on the server. Its return value is merged with `{ params, query }` and passed to the page component. The merged props are serialized as `window.__WEIFUWU_PROPS` for client hydration.

### layout.tsx — nested layouts

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head><title>App</title></head>
      <body>
        <div id="__weifuwu_root">{children}</div>
      </body>
    </html>
  )
}
```

Layouts auto-nest by directory depth — `pages/blog/layout.tsx` wraps `pages/blog/*` pages inside `pages/layout.tsx`.

### route.ts — API (co-located with page)

```ts
export const POST: Handler = async (req, ctx) => {
  const body = await req.json()
  return Response.json({ ...body, slug: ctx.params.slug })
}
```

Route.ts exports `POST`/`PUT`/`DELETE`/`PATCH` (GET is handled by page.tsx). The same `route.ts` file coexists with `page.tsx` in the same directory for handling form submissions or AJAX requests.

### Usage within a full app

```ts
import { serve, Router } from 'weifuwu'
import { tsx } from 'weifuwu/tsx'

const r = new Router()
r.use('/', await tsx({ dir: './pages/' }))

// Other features coexist in the same process
r.ws('/chat', { message(ws, _, data) { ws.send(data) } })
r.graphql('/graphql', { schema: `...`, resolvers: { ... } })

serve(r.handler())
```

```bash
node --watch app.ts    # development
node app.ts            # production
```

No build step, no configuration file — just Node.js and React.

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

## Static files

```ts
import { serveStatic } from 'weifuwu'

router.get('/static/*', serveStatic('./public'))
```

Features: MIME type detection (20+ types), ETag + If-None-Match (304), directory index (index.html), path traversal protection, Cache-Control.

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

// Validate multiple dimensions at once
router.post('/data',
  validate({
    body: z.object({ value: z.number() }),
    query: z.object({ token: z.string() }),
    params: z.object({ id: z.string().length(24) }),
  }),
  handler,
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

```ts
const app = new Router()
  .graphql('/graphql', {
    schema: `
      type Query { hello: String }
      type Mutation { setMessage(msg: String!): String }
    `,
    resolvers: {
      Query: { hello: () => 'world' },
      Mutation: { setMessage: (_, { msg }) => msg },
    },
    graphiql: true,
  })

serve(app.handler(), { port: 3000 })
```

## AI streaming

```ts
import { openai } from '@ai-sdk/openai'

const app = new Router()
  .ai('/chat', async (req) => {
    const { messages } = await req.json()
    return {
      model: openai('gpt-4o'),
      messages,
    }
  })

serve(app.handler(), { port: 3000 })
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

```ts
import { tsx } from 'weifuwu/tsx'
```

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
| `graphql(path, ...mws, options)` | GraphQL endpoint |
| `ai(path, ...mws, handler)` | AI streaming |
| `onError(handler)` | Global error handler |
| `handler()` | Returns `(req, ctx) => Response` for `serve()` |
| `websocketHandler()` | Returns upgrade handler for `serve({ websocket })` |

### Built-in middleware

| Function | Description |
|----------|-------------|
| `auth(options)` | Bearer token / custom header / verify / proxy |
| `cors(options?)` | CORS with preflight, origin whitelist, credentials |
| `logger(options?)` | Request logging with duration |
| `rateLimit(options?)` | In-memory rate limiting with headers |
| `compress(options?)` | Brotli / Gzip / Deflate compression |

### Utilities

| Function | Description |
|----------|-------------|
| `serveStatic(root, options?)` | Static file serving handler |
| `validate(schemas)` | Zod validation middleware |
| `upload(options?)` | Multipart file upload middleware |
| `getCookies(req)` | Parse Cookie header → object |
| `setCookie(res, name, value, options?)` | Set cookie (returns new Response) |
| `deleteCookie(res, name)` | Delete cookie (returns new Response) |

## License

MIT
