# Documentation-Code Differences

A line-by-line comparison between README.md / AGENTS.md declarations and actual code behavior.

---

## 1. `app.use(aiProvider())` → `ctx.ai` is NOT implemented

**Documents say:** (README, AGENTS.md, index.ts export)

```ts
const provider = aiProvider()
app.use(provider) // → ctx.ai
```

**Code reality:** `aiProvider()` returns `AIProvider` (a plain object with methods like `generateText()`, `streamText()`, `embed()`). `AIProvider` is NOT a function with `(req, ctx, next)` signature — it's not a `Middleware`. The Router's `use()` method checks `typeof arg1 === 'function'` and silently ignores objects. The `ctx.ai` field is never set anywhere.

**Severity:** HIGH. This is documented as a primary feature but doesn't work.

**Fix:** Implement `AIProviderMiddleware` that is both callable as middleware AND has all provider methods (see Phase 2 in the plan).

---

## 2. Pattern Count: Documents say 2, Reality says 4-5

**Documents say:** (README)

> "All modules follow one of 2 patterns"

(AGENTS.md says 4: α, β, γ, δ)

**Code reality:** README's module reference shows at least 4 distinct shapes:

| Shape                      | Count | Examples                                                                                                                                                                                                   |
| -------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| α Middleware (no extras)   | ~12   | compress, cors, csrf, helmet, logger, rateLimit, requestId, serveStatic, validate, upload, theme, i18n                                                                                                     |
| α Middleware (with extras) | ~4    | postgres (`.migrate()`, `.close()`), redis (`.close()`), cache (`.invalidate()`, `.flush()`, `.close()`), queue (`.cron()`, `.add()`, `.process()`, `.run()`), permissions (`.migrate()`, `.assignRole()`) |
| β Router (no extras)       | ~4    | health, graphql, seo, ssr                                                                                                                                                                                  |
| β Router (with extras)     | ~8    | user, analytics, messager, agent, opencode, iii, logdb, kb, webhook                                                                                                                                        |
| γ Standalone               | ~2    | mailer, fts, cron-utils, sse                                                                                                                                                                               |

**Severity:** MEDIUM. New developers expect predictability.

**Fix:** Update README to accurately describe 4 patterns: α, β, γ, δ.

---

## 3. `ctx` field injection: Not all modules use `declare module`

**Documents say:** (AGENTS.md, in the `ctx` field principle table)

> "each middleware adds exactly one namespaced field on ctx"

**Code reality:** Only 8 out of ~17 ctx-injecting modules use `declare module`:

| Field             | Uses `declare module`?                 |
| ----------------- | -------------------------------------- |
| `ctx.sql`         | ✅ (postgres/types.ts)                 |
| `ctx.redis`       | ✅ (redis/types.ts)                    |
| `ctx.queue`       | ✅ (queue/types.ts)                    |
| `ctx.session`     | ✅ (session.ts)                        |
| `ctx.permissions` | ✅ (permissions.ts)                    |
| `ctx.s3`          | ✅ (s3.ts)                             |
| `ctx.tenant`      | ✅ (tenant/types.ts)                   |
| `ctx.deploy`      | ✅ (deploy/types.ts)                   |
| `ctx.csrfToken`   | ❌ (csrf.ts — generics only)           |
| `ctx.requestId`   | ❌ (request-id.ts — generics only)     |
| `ctx.flash`       | ❌ (flash.ts — generics only)          |
| `ctx.theme`       | ❌ (theme.ts — nothing)                |
| `ctx.i18n`        | ❌ (i18n.ts — nothing)                 |
| `ctx.env`         | ❌ (env.ts — nothing)                  |
| `ctx.user`        | ❌ (auth.ts — nothing)                 |
| `ctx.parsed`      | ❌ (validate.ts / upload.ts — nothing) |
| `ctx.ai`          | ❌ (ai/provider.ts — NOT IMPLEMENTED)  |

**Severity:** HIGH. TypeScript users get no type hints for half the ctx fields.

**Fix:** Add `declare module` to all ctx-injecting modules.

---

## 4. `ctx.csrfToken` violates "namespaced field" principle

**Documents say:** (AGENTS.md)

> "each middleware adds exactly one namespaced field on ctx"

**Code reality:** `ctx.csrfToken` is a raw string, not a namespaced object. Compare to `ctx.theme = { value, set }` and `ctx.flash = { value, set }` which follow the pattern.

**Severity:** LOW. But inconsistency adds cognitive load.

**Fix:** Change to `ctx.csrf = { token: string }`.

---

## 5. `ctx.parsed` is shared by two modules

**Documents say:** (AGENTS.md, validate section)

> "All ctx mutations should be additive, never overwrite"

**Code reality:** Both `validate()` and `upload()` write to `ctx.parsed`. If both are used in the same route (e.g., upload form with Zod validation), they will overwrite each other's data.

