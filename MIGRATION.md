# Migration Guide

## 0.22 → 0.24

### 1. `auth.ts` removed — use `user()` instead

`auth()` has been removed. Use `user()` for all authentication needs.

```diff
- import { auth } from 'weifuwu'
- app.use(auth({ token: 'sk-123' }))
+ import { user } from 'weifuwu'
+ app.use(user({ tokens: ['sk-123'] }).middleware())

- app.use(auth({ verify: myFn }))
+ app.use(user({ verify: myFn }).middleware())

- app.use(auth({ proxy: url }))
+ app.use(user({ proxy: url }).middleware())

- app.use(auth({ session: true, resolveUser: fn }))
+ app.use(user({ resolveUser: fn }).middleware())
```

`user()` now supports all the strategies `auth()` supported: static tokens, custom verify,
proxy auth, session auth — all without requiring a database.

### 2. `ctx.csrfToken` → `ctx.csrf.token`

```diff
- <input type="hidden" name="_csrf" value="${ctx.csrfToken}" />
+ <input type="hidden" name="_csrf" value="${ctx.csrf.token}" />
```

### 3. `theme()` and `i18n()` API change

Now returns a Router with `.middleware()`. Single-line auto-registration works:

```diff
- app.use(theme({ default: 'dark' }))
+ app.use(theme({ default: 'dark' }))    // still works (auto-registration)

- app.use(i18n({ dir: './locales' }))
+ app.use(i18n({ dir: './locales' }))    // still works (auto-registration)
```

The old code still works because `app.use(theme())` now auto-detects the module
and registers both middleware and routes.

### 4. `rateLimit({...}).stop()` → `.close()`

```diff
- rateLimiter.stop()
+ rateLimiter.close()
```

The old `.stop()` method still exists as a backward-compatible alias.

### 5. `iii.shutdown()` → `iii.close()`

```diff
- await engine.shutdown()
+ await engine.close()
```

The old `.shutdown()` still exists as an alias.

### 6. `aiProvider()` is now a Middleware

```diff
- const provider = aiProvider()
+ app.use(aiProvider())   // → ctx.ai
- await provider.generateText({ prompt })
+ await ctx.ai.generateText({ prompt })
```

You can still use `aiProvider()` as a standalone provider without middleware:

```ts
const provider = aiProvider() // standalone (no middleware)
const result = await provider.generateText({ prompt })
```

### Quick reference: old → new

| Old                       | New                                    | Notes                     |
| ------------------------- | -------------------------------------- | ------------------------- |
| `auth({ token: 'x' })`    | `user({ tokens: ['x'] }).middleware()` | Multiple tokens supported |
| `auth({ verify: fn })`    | `user({ verify: fn }).middleware()`    | Same signature            |
| `auth({ proxy: url })`    | `user({ proxy: url }).middleware()`    | Same behavior             |
| `auth({ session: true })` | `user({}).middleware()`                | Session auto-detected     |
| `ctx.csrfToken`           | `ctx.csrf.token`                       | Namespace consistency     |
| `rateLimiter.stop()`      | `rateLimiter.close()`                  | Universal convention      |
| `engine.shutdown()`       | `engine.close()`                       | Universal convention      |
