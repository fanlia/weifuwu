This is the weifuwu HTTP framework — pure Node.js, no build step.

## Commands

- `node --test` — run all tests
- `npm install` — install dependencies
- `npx tsc --noEmit` — type-check without emitting

## TypeScript rules

- All imports must use explicit `.ts` extensions (e.g. `import { x } from './foo.ts'`)
- Node.js v24+ supports TypeScript natively (no `--experimental-strip-types` needed)
- No `tsc` compiler needed for runtime (native TS via Node.js)

## Code conventions

- Read the full file before editing — context matters
- Follow existing patterns: `Handler = (req, ctx) => Response | Promise<Response>`
- All middleware returns a `Middleware` — `(req, ctx, next) => Response | Promise<Response>`
- Import types from `./types.ts`, source from individual files
- New modules get their own file, exported from `index.ts`
- Every module needs tests in `test/`
- All `ctx` mutations (like `ctx.parsed` or `ctx.user`) should be additive, never overwrite

## Built-in module patterns

All built-in factory functions follow one of **five patterns**. Choose the right one based on what your module needs.

### Pattern A — Pure Middleware

For modules that only need to intercept requests and set context. No routes, no DB migration.

```ts
export function myMod(options?: MyOptions): Middleware
```

**Usage:** `app.use(myMod({ ... }))`

| Module | Extra |
|--------|-------|
| `compress()` | — |
| `cors()` | — |
| `csrf()` | sets `ctx.csrfToken` |
| `helmet()` | — |
| `logger()` | — |
| `requestId()` | sets `ctx.requestId` |
| `validate()` | sets `ctx.parsed` |
| `upload()` | sets `ctx.parsed` |
| `auth()` | sets `ctx.user` |
| `seoMiddleware()` | — |
| `preferences()` | auto-handles `/__lang/:locale`, `/__theme/:theme` |

### Pattern B — Middleware with extras

Same as Pattern A, but the middleware function has additional methods attached as properties (for cleanup, migration, etc.).

```ts
export function myMod(options?: MyOptions): Middleware & { stop: () => void }
```

**Usage:**
```ts
const m = myMod({ ... })
app.use(m)
// m.stop() — cleanup
```

| Module | Attached |
|--------|----------|
| `rateLimit()` | `.stop()` |
| `postgres()` | `.sql`, `.table`, `.migrate()`, `.transaction()`, `.close()` |
| `redis()` | `.redis`, `.close()` |
| `queue()` | `.add()`, `.process()`, `.run()`, `.stop()`, `.close()` |

Use this pattern when:
- The module IS middleware (callable as `(req, ctx, next)`)
- But also needs a few extra methods for lifecycle or configuration
- Not suitable when there are many methods or a full router

### Pattern C — Module object

For complex modules that need middleware + routes + DB migration + programmatic API. Returns a non-callable object with methods.

```ts
export interface MyModule {
  middleware: () => Middleware     // factory, returns a Middleware
  router: () => Router             // routes to mount
  migrate: () => Promise<void>     // DB setup (idempotent)
  close: () => Promise<void>       // cleanup
}

export function myMod(options: MyOptions): MyModule
```

**Usage:**
```ts
const m = myMod({ pg })
await m.migrate()
app.use(m.middleware())
app.use('/', m.router())
```

**Conventions:**
- `middleware()` is a **factory method** (returns a new `Middleware` each call), not a direct property
- `router()` creates and returns a `Router` (routes may be recreated each call)
- `migrate()` is always present; if no DB connection provided, it should be a no-op
- `close()` is always present for cleanup
- Export the module interface type for consumers

| Module | Extra methods beyond the standard four |
|--------|----------------------------------------|
| `analytics()` | — |
| `logdb()` | `.log()`, `.clean()` |
| `user()` | `.register()`, `.login()`, `.verify()`, `.registerClient()`, `.getClient()`, `.revokeClient()` |
| `tenant()` | `.graphql()` |
| `messager()` | `.wsHandler()`, `.send()` |
| `agent()` | `.run()`, `.addKnowledge()` |
| `iii()` | `.addWorker()`, `.removeWorker()`, `.trigger()`, `.listWorkers()`, `.listFunctions()`, `.listTriggers()`, `.shutdown()` |
| `opencode()` | `.wsHandler()` |

