This is the weifuwu HTTP framework — pure Node.js, no build step.

## Principles

### TypeScript

- All imports must use explicit `.ts` extensions (e.g. `import { x } from './foo.ts'`)
- Node.js v24+ supports TypeScript natively (no `--experimental-strip-types` needed)
- No `tsc` compiler needed for runtime (native TS via Node.js)

### Code conventions

- Read the full file before editing — context matters
- Follow existing patterns: `Handler = (req, ctx) => Response | Promise<Response>`
- All middleware returns a `Middleware` — `(req, ctx, next) => Response | Promise<Response>`
- Import types from `./types.ts`, source from individual files
- New modules get their own file, exported from `index.ts`
- Every module needs tests in `test/`
- AIProvider is the unified AI config interface: `model()`, `embeddingModel()`, `embed()`, `embedMany()`, `generateText()`, `streamText()`, `dimension`. Modules use it for model resolution; handlers use `ctx.ai` for direct AI calls.
- **Never import `streamText`/`generateText`/`embed` from the `ai` SDK directly in application code.** Always use `provider.streamText()` or `ctx.ai.streamText()` — the provider injects the configured model automatically.
- **ctx field principle**: each middleware adds exactly one namespaced field on `ctx`. Standard objects (`req`, `ws`) are never modified. The framework injects, the developer uses.

  | Pattern α middleware | Injects | Type safety |
  |---|---|---|
  | `app.use(postgres())` | `ctx.sql` | `declare module` + `PostgresInjected` |
  | `app.use(redis())` | `ctx.redis` | `declare module` + `RedisInjected` |
  | `app.use(aiProvider())` | `ctx.ai` | `declare module` + `AIProviderInjected` |
  | `app.use(queue())` | `ctx.queue` | `declare module` + `QueueInjected` |
  | `app.use(session())` | `ctx.session` | `declare module` + `SessionInjected` |
  | `app.use(auth())` | `ctx.user` | `declare module` |
  | `app.use(user().middleware())` | `ctx.user` (含完整用户数据) | `UserInjected` |
  | `app.use(permissions())` | `ctx.permissions` `{ roles, permissions }` | `declare module` + `PermissionsModule` |
  | `app.use(theme().middleware())` | `ctx.theme` `{ value, set }` | `declare module` + `ThemeInjected` |
  | `app.use(i18n().middleware())` | `ctx.i18n` `{ locale, t, set }` | `declare module` + `I18nInjected` |
  | `app.use(flash())` | `ctx.flash` `{ value, set }` | `declare module` + `FlashInjected` |
  | `app.use(csrf())` | `ctx.csrf.token` | `declare module` + `CsrfInjected` |
  | `app.use(requestId())` | `ctx.requestId` | `declare module` |
  | `app.use(s3())` | `ctx.s3` | `declare module` + `S3Module` |
  | `app.use(tenant())` | `ctx.tenant` | `declare module` + `TenantContext` |
  | `app.use(validate())` / `app.use(upload())` | `ctx.parsed` | `declare module` (shared field) |
  | `ws('/chat', handler)` | `ctx.ws` (per-connection) | — |

  `ctx.ws` is the per-connection WebSocket helper: `ctx.ws.state`, `ctx.ws.json()`, `ctx.ws.join(room)`, `ctx.ws.sendRoom(room, data)`. The `ws` parameter in handlers is the standard `WebSocket` from the `ws` library — never augmented.

- **Type safety rule**: Every ctx-injecting module MUST add `declare module './types.ts' { interface Context { field: Type } }` in its module file. This ensures ctx fields are typed regardless of whether the user chains `use()` calls or uses standalone `app.use()`.
- Modules SHOULD also export an `XxxInjected` type for composing custom context types and for use in generic type parameters.

- **Lifecycle rule**: All stateful modules cleanup via `.close(): Promise<void>`. Aliases `.stop()` and `.shutdown()` are deprecated in favor of `.close()`.

- All `ctx` mutations (like `ctx.parsed` or `ctx.user`) should be additive, never overwrite
- Public hooks go in `react.ts` barrel; internal utilities stay in their module
- Frontend hooks use `useXxx` naming; each hook solves one concrete concern
- **README.md must be LLM-friendly** — document all public APIs with examples, avoid internal implementation details like `window.__xxx` globals

### Core modules

The framework has five core modules that other modules depend on:

| Module | Import | Role |
|--------|--------|------|
| **serve** | `serve()` | HTTP server, lifecycle, graceful shutdown |
| **router** | `Router` | Request routing, middleware chain, WebSocket upgrade |
| **postgres** | `postgres()` | Database client (Pattern α — middleware), pool management, table builder, migrations |
| **redis** | `redis()` | Redis client (Pattern α — middleware), connection management |
| **ai provider** | `aiProvider()` | AI model & embedding abstraction, env-based config |

