# @weifuwujs/core

**Web-standard HTTP microframework for Node.js** — `(req, ctx) => Response`

Pure Node.js, no build step. Native TypeScript via Node.js 24+.

```
npm install @weifuwujs/core
```

## Quick start

```ts
import { serve, Router } from '@weifuwujs/core'

const app = new Router()
app.get('/', () => new Response('Hello world!'))
app.get('/api/ping', () => Response.json({ pong: true }))

serve(app.handler(), { port: 3000 })
```

## API

### Router

Standard routing with path parameters:

```ts
const app = new Router()
app.get('/users', listUsers)
app.get('/users/:id', getUser)
app.post('/users', createUser)
app.ws('/chat', { message(ws, ctx, data) { /* ... */ } })
```

### Middleware

Enrich `ctx` via middleware chain:

```ts
app.use(postgres())      // → ctx.sql
app.use(redis())          // → ctx.redis
app.use(aiProvider())     // → ctx.ai
app.use(queue())          // → ctx.queue
app.use(cors())
app.use(rateLimit({ window: 60 }))
app.use(helmet())
app.use(compress())
app.use(serveStatic('./public'))
```

### Context

```ts
type Handler = (req: Request, ctx: Context) => Response | Promise<Response>
```

- `ctx.params` — URL path parameters
- `ctx.query` — Parsed URL search params
- `ctx.sql` — Postgres client (when `postgres()` middleware applied)
- `ctx.redis` — Redis client (when `redis()` middleware applied)
- `ctx.ai` — AI provider (when `aiProvider()` middleware applied)
- `ctx.queue` — Queue client (when `queue()` middleware applied)

### Built-in modules

| Module | Usage |
|---|---|
| **Postgres** | `postgres()` — auto-migration, typed queries |
| **Redis** | `redis()` — connection pool, pub/sub |
| **Queue** | `queue()` — cron + job queue |
| **AI** | `aiProvider()` — LLM provider abstraction |
| **SSE** | `createSSEStream()`, `formatSSE()` — server-sent events |
| **GraphQL** | `graphql()` — GraphQL handler |
| **Hub** | `createHub()` — real-time pub/sub hub |

### Utilities

- `loadEnv()` — load `.env` file
- `getCookies()`, `setCookie()`, `deleteCookie()` — cookie helpers
- `HttpError` — typed HTTP error class
- `logger` — structured logging
- `validate()` — request validation
- `upload()` — file upload handling
- `requestId()` — request ID middleware
- `testApp()`, `TestApp` — integration test helpers

## License

MIT