| Module       | Writes                                                                           | Signature    |
| ------------ | -------------------------------------------------------------------------------- | ------------ |
| `validate()` | `ctx.parsed.body`, `ctx.parsed.query`, `ctx.parsed.params`, `ctx.parsed.headers` | `Middleware` |
| `upload()`   | `ctx.parsed.files`, `ctx.parsed.fields`                                          | `Middleware` |

**Severity:** LOW-MEDIUM. Edge case but confusing API.

**Fix:** Document the cooperation clearly, or split to `ctx.validation` and `ctx.upload`.

---

## 6. `theme()` and `i18n()` are α but handle routes

**Documents say:** (README Pattern table)

> Pattern α — Middleware: module returns a Middleware callable. Use with `app.use(mod())`.

**Code reality:** `theme()` intercepts `GET /__theme/:value` internally. `i18n()` intercepts `GET /__lang/:locale` internally. This is route handling hidden inside a Middleware. The user didn't mount any routes, yet routes exist.

Compare to `analytics()` which is β and explicitly separates: `app.use(a.middleware())` + `app.use('/', a)`.

**Severity:** MEDIUM. Hidden side effects violate principle of least surprise.

**Fix:** Split into `.middleware()` (α) + `Router` return (β), matching analytics pattern.

---

## 7. `auth()` vs `user()` overlap

**Documents say:** Documented as two separate modules with separate entries.

| Aspect           | `auth()`               | `user()`                     |
| ---------------- | ---------------------- | ---------------------------- |
| Pattern          | α                      | β                            |
| Return           | `Middleware`           | `UserModule`                 |
| Registers routes | No                     | Yes (register, login, oauth) |
| ctx.user         | ✅ (sets it)           | ✅ (via `.middleware()`)     |
| Session support  | ✅ `{ session: true }` | ❌ (relies on JWT)           |
| Token validation | Static/verify/proxy    | JWT only                     |
| DB required      | No                     | Yes                          |

**Code reality:** Two completely different implementations for the same fundamental task (authentication). `auth()` handles simple token verification and session auth. `user()` handles full user lifecycle. Both set `ctx.user` but with different shapes.

**Severity:** MEDIUM. New developers must choose between two systems without guidance.

**Fix:** Document `auth()` as the "low-level" option and `user()` as the "full-featured" option with a comparison table. Consider deprecating `auth()` in favor of `user()`'s middleware.

---

## 8. Lifecycle methods are not aligned across modules

**Documents say:** (README, various module sections)

> - `.close()` — cleanup
> - `.stop()` — stop processing
> - `.shutdown()` — clean shutdown

**Code reality:**

| Module    | Method        | Returns           |
| --------- | ------------- | ----------------- |
| postgres  | `.close()`    | `Promise<void>`   |
| redis     | `.close()`    | `Promise<void>`   |
| session   | `.close()`    | `void`            |
| cache     | `.close()`    | `void` (optional) |
| queue     | `.close()`    | `Promise<void>`   |
| queue     | `.stop()`     | `void`            |
| rateLimit | `.stop()`     | `void`            |
| iii       | `.shutdown()` | `Promise<void>`   |
| mailer    | `.close()`    | `Promise<void>`   |

`close()` sometimes returns `Promise<void>`, sometimes `void`. `stop()` and `shutdown()` are synonyms for `close()`.

**Severity:** LOW. But increases cognitive load.

**Fix:** Define `Closeable` interface, normalize all to `close(): Promise<void>`, give aliases for `stop()`/`shutdown()`.

---

## 9. Type-safe Context example in README doesn't work for all modules

**Documents say:** (README Type-Safe Context section)

```ts
const app = new Router()
  .use(csrf()) // → Router<Context & { csrfToken: string }>
  .use(requestId()) // → Router<Context & { csrfToken, requestId }>
  .use(postgres()) // → Router<Context & { csrfToken, requestId, sql }>
```

**Code reality:** This works via generic type parameters only for modules that return `Middleware<Context, Context & { ... }>`. Modules without generics (`theme()`, `i18n()`, `auth()`) don't contribute to the chain type. If the user uses `app.use()` instead of chaining, they get no type info at all (unless `declare module` is in place).

**Severity:** MEDIUM. The documented approach works, but only for a subset of modules.

**Fix:** Universal `declare module` solves this — type info comes from module augmentation regardless of chaining.

---

## 10. AGENTS.md vs README.md pattern tables disagree

| Statement            | AGENTS.md                      | README.md                                    |
| -------------------- | ------------------------------ | -------------------------------------------- |
| Number of patterns   | 4 (α, β, γ, δ)                 | 2 (α, β)                                     |
| `aiProvider()` entry | Listed in α table              | Listed in separate AI section                |
| `auth()` entry       | Listed as injecting `ctx.user` | Documented in auth section, no pattern badge |
| γ SSR helper         | Listed                         | Not mentioned                                |
| δ Client-side        | Listed                         | Not mentioned                                |

**Severity:** LOW. Internal consistency issue.

**Fix:** Align AGENTS.md with README.md after all other fixes are done.
