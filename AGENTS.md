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
- Public hooks go in `react.ts` barrel; internal utilities stay in their module
- Frontend hooks use `useXxx` naming; each hook solves one concrete concern
- **README.md must be LLM-friendly** — document all public APIs with examples, avoid internal implementation details like `window.__xxx` globals

## Built-in module patterns

All built-in factory functions follow one of **two patterns**. Choose the right one based on whether the module needs to **intercept requests** or **serve routes**.

### Pattern α — Middleware: `app.use(mod())`

The module returns a `Middleware` callable — `(req, ctx, next) => Response`. Optionally has extras like `.close()`, `.stop()`.

```ts
// Basic
app.use(compress())
app.use(cors())
app.use(csrf())
app.use(helmet())
app.use(logger())
app.use(requestId())
app.use(validate({ body: schema }))
app.use(upload({ dir: './uploads' }))
app.use(auth({ token: 'sk-123' }))
app.use(seoMiddleware({ headers: { ... } }))
app.use(preferences({ dir: './locales' }))

// With extras
const pg = postgres()
app.use(pg)        // + .sql, .table, .migrate(), .transaction(), .close()

const q = queue({ redis })
app.use(q)         // + .add(), .process(), .run(), .stop(), .close()

const rl = rateLimit({ max: 100 })
app.use(rl)        // + .stop()
```

### Pattern β — Router: `app.use('/path', mod())`

The module returns a **`Router` instance** (same `Router` class from `router.ts`). May have `.migrate()`, `.close()`, `.middleware()` etc. attached.

```ts
// Simple routers
app.use('/health', health())
app.use('/', seo({ baseUrl: 'https://example.com' }))
app.use('/graphql', graphql(handler))
app.use('/chat', await aiStream(handler))

// Router with DB + programmatic API
const l = logdb({ pg })
await l.migrate()
app.use('/logs', l)
await l.log({ level: 'info', source: 'app', message: 'hello' })

const m = messager({ pg, agents, redis })
await m.migrate()
app.use('/api', m)
app.ws('/ws', m.wsHandler())

const a = agent({ pg, model })
await a.migrate()
app.use('/api', a)

const engine = iii({ pg, redis })
await engine.migrate()
app.use('/iii', engine)

const oc = await opencode({ pg, model, workspace })
await oc.migrate()
app.use('/opencode', oc)

// Router with separate middleware injection
const al = analytics()
app.use(al.middleware())   // tracking (global)
app.use('/', al)           // dashboard routes

const auth = user({ pg, jwtSecret })
await auth.migrate()
app.use('/auth', auth)                                     // register/login routes
app.get('/me', auth.middleware(), handler)                  // JWT middleware

const t = tenant({ pg, usersTable: '_users' })
await t.migrate()
app.use('/api', t.middleware())  // ctx.tenant
app.use('/api', t)               // CRUD routes
```

### Decision guide

```
Does the module need to intercept requests?
  ├─ Yes → Pattern α (Middleware)
  └─ No or also serves routes → Pattern β (Router)
```

### Client-side modules (Pattern γ)

Client-side modules self-register via `addInterceptor()` — import a hook to enable.

```ts
// client-my-feature.ts
import { addInterceptor } from './client-pref.ts'

addInterceptor(async (url) => {
  const m = url.pathname.match(/^\/__myfeature\/(\w+)$/)
  if (!m) return false
  // handle without page reload
  return true
})
```

### Naming conventions

- File: `my-mod.ts`, export `myMod`
- Options type: `MyOptions` (always exported)
- Pattern β modules: if the module has many custom methods beyond Router's, export `MyModule` interface extending `Router`
- Route URLs use `__` prefix to avoid user conflicts: `__analytics`, `__lang/:locale`, `__theme/:theme`

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
