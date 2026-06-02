---
name: weifuwu
description: Web-standard HTTP framework for Node.js — (req, ctx) => Response
---

# weifuwu

**Web-standard HTTP framework for Node.js.** `(req, ctx) => Response` — no framework-specific objects, just the Web API your browser already speaks.

### Design

weifuwu doesn't invent its own request/response abstraction. `Request` and `Response` are the same objects you use in `fetch()` — what you learn in the browser applies directly on the server. `ctx` is the only framework object, and it only carries what the router parsed for you (`params`, `query`).

Everything follows the same `(req, ctx) => Response` contract. The Router handles HTTP routing and WebSocket. All other features — auth, validation, database, GraphQL, AI — are standalone modules you import and mount with `app.use()`.

## Features

- **Web Standard** — `Request` / `Response` / `ReadableStream`, zero abstractions
- **Zero build** — native TypeScript in Node.js v24+, zero deps (core)
- **Trie router** — static > param > wildcard, sub-router mounting, WebSocket
- **Middleware** — global/path-scoped/route-level — onion model with short-circuit
- **Modules** — auth, validation, upload, compression, rate-limit, cookies, static files, CORS, logging
- **React SSR** — `tsx()` — pages, layouts, loaders, route handlers, Tailwind CSS, HMR
- **PostgreSQL** — schema builder with type-safe DDL + CRUD, transactions, vector search
- **Auth** — password + JWT + OAuth2 Server (authorization code / PKCE / client_credentials)
- **Real-time** — WebSocket, messaging channels with agent routing
- **AI** — streaming endpoint, DAG workflow tool, AI agents with RAG and tool-use
- **Data** — Redis client, job queue with cron scheduling
- **Multi-tenant BaaS** — dynamic tables, auto REST + GraphQL, row-level isolation
- **Deploy** — self-hosted PaaS: multi-app proxy, zero-downtime updates, auto SSL
- **i18n** — locale detection, JSON translations, `ctx.t()`
- **Email** — SMTP or custom transport
- **Health check** — configurable `/health` endpoint
- **Environment** — `loadEnv()` — `.env` file loader into `process.env`
- **Test utilities** — `createTestServer()` — one-line test server setup

## Quick start

### Hello World

```ts
import { serve } from 'weifuwu'
serve((req, ctx) => new Response('Hello, World!'), { port: 3000 })
```

### Full app

```ts
import { serve, Router, postgres, user, aiStream, graphql } from 'weifuwu'
import { openai } from '@ai-sdk/openai'

const app = new Router()
const pg = postgres()

// Auth
const auth = user({ pg, jwtSecret: process.env.JWT_SECRET! })
await auth.migrate()
app.use('/auth', auth.router())

// AI streaming
const chat = await aiStream(async (req) => ({
  model: openai('gpt-4o'),
  messages: (await req.json()).messages,
}))
app.use('/chat', chat.router())

// GraphQL
const gql = graphql(() => ({
  schema: `type Query { hello: String }`,
  resolvers: { Query: { hello: () => 'world' } },
}))
app.use('/graphql', gql.router())

// Static files
app.get('/static/*', serveStatic('./public'))

serve(app.handler(), { port: 3000 })
```

```
node app.ts
```

## Documentation

| Module | Doc | Description |
|--------|-----|-------------|
| **Router** | [docs/router.md](./docs/router.md) | Routes, middleware, WebSocket, error handling |
| **Middleware** | [docs/middleware.md](./docs/middleware.md) | auth, cors, logger, rateLimit, compress, validate, upload, cookie, static |
| **PostgreSQL** | [docs/postgres.md](./docs/postgres.md) | Schema builder, CRUD, DDL, transactions, PgModule |
| **Auth & User** | [docs/user.md](./docs/user.md) | Password, JWT, OAuth2 Server, Social Login cookbook |
| **React SSR** | [docs/tsx.md](./docs/tsx.md) | pages, layouts, loaders, Tailwind, shadcn/ui |
| **AI** | [docs/ai.md](./docs/ai.md) | `aiStream()`, `runWorkflow()` |
| **AI Agent** | [docs/agent.md](./docs/agent.md) | Chat, tool-use, RAG knowledge |
| **Opencode** | [docs/opencode.md](./docs/opencode.md) | Programming assistant, skills, sessions, permissions |
| **Messager** | [docs/messager.md](./docs/messager.md) | Real-time chat, channels, WebSocket, agent routing |
| **GraphQL** | [docs/graphql.md](./docs/graphql.md) | GraphQL endpoint with GraphiQL |
| **Tenant BaaS** | [docs/tenant.md](./docs/tenant.md) | Dynamic tables, auto REST + GraphQL, row isolation |
| **Extra** | [docs/extra.md](./docs/extra.md) | Health check, i18n, email, test utilities |

### Infrastructure

| Module | Import | What it gives you |
|--------|--------|-------------------|
| PostgreSQL | `postgres(options?)` | Connection pool + schema builder + CRUD + transactions |
| Redis | `redis(options?)` | ioredis client injected as `ctx.redis` |
| Queue | `queue(options?)` | Redis-backed job queue with cron scheduling |
| Deploy | `deploy(config)` | Self-hosted PaaS, see [deploy.md](./deploy.md) |

### Mountable modules

All use the same pattern — `const m = module(options)` → `app.use('/path', m.router())`:

| Module | Purpose | Also provides |
|--------|---------|---------------|
| `user(options)` | Auth (password + JWT + OAuth2) | `migrate()`, `middleware()`, `register()`, `login()`, `verify()`, `close()` |
| `tenant(options)` | Multi-tenant BaaS | `migrate()`, `middleware()`, `graphql()`, `close()` |
| `agent(options)` | AI agents | `migrate()`, `run()`, `addKnowledge()`, `close()` |
| `opencode(options)` | Programming assistant | `migrate()`, `wsHandler()`, `close()` |
| `messager(options)` | Real-time messaging | `migrate()`, `wsHandler()`, `send()`, `close()` |
| `aiStream(handler)` | AI streaming endpoint | — |
| `graphql(handler)` | GraphQL endpoint | — |
| `health(options?)` | Health check | — |

### Middleware (all `(req, ctx, next) => Response`)

| Middleware | Description |
|-----------|-------------|
| `auth(options)` | Bearer token / custom header / verify / proxy |
| `cors(options?)` | CORS with preflight, origin whitelist, credentials |
| `logger(options?)` | Request logging with duration |
| `rateLimit(options?)` | In-memory rate limiting with headers |
| `compress(options?)` | Brotli / Gzip / Deflate compression |
| `validate(schemas)` | Zod validation (body, query, params) |
| `upload(options?)` | Multipart file upload |
| `i18n(options)` | Internationalization — `ctx.t()`, locale detection |

### Utility functions

| Function | Description |
|----------|-------------|
| `serveStatic(root, options?)` | Static file serving |
| `loadEnv(path?)` | Load `.env` file into `process.env` — no override, comments, quotes |
| `getCookies(req)` / `setCookie(res, ...)` / `deleteCookie(res, ...)` | Cookie helpers |
| `mailer(options)` | Email sender (SMTP or custom) |
| `createTestServer(handler)` | Start test server → `{ server, url }` |
| `runWorkflow(options)` | DAG execution engine as AI SDK `Tool` |
| `pgTable(name, columns)` | Type-safe table schema builder |
| `pg.table(name, columns)` | Pre-bound table (no `sql` param needed) |
| `serial()`, `uuid()`, `text()`, ... | Column type builders |
| `PgModule` | Base class for DB-backed modules |

## License

MIT
