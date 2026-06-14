# Module Matrix — Baseline Audit

All built-in modules, their pattern classification, type safety approach, lifecycle methods, and dependencies.

## Legend

| Column | Meaning |
|--------|---------|
| Pattern | α = Middleware, β = Router, γ = Standalone, δ = Client-side |
| Return | Factory function's return type |
| DeclMod | Does the module use `declare module './types.ts'`? |
| Generic | Does the factory use generic type parameters? |
| ctx field | What property does the middleware inject into `ctx`? |
| ctx type | The TypeScript type of the injected field |
| Migrate | Has `.migrate()` method for DB setup |
| Close | Has `.close()` (or equivalent) for cleanup |
| Deps | Core dependencies (serve, router, postgres, redis, ai) |

---

## Core

| Module | File | Pattern | Return | DeclMod | Generic | ctx field | ctx type | Migrate | Close | Deps |
|--------|------|---------|--------|---------|---------|-----------|----------|---------|-------|------|
| `serve` | `serve.ts` | — | `Server` | — | — | — | — | — | `stop()` | — |
| `Router` | `router.ts` | — | `Router<T>` | — | ✅ | — | — | — | — | — |
| `loadEnv` | `env.ts` | α | `void` | ❌ | ❌ | `ctx.env` | `Record<string, string>` | — | — | — |
| `trace` | `trace.ts` | — | — | — | — | — | — | — | — | — |
| `testApp` | `test-utils.ts` | — | `TestApp` | — | — | — | — | — | — | — |
| `createTestServer` | `serve.ts` | — | `{ server, url }` | — | — | — | — | — | — | — |

---

## Database

| Module | File | Pattern | Return | DeclMod | Generic | ctx field | ctx type | Migrate | Close | Deps |
|--------|------|---------|--------|---------|---------|-----------|----------|---------|-------|------|
| `postgres` | `postgres/client.ts` | α | `PostgresClient` | ✅ (in types.ts) | ❌ | `ctx.sql` | `Sql<{}>` | ✅ | `close()` | — |
| `redis` | `redis/index.ts` | α | `RedisClient` | ✅ (in types.ts) | ❌ | `ctx.redis` | `Redis` | — | `close()` | — |
| `queue` | `queue/index.ts` | α | `Queue` | ✅ (in types.ts) | ❌ | `ctx.queue` | `Queue` | ✅ (PG) | `close()` + `stop()` | postgres / redis |
| `fts` | `fts.ts` | γ | namespace | — | — | — | — | — | — | postgres |

---

## Security & Auth

| Module | File | Pattern | Return | DeclMod | Generic | ctx field | ctx type | Migrate | Close | Deps |
|--------|------|---------|--------|---------|---------|-----------|----------|---------|-------|------|
| `auth` | `auth.ts` | α | `Middleware` | ❌ | ❌ | `ctx.user` | `unknown` | — | — | — |
| `user` | `user/client.ts` | β | `UserModule` | ❌ | ❌ | `ctx.user` | `UserData` via `.middleware()` | ✅ | `close()` | postgres |
| `csrf` | `csrf.ts` | α | `Middleware` | ❌ | ✅ | `ctx.csrfToken` | `string` | — | — | — |
| `helmet` | `helmet.ts` | α | `Middleware` | — | ❌ | — | — | — | — | — |
| `permissions` | `permissions.ts` | α | `PermissionsModule` | ✅ | ❌ | `ctx.permissions` | `{ roles, permissions }` | ✅ | — | postgres |
| `rateLimit` | `rate-limit.ts` | α | `Middleware` + `.stop()` | — | ❌ | — | — | — | `stop()` | redis (optional) |
| `session` | `session.ts` | α | `Middleware` + `.close()` | ✅ | ❌ | `ctx.session` | `Session` | — | `close()` | redis (optional) |

---

## UX Middleware

