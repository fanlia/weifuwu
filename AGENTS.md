This is the **weifuwu** HTTP microframework — pure Node.js, no build step.

## Project Structure

```
weifuwu/
  index.ts              — barrel exports (public API)
  cli.ts                — CLI (init, version)
  types.ts              — Context, Handler, Middleware, HttpError, Closeable + type re-exports

  core/                 — Framework kernel (zero external dependencies)
    serve.ts              HTTP server, lifecycle, graceful shutdown
    router.ts             Request routing, middleware chain, WebSocket upgrade
    trace.ts              Distributed tracing (AsyncLocalStorage-based)
    env.ts                Environment variable loading
    logger.ts             Request logger
    cookie.ts             Cookie parsing and setting
    sse.ts                Server-Sent Events utilities

  middleware/           — Pattern α middleware (flat files, each <200 lines)
    compress.ts, cors.ts, csrf.ts, flash.ts, helmet.ts
    request-id.ts, rate-limit.ts, static.ts, validate.ts, upload.ts
    health.ts, theme.ts, i18n.ts

  ai/                   — AI provider + streaming endpoint
    provider.ts           AIProvider factory (ctx.ai)
    stream.ts             aiStream middleware

  postgres/             — PostgreSQL client (pattern α middleware)
    client.ts, types.ts, module.ts
    schema/               Table builder, migrations, query helpers

  redis/                — Redis client (pattern α middleware)
    client.ts, types.ts

  queue/                — Job queue (pattern α middleware, memory/pg/redis backends)
    index.ts, types.ts, cron.ts

  hub.ts                — Pub/sub hub for WebSocket rooms
  graphql.ts            — GraphQL handler (pattern β)
  mailer.ts             — Email sender (nodemailer wrapper)

  test/                 — Tests
    test-utils.ts         Test helpers (TestApp, createTestDb, etc.)
    *.test.ts
```

## Principles

### TypeScript

- All imports must use explicit `.ts` extensions (e.g. `import { x } from './foo.ts'`)
- Node.js v24+ supports TypeScript natively — no `--experimental-strip-types`, no `tsc` needed
- `npx tsc --noEmit` for type-checking only

### Core types

```ts
type Handler<T extends Context = Context> = (req: Request, ctx: T) => Response | Promise<Response>

type Middleware<In extends Context = Context, Out extends In = In> = {
  (req: Request, ctx: In, next: Handler<Out>): Response | Promise<Response>
  __meta?: MiddlewareMeta
}
```

### ctx field principle

Each middleware adds exactly one namespaced field on `ctx`. The `req` object is never modified.

| Pattern α middleware    | Injects          | Type safety                             |
| ----------------------- | ---------------- | --------------------------------------- |
| `app.use(postgres())`   | `ctx.sql`        | `declare module` + `PostgresInjected`   |
| `app.use(redis())`      | `ctx.redis`      | `declare module` + `RedisInjected`      |
| `app.use(aiProvider())` | `ctx.ai`         | `declare module` + `AIProviderInjected` |
| `app.use(queue())`      | `ctx.queue`      | `declare module` + `QueueInjected`      |
| `app.use(theme())`      | `ctx.theme`      | `declare module` + `ThemeInjected`      |
| `app.use(i18n())`       | `ctx.i18n`       | `declare module` + `I18nInjected`       |
| `app.use(flash())`      | `ctx.flash`      | `declare module` + `FlashInjected`      |
| `app.use(csrf())`       | `ctx.csrf.token` | `declare module` + `CsrfInjected`       |
| `app.use(requestId())`  | `ctx.requestId`  | `declare module`                        |
| `app.use(validate())`   | `ctx.parsed`     | `declare module` (shared with upload)   |
| `app.use(upload())`     | `ctx.parsed`     | `declare module` (shared with validate) |
| `ws('/chat', handler)`  | `ctx.ws`         | —                                       |

### Type safety rule