### Pattern D — Router factory

For modules that are purely route-based (no middleware, no state to inject into context).

```ts
export function myMod(options?: MyOptions): Router
```

**Usage:** `app.use('/', myMod({ ... }).handler())`

| Module | Routes registered |
|--------|-------------------|
| `health()` | `GET /health`, `HEAD /health` |
| `seo()` | `GET /robots.txt`, `GET /sitemap.xml` |

### Pattern E — Minimal router holder

For modules that only need to expose routes, but the factory itself is not a Router.

```ts
export function myMod(handler: X): { router(): Router }
```

**Usage:**
```ts
const g = graphql(handler)
app.use('/graphql', g.router().handler())
```

| Module | Signature |
|--------|----------|
| `graphql(handler)` | `{ router(): Router }` |
| `aiStream(handler)` | `Promise<{ router(): Router }>` |

### Decision guide

```
Does the module need to intercept requests?
  ├─ No → Does it expose routes?
  │     ├─ No utility function, not a factory (e.g. getCookies, formatSSE)
  │     ├─ Yes, just routes → Pattern D or E
  │     └─ Yes, routes + DB + programmatic API → Pattern C
  └─ Yes → Does it need routes / DB migration / many extra methods?
        ├─ No → Pattern A
        ├─ Yes, but it's fundamentally middleware with a few extras → Pattern B
        └─ Yes, complex → Pattern C (with .middleware() factory)
```

### Naming conventions

- Pure middleware file: `my-mod.ts`, export `myMod`
- Module object file: `my-mod/index.ts` (if multi-file) or `my-mod.ts` (if single), export `myMod` + `MyOptions` + `MyModule`
- Options type: `MyOptions` (always exported for consumers to use)
- Module interface: `MyModule` (Pattern C only, always exported)
- Route URLs use `__` prefix to avoid user conflicts: `__analytics`, `__analytics/data`, `__lang/:locale`, `__theme/:theme`

## Database (PostgreSQL + Redis)

Docker Compose at `docker-compose.yml` starts all services:

```bash
docker compose up -d          # start PostgreSQL, Redis, Adminer
```

| Service | Port | Credentials |
|---------|------|-------------|
| PostgreSQL | 5432 | `root / 123456 / demo` |
| Adminer | 30080 | — |
| Redis | 6379 | — |

DB-dependent tests use `DATABASE_URL` or `TEST_DATABASE_URL`:

```bash
DATABASE_URL=postgres://root:123456@localhost:5432/demo node --test
```

Tests that require a database are auto-skipped when no URL is set.

### postgres.js JSONB gotchas

- **`@>` with `sql.unsafe`** — pass a plain JS object, not `JSON.stringify()`:
  ```ts
  // broken — returns 0 rows
  sql.unsafe('WHERE metadata @> $1', [JSON.stringify({ service: 'auth' })])
  // fixed
  sql.unsafe('WHERE metadata @> $1', [{ service: 'auth' }])
  ```
- **JSONB return type on partitioned tables** — postgres.js may return `row.metadata` as a JSON string instead of a parsed object. Always coerce in handlers:
  ```ts
  if (typeof row.metadata === 'string') {
    row.metadata = JSON.parse(row.metadata)
  }
  ```

## Testing

```ts#test/example.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('example', () => {
  it('works', () => {
    assert.equal(1 + 1, 2)
  })
})
```

Tests live in `test/` and follow the pattern: create a `Router`, call `r.handler()(request, ctx)`, assert on the response. For end-to-end tests, use `serve()`.

## API Reference

See [README.md](./README.md) for full API documentation including `tsx()`, Router, middleware, and utilities.