| Module | File | Pattern | Return | DeclMod | Generic | ctx field | ctx type | Migrate | Close | Deps |
|--------|------|---------|--------|---------|---------|-----------|----------|---------|-------|------|
| `theme` | `theme.ts` | α (self-routing) | `Middleware` | ❌ | ❌ | `ctx.theme` | `{ value, set }` | — | — | — |
| `i18n` | `i18n.ts` | α (self-routing) | `Middleware` | ❌ | ❌ | `ctx.i18n` | `{ locale, t, set }` | — | — | — |
| `flash` | `flash.ts` | α | `Middleware` | ❌ | ✅ | `ctx.flash` | `FlashInjected` | — | — | — |

---

## AI

| Module | File | Pattern | Return | DeclMod | Generic | ctx field | ctx type | Migrate | Close | Deps |
|--------|------|---------|--------|---------|---------|-----------|----------|---------|-------|------|
| `aiProvider` | `ai/provider.ts` | α (promised) | `AIProvider` | ❌ | ❌ | `ctx.ai` | `AIProvider` | — | — | — |
| `aiStream` | `ai.ts` | β | `Router` | — | — | — | — | — | — | aiProvider |
| `runWorkflow` | `ai/workflow.ts` | γ | `Workflow` | — | — | — | — | — | — | aiProvider |
| `agent` | `agent/index.ts` | β | `AgentModule` | — | — | — | — | ✅ | `close()` | postgres + aiProvider |
| `knowledgeBase` | `kb/index.ts` | β | `KBModule` | — | — | — | — | ✅ | — | postgres + aiProvider |
| `opencode` | `opencode/index.ts` | β | `OpencodeModule` | — | — | — | — | ✅ | — | postgres + aiProvider |

---

## APIs & Routing

| Module | File | Pattern | Return | DeclMod | Generic | ctx field | ctx type | Migrate | Close | Deps |
|--------|------|---------|--------|---------|---------|-----------|----------|---------|-------|------|
| `graphql` | `graphql.ts` | β | `Router` | — | — | — | — | — | — | — |
| `webhook` | `webhook.ts` | β | `WebhookModule` | — | — | — | — | — | — | — |
| `sse` | `sse.ts` | γ | utilities | — | — | — | — | — | — | — |
| `health` | `health.ts` | β | `Router` | — | — | — | — | — | — | — |
| `analytics` | `analytics.ts` | β | `AnalyticsModule` | — | — | — | — | ✅ | `close()` | postgres (optional) |
| `logdb` | `logdb/client.ts` | β | `LogdbModule` | — | — | — | — | ✅ | `close()` | postgres |
| `seo` | `seo.ts` | β | `Router` | — | — | — | — | — | — | — |

---

## Networking & Storage

| Module | File | Pattern | Return | DeclMod | Generic | ctx field | ctx type | Migrate | Close | Deps |
|--------|------|---------|--------|---------|---------|-----------|----------|---------|-------|------|
| `s3` | `s3.ts` | α | `S3Module & Middleware` | ✅ | ❌ | `ctx.s3` | `S3Module` | — | — | — |
| `mailer` | `mailer.ts` | γ | `Mailer` | — | — | — | — | — | `close()` | — |
| `messager` | `messager/index.ts` | β | `MessagerModule` | — | — | — | — | ✅ | `close()` | postgres + redis |
| `hub` | `hub.ts` | γ | `Hub` | — | — | — | — | — | — | redis (optional) |
| `deploy` | `deploy/index.ts` | γ | `DeployServer` | ✅ (in types.ts) | — | `ctx.deploy` | — | — | `close()` | — |
| `tenant` | `tenant/index.ts` | β | `TenantModule` | ✅ (in types.ts) | — | `ctx.tenant` | `TenantContext` | ✅ | — | postgres |

---

## SSR

| Module | File | Pattern | Return | DeclMod | Generic | ctx field | ctx type | Migrate | Close | Deps |
|--------|------|---------|--------|---------|---------|-----------|----------|---------|-------|------|
| `ssr` | `ssr.ts` | β | `Router` | — | — | `ctx.layoutStack` | `LayoutEntry[]` | — | `close()` | — |