Every ctx-injecting module MUST add `declare module '../types.ts'` in its module file (relative to the module's location). If the module is in `core/` or `middleware/`, use `declare module '../types.ts'`. Directory modules (`postgres/`, `redis/`) that are siblings of `types.ts` use `declare module '../types.ts'`.

```ts
// middleware/csrf.ts
declare module '../types.ts' {
  interface Context {
    csrf: { token: string }
  }
}
```

Modules should also export an `XxxInjected` interface for type composition.

### Lifecycle rule

All stateful modules cleanup via `.close(): Promise<void>`. Return type should include or extend `Closeable`.

### Code conventions

- `Handler = (req, ctx) => Response | Promise<Response>`
- Middleware = `(req, ctx, next) => Response | Promise<Response>`
- Import types from `../types.ts`, source from individual files / directory barrels
- Every module needs tests in `test/`
- `ctx` mutations should be additive, never overwrite existing fields
- Follow existing patterns — read the full file before editing

## Module patterns

All built-in functions follow one of three patterns:

### Pattern α — Middleware

Returns a `Middleware` callable. Use with `app.use(mod())`.

```ts
const m = postgres({ connection: '...' })
app.use(m) // → ctx.sql
app.use(rateLimit()) // → rate-limits requests
```

Pattern α modules may also have `.close()`, `.migrate()` attached.

Modules: `postgres()`, `redis()`, `aiProvider()`, `queue()`, `compress()`, `cors()`, `csrf()`, `flash()`, `helmet()`, `requestId()`, `rateLimit()`, `static()`, `validate()`, `upload()`, `health()`, `theme()`, `i18n()`

### Pattern β — Router

Returns a `Router` instance. Use with `app.use('/path', mod())`.

```ts
app.use('/graphql', graphql({ schema: typeDefs }))
app.get('/health', health())
```

Modules with `.middleware()` (theme, i18n) support auto-registration:

```ts
app.use(theme()) // registers both middleware and default routes
```

Modules: `graphql()`, `health()`, `theme()`, `i18n()`

### Pattern γ — Standalone

Returns a utility object, not middleware or router.

Modules: `mailer()`, `createSSEStream()`, `formatSSE()`

## Naming conventions

### File & directory

- Single-file module: `my-mod.ts`, export `myMod`
- Directory modules (3+ files):
  - `index.ts` — barrel re-export
  - `client.ts` — factory function (or inline in index.ts for small modules)
  - `types.ts` — type definitions
  - Sub-features: `routes.ts`, `ws.ts`, `utils.ts`, `cron.ts`

### Exports

- Options type: always `export interface XxxOptions`
- Pattern α: export `XxxModule` or `XxxClient` interface `extends Middleware<Context, Context & XxxInjected>, Closeable`
- Pattern β: export `XxxModule` interface `extends Router`
- All injected types: export `XxxInjected` interface
- All types re-exported from `index.ts` barrel

### Return type patterns

```ts
export interface PostgresClient extends Middleware<Context, Context & PostgresInjected>, Closeable {
  sql: Sql<{}>
  close(): Promise<void>
  migrate(): Promise<void>
}
```

Avoid inline return types — always use a named interface.

### Lifecycle methods

- Cleanup: always `.close(): Promise<void>`. Never `stop()` or `shutdown()`.
- DB setup: always `.migrate(): Promise<void>`. Call at startup; safe to call multiple times.

### Route URLs

- Internal routes use `__` prefix (e.g. `__theme/:theme`, `__lang/:locale`)
- Public API routes have no prefix
- All routes should be mountable under a user-chosen prefix via `app.use('/prefix', mod)`

## Database

- Docker Compose: `docker compose up -d` starts PostgreSQL (port 5432, root/123456/demo), Adminer (30080), Redis (6379)
- DB-dependent tests use `DATABASE_URL` or `TEST_DATABASE_URL`; auto-skipped when no URL is set
- **JSONB gotchas**: use plain JS objects (not `JSON.stringify`) with `@>` and `sql.unsafe`; always coerce `row.metadata` from string when returned from partitioned tables

## Testing

Tests live in `test/` and follow the pattern: create a `Router`, call `r.handler()(request, ctx)`, assert on the response.

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../core/router.ts'

describe('my feature', () => {
  it('returns 200', async () => {
    const app = new Router()
    app.get('/', () => new Response('ok'))
    const res = await app.handler()(new Request('http://localhost/'), { params: {}, query: {} })
    assert.equal(res.status, 200)
  })
})
```

For end-to-end tests, use `serve()`:

```ts
import { serve } from '../core/serve.ts'
```

## CLI

```bash
npx weifuwu init <name>           # Create a new API project
npx weifuwu version               # Print version
```
