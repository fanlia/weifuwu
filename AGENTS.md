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

All built-in factory functions follow one of **three patterns**. Choose the right one based on whether the module needs to **intercept requests** or **serve routes**.

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
app.use(tailwind('./app.css'))

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

**Without a path** — for modules that register internal `__` routes invisible to the user:
```ts
app.use(liveReload({ dirs: ['./pages'] }))  // → /__weifuwu/livereload
```
The Router accepts `app.use(routerInstance)` — the sub-router is mounted at root, its internal paths are isolated.

### Pattern γ — SSR helper: `app.get('/', ssr('./page.tsx'))`

`ssr()` and `layout()` are not Router instances or middleware — they compile `.tsx` files and return the expected type (`Handler` or `Middleware`).

```ts
app.use(layout('./layouts/root.tsx'))   // returns Middleware
app.get('/', ssr('./pages/home.tsx'))   // returns Handler
```

### Decision guide

```
Does the module need to intercept requests?
  ├─ Yes → Pattern α (Middleware)
  └─ No or also serves routes → Pattern β (Router)
  
Need to compile a .tsx file?
  └─ ssr(path) → Handler, layout(path) → Middleware
```

### Client-side modules (Pattern δ)

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
- Route URLs use `__` prefix to avoid user conflicts: `__analytics`, `__lang/:locale`, `__theme/:theme`, `__weifuwu/livereload`, `__ssr/[hash].js`

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

### SSR + HMR 手动测试流程

使用 `cli/template/` 作为测试项目（模板已引用本地源文件，无需编译）：

```bash
# 1. 从 repo root 启动
node cli/template/index.ts

# 或指定数据库启动（测试 opencode 等多 ssr 路由）
DATABASE_URL=postgres://root:123456@localhost:5432/demo node cli/template/index.ts
```

```bash
# 2. 打开浏览器
open http://localhost:3000/
```

```bash
# 3. 验证热更新
# 编辑 cli/template/ui/page.tsx 或 ui/components/Greeting.tsx
# 保存后页面自动更新，URL 不变

# 4. 验证状态保持
# 在页面输入框打字 → 编辑组件 → 输入框内容保留

# 5. 验证多 ssr 路由
# 先启动时传入 DATABASE_URL，然后访问 /opencode/
# 编辑 page.tsx 只触发 / 页面更新，不影响 /opencode/

# 6. 验证编译失败 fallback
# 在 page.tsx 中引入语法错误 → 浏览器全页面刷新
```

```bash
# 7. 查看 vendor bundle
curl -s http://localhost:3000/__wfw/v/bundle | head

# 8. 查看 hydration bundle（entry hash 从 SSR HTML 中取）
curl -s http://localhost:3000/__ssr/<hash>.js | head

# 9. 查看热更新 bundle（hash 在 WS 消息中）
curl -s http://localhost:3000/__wfw/h/<hash> | head
```

### SSR 关键机制

- **dev 模式**（`NODE_ENV !== 'production'`）：`createRoot` + 稳定代理 `_W`，`root.render()` 触发 reconciliation → fiber 复用 → `useState` 保留
- **prod 模式**：`hydrateRoot`，无额外依赖
- **vendor bundle**：`/__wfw/v/bundle`，所有 ssr() 共享同一份 React + weifuwu/react
- **entry hash 隔离**：每个 `ssr()` 独立 hydration bundle（`bundleCache` keyed by entry hash），WS 消息携带 `entry` 字段匹配当前页面
- **惰性清除**：hydration bundle 在热更新时仅标记脏，下次请求才清除并重编

## API Reference

See [README.md](./README.md) for full API documentation including `ssr()`, `layout()`, Router, middleware, and utilities.