---

## Dev Tools

| Module | File | Pattern | Return | DeclMod | Generic | ctx field | ctx type | Migrate | Close | Deps |
|--------|------|---------|--------|---------|---------|-----------|----------|---------|-------|------|
| `validate` | `validate.ts` | α | `Middleware` | ❌ | ❌ | `ctx.parsed` | `{ body?, query?, params?, headers? }` | — | — | — |
| `upload` | `upload.ts` | α | `Middleware` | ❌ | ❌ | `ctx.parsed` | `{ files?, fields? }` | — | — | — |
| `cache` | `cache.ts` | α | `CacheMiddleware` | — | ❌ | — | — | — | `close()` | redis (optional) |
| `compress` | `compress.ts` | α | `Middleware` | — | ❌ | — | — | — | — | — |
| `cors` | `cors.ts` | α | `Middleware` | — | ❌ | — | — | — | — | — |
| `logger` | `logger.ts` | α | `Middleware` | — | ❌ | — | — | — | — | — |
| `serveStatic` | `static.ts` | α | `Middleware` | — | ❌ | — | — | — | — | — |
| `requestId` | `request-id.ts` | α | `Middleware` | ❌ | ✅ | `ctx.requestId` | `string` | — | — | — |
| `cron-utils` | `cron-utils.ts` | γ | utilities | — | — | — | — | — | — | — |

---

## Client-side (from `weifuwu/react`)

| Hook | File | Pattern | Description |
|------|------|---------|-------------|
| `useWebsocket` | `use-websocket.ts` | δ | Auto-reconnecting WebSocket hook |
| `useAction` | `use-action.ts` | δ | Form action hook with CSRF |
| `useFetch` | `client-state.ts` | δ | Data fetching with cache + dedup |
| `useQueryState` | `client-state.ts` | δ | URL query parameter state |
| `createStore` | `client-state.ts` | δ | Shared store (useSyncExternalStore) |
| `Link` / `useNavigate` / `useNavigating` | `client-router.ts` | δ | Client-side navigation |
| `useLocale` | `client-locale.ts` | δ | Locale switcher + interceptor |
| `useTheme` / `applyTheme` | `client-theme.ts` | δ | Theme switcher + interceptor |
| `useFlashMessage` | `use-flash-message.ts` | δ | Flash message reader |
| `useAgentStream` | `use-agent-stream.ts` | δ | Agent streaming via WebSocket |
| `TsxContext` / `useCtx` / `setCtx` / `useLoaderData` | `tsx-context.ts` | δ | SSR context + hydration |
| `Head` | `head.tsx` | δ | Per-page meta tags |
| `addInterceptor` | `client-router.ts` | δ | URL interceptor registration |

---

## Key Findings

### ✅ Resolved Issues

| Issue | Resolution |
|-------|-----------|
| Missing `declare module` in 10 modules | All modules now use `declare module` + generics |
| `ctx.csrfToken` not namespaced | Changed to `ctx.csrf.token` |
| `auth.ts` and `user()` both set `ctx.user` | `auth.ts` removed, `user()` replaced it |
| `aiProvider()` not a Middleware | Now returns `Middleware & AIProvider` via `Object.assign` |
| `theme()`/`i18n()` self-routing without `.middleware()` | Split into β Router + `.middleware()`, supports auto-registration |
| `stop()` vs `close()` vs `shutdown()` | Unified to `close()` with backward-compatible aliases |
| `ctx.requestId` bare string | `trace()` middleware now injects `ctx.trace.requestId` (namespace) |
| `ctx.env` declared but not populated | `env()` middleware injects `ctx.env` from `WEIFUWU_PUBLIC_*` |

### 🔴 Still Open

- `ctx.parsed` is shared by `validate()` and `upload()` — minor, documented as shared field
- No client-side hook tests (stubs only)
- No shared `Closeable` interface (convention-based)