Modules like `agent`, `kb`, `user`, `session`, `queue`, `permissions` depend on `postgres`. Modules like `agent`, `kb`, `aiStream`, `runWorkflow` depend on `ai provider`. Every module that depends on a core module accepts it as a constructor parameter (e.g. `agent({ pg, provider })`), never creates its own connection.

### User 模块能力

`user()` 集成了三个子能力:

| 子能力 | 选项 | 路由 |
|--------|------|------|
| 本地注册/登录 | — | `POST /register`, `POST /login` |
| OAuth2 服务端 | `oauth2: { server: true }` | `GET /oauth/authorize`, `POST /oauth/consent`, `POST /oauth/token` |
| 社会化登录 | `oauthLogin: { providers: {...} }` | `GET /auth/:provider`, `GET /auth/:provider/callback` |
| JWT 验证 | `.middleware()` | — (注入 ctx.user) |

### Permissions 模块

`permissions()` 是 Pattern α 模块，提供 RBAC 授权:

```ts
const perm = permissions({ pg })
app.use((req, ctx, next) => { ctx.user = { id: 1 }; return next(req, ctx) })
app.use(perm)                    // → ctx.roles, ctx.permissions
app.get('/admin', perm.requireRole('admin'), handler)
app.post('/posts', perm.requirePermission('posts:create'), handler)

// 管理 API
await perm.assignRole(userId, 'editor')
await perm.grantPermission('editor', 'posts:create')
```

`aiProvider()` is also a Pattern α middleware — `app.use(aiProvider())` injects `ctx.ai`, allowing handlers and middlewares to make AI calls directly:

```ts
app.use(aiProvider())

app.get('/ask', async (req, ctx) => {
  const result = await ctx.ai.generateText({ prompt: ctx.query.q })
  return Response.json(result)
})
```

### Module patterns

All built-in factory functions follow one of four patterns:

- **Pattern α — Middleware**: module returns a `Middleware` callable. Use with `app.use(mod())`. Optionally has extras like `.close()`, `.migrate()`.
  - e.g. `compress()`, `csrf()`, `flash()`, `helmet()`, `postgres()`, `redis()`, `aiProvider()`, `session()`, `permissions()`, `rateLimit()`, `s3()`, `cache()`, `validate()`, `upload()`
- **Pattern β — Router**: module returns a `Router` instance. Use with `app.use('/path', mod())`. May have `.migrate()`, `.close()`, `.middleware()` attached.
  - e.g. `health()`, `graphql()`, `ssr()`, `user()`, `analytics()`, `agent()`, `messager()`, `opencode()`, `iii()`, `logdb()`, `kb()`, `seo()`, `webhook()`, `theme()`, `i18n()`
- **Pattern γ — Standalone**: module returns a utility object, not middleware or router. Import and call directly.
  - e.g. `mailer()`, `fts`, `cron-utils`, `createSSEStream()`
- **Pattern δ — Client-side**: modules self-register via `addInterceptor()` — import a hook to enable.
  - e.g. `useTheme()`, `useLocale()`, `useWebsocket()` from `'weifuwu/react'`

### Naming conventions

- File: `my-mod.ts`, export `myMod`
- Options type: `MyOptions` (always exported)
- Pattern β modules with many custom methods: export `MyModule` interface extending `Router`
- Pattern α modules that inject ctx fields: export `XxxInjected` interface for the injected shape; add `declare module './types.ts'` in the module file
- Lifecycle methods: cleanup is always `.close()` (not `stop()` or `shutdown()`); DB setup is always `.migrate()`
- Route URLs use `__` prefix to avoid user conflicts: `__analytics`, `__lang/:locale`, `__theme/:theme`, `__weifuwu/livereload`, `__ssr/[hash].js`

### Database (PostgreSQL + Redis)

- Docker Compose: `docker compose up -d` starts PostgreSQL (port 5432, root/123456/demo), Adminer (30080), Redis (6379)
- DB-dependent tests use `DATABASE_URL` or `TEST_DATABASE_URL`; auto-skipped when no URL is set
- **JSONB gotchas**: use plain JS objects (not `JSON.stringify`) with `@>` and `sql.unsafe`; always coerce `row.metadata` from string when returned from partitioned tables

### Testing

Tests live in `test/` and follow the pattern: create a `Router`, call `r.handler()(request, ctx)`, assert on the response. For end-to-end tests, use `serve()`.
