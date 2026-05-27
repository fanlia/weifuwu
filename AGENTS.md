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

## Dependencies

- `ws` for WebSocket server
- `graphql` + `@graphql-tools/schema` for GraphQL
- `ai` (Vercel AI SDK) for AI streaming
- `zod` for request validation
- `react` + `react-dom` for `.tsx()` SSR + hydration
- `esbuild` for hydration bundle compilation
- Node.js built-in `WebSocket` for WebSocket clients
- Node.js built-in `zlib` for response compression

## tsx() — React SSR + Auto Hydration

`tsx({ dir })` — creates a Router from a React pages directory:

- SSR via `react-dom/server` `renderToReadableStream`
- Props are serialized as `window.__WEIFUWU_PROPS` in HTML
- Hydration: esbuild lazily compiles source → client bundle served at `/_wfw/client/`
- Props passed to component: `{ ...props, params, query }` (never `req`/`ctx`)

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

- `page.tsx` — default export = React component, receives `{ params, query }` + load data
- `load.ts` — default export = async function `({ params, query }) => props`, server-only
- `layout.tsx` — root layout receives `{ children, req, ctx }` (not hydrated); nested layouts receive `{ children }` (hydrated)
- `route.ts` — named exports `POST`/`PUT`/`DELETE`/`PATCH`, standard Handler signature (GET handled by page.tsx)
- `not-found.tsx` — default export = React component, rendered on 404 with full layout chain

### Usage

```ts
import { serve, Router } from 'weifuwu'
import { tsx } from 'weifuwu/tsx'

const r = new Router()
r.use('/', await tsx({ dir: './pages/' }))

// Other features coexist
r.ws('/chat', { message(ws, _, data) { ws.send(data) } })

serve(r.handler())
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
