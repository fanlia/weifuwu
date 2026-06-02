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
