# weifuwu — Web Framework

**Goal: A lean, composable web framework powered by weifuwu/client on the frontend.**

We ship the bare minimum: Router, server, Postgres, Redis, CORS, static files, GraphQL, and frontend delivery (ui). No authentication, no messaging, no AI—those belong in user space.

## Principles

- **Backend as toolkit** — `weifuwu` provides HTTP routing, middleware, database, and infrastructure primitives. Domain modules (user system, AI, messaging, knowledge base) are not bundled—they live in user space or separate packages.
- **Full-stack, one package** — `npm install weifuwu` gives you both backend (`weifuwu`) and frontend (`weifuwu/client`). One version number, no mismatch.
- **Every module earns its place** — each export solves a concrete problem. No dead weight.
- **Production-ready, zero config** — `postgres()` reads `DATABASE_URL`, `redis()` reads `REDIS_URL`. Set env vars and go.

## README Standards

README is the main entry point for LLMs to understand the project. Keep it **LLM-friendly**:

- **Module overview table** — top of the README, listing all modules, their purpose, and dependencies
- **Consistent section format** — each module follows: one-line description → code example → API table → notes
- **Short and scannable** — avoid long paragraphs, use tables and lists
- **Clear dependency chain** — each module documents what other modules and middleware it depends on
- **Environment variables listed together** — one table for all config, easy for LLM to find
- **Every export mentioned** — no public API left undocumented
- **Frontend module** — `weifuwu/client` is documented alongside backend modules with the same structure

## Development Constraints

### Backend

- **ESM only** — no CommonJS support
- **TypeScript strict** — `noImplicitAny: false`
- **Web standards first** — all handlers use `(req: Request, ctx: Context) => Response`
- **Testing with `node --test`** — no Jest/Mocha
- **Build with esbuild** — `scripts/build.mjs`, all external deps are external
- **Release with `node scripts/release.mjs <version>`** — build + declarations + publish + git tag
- **Middleware pattern** — returns `Middleware<Context, Context & NewFields>`, extends Context via module augmentation
- **ctx injection** — middleware sets `ctx.field = value`, downstream handlers access via `ctx.field`
- **Closeable interface** — all stateful modules (postgres, redis, queue, rateLimit) implement `close(): Promise<void>`
- Run `docker compose up -d` before running tests

### Frontend (`weifuwu/client`)

- **Component model** — `(props: P, ctx: WfuiContext) => VNode`. No classes, no hooks, no lifecycle.
- **Reactivity** — `ctx.ui.$` is a Proxy. Assignment (`$.x = val`) automatically schedules re-render. No signal, no computed, no effect.
- **Template syntax** — TSX via esbuild `--jsx=automatic --jsx-import-source=weifuwu/client`
- **No upstream dependencies** — zero runtime deps
- **Context alignment** — frontend `WfuiContext` follows the same pattern as backend `Context`: middleware injects fields, components read from `ctx`
- **Control flow** — plain JS ternary `{cond ? <A/> : <B/>}` for conditions, `.map()` + `key` for lists
- **Routing** — `router()` middleware injects `ctx.route.path / params / query`, `<RouteView />` renders matched component
- **State management** — `ctx.ui.$` is a **component-level** Proxy. Each component instance has its own `vnode._$` target. Assignment (`$.x = val`) triggers re-render only for that component. No Redux, no Zustand.
- **Build** — esbuild with `jsxImportSource: 'weifuwu/client'`. No Vite, no webpack.
- **Testing** — components are pure functions, test by calling `MyComponent(props, mockCtx)` and asserting on returned VNode. For component-level `$` state, set `vnode._$.key = val` directly.
- **Component library (`weifuwu/components`)** — 34 HTML primitive components packaged alongside the framework. Each is `(props, ctx) => VNode`, uses `--wf-*` CSS variables for theming. Import: `import { Button, Input, Table } from 'weifuwu/components'` + `import 'weifuwu/components/style.css'`. Includes core primitives (Button/Input/Select/Checkbox/Switch/RadioGroup/Slider), data display (Table/Card/Badge/Tag/Avatar/StatCard/PageHeader), feedback (Modal/Drawer/Tooltip/Toast/Alert/Loading/EmptyState), navigation (Breadcrumb/Tabs/Dropdown/Pagination/Steps/Accordion), forms (Form/Field/FileUpload/SearchInput/ProgressBar), and layout (Divider).
- **i18n middleware** — `i18n()` injects `ctx.i18n` with `t()`, `setLocale()`, and `components` locale overrides. Runtime language switching without page refresh. Built-in `zh-CN` and `en-US` locale packages. Import: `import { i18n } from 'weifuwu/client'`.
- **ErrorBoundary** — catches render errors from child components, displays fallback. Uses `$.error` state and `_errorHandler` mechanism. Import: `import { ErrorBoundary } from 'weifuwu/client'`.
- **Minimal public API** — `weifuwu/client` exports **~25 symbols**. Every export earns its place.
  - **Core**: `h`, `jsx`/`jsxs`/`jsxDEV`, `Fragment`, `createApp`
  - **Router**: `router`, `RouteView`
  - **Middleware**: `ws`, `api`, `auth`, `i18n`
  - **Error handling**: `ErrorBoundary`
  - **i18n locale packages**: `zhCN`, `enUS`
  - **Utils**: `extendCtx`
  - **Types**: `VNode`, `VNodeType`, `Component`, `WfuiContext`, `AppMiddleware`, `RouteDef`, `ApiClient`, `ApiError`, `AuthClient`, `I18nOptions`, `I18nState`
  - **What does NOT belong in core**: reactive primitives (signal/computed/effect), control flow components (Show/For), lifecycle helpers (onMount/onCleanup), form/async data helpers. These are replaced by generic JS patterns: `$` proxy / ternary / `.map()` / `ref` / `if (!ready)`.

Every weifuwu module and script must pass these checks. Use them as a review checklist for PRs and refactoring.

### CS — Code Standards

| ID | Rule | Rationale |
|----|------|-----------|
| CS-01 | **No dead code after `throw` / `return`** — statements after unconditional `throw` or `return` must be removed or guarded | Dead code misleads readers and breaks cleanup paths |
| CS-02 | **Every Promise must be awaited or caught** — no floating `.then()` without error handling. Top-level fire-and-forget is allowed only with explicit `catch()` | Unhandled rejections crash Node.js in future versions |
| CS-03 | **Event handler errors must propagate to a handler, not `throw`** — inside event listeners (`server.on`, `ws.on`), use `emit('error')` or `console.error` instead of `throw` | `throw` inside event emitter cannot be caught by try-catch |
| CS-04 | **No fake/stub public APIs** — exported functions must do what they claim. No `poolStats()` that always returns 0 | Users depend on documented behavior |
| CS-05 | **All type branches must be handled** — if a parameter accepts `string \| Record`, both branches must work correctly, not just the first | Avoid silent failures on valid inputs |
| CS-06 | **Mutable state initialization must be correct** — `const` variables used as stats counters must be updated, not left at initial value | Constants that are supposed to change are bugs |
| CS-07 | **No reference-equality cache where value-equality is expected** — `===` cache of fresh objects is a no-op; use content hashing or accept the cost | False caching wastes reader's time |

### MS — Module Standards

| ID | Rule | Rationale |
|----|------|-----------|
| MS-01 | **Every export must be documented in README** — no public API undocumented. Use the module overview table and per-module sections | README is LLM entry point |
| MS-02 | **Stateful modules implement `Closeable`** — `close(): Promise<void>` for releasing connections, timers, pools | Graceful shutdown requires cleanup |
| MS-03 | **Middleware exports `__meta` metadata** — `{ injects: string[], depends: string[] }` on the returned middleware function | Enables runtime dependency validation and tooling |
| MS-04 | **Module augments `Context` via `declare module`** — middleware-injected fields declared in a `declare module 'weifuwu' { interface Context { field: Type } }` block | TypeScript consumers see injected fields |
| MS-05 | **Exported types prefixed with module name** — e.g., `PostgresOptions`, `RedisClient`, `CORSOptions` | Avoid name collisions in user imports |
| MS-06 | **No unused imports or type references in `tsconfig.json` `include`** — every glob pattern must match existing files | Stale config entries mislead new contributors |
| MS-07 | **No circular dependencies** — `A.ts` must not import `B.ts` that (directly or transitively) imports `A.ts` | Causes runtime errors in ESM |

### TS — Testing Standards

| ID | Rule | Rationale |
|----|------|-----------|
| TS-01 | **Every public API has at least one test** — smoke test for happy path | Prevent regressions on refactor |
| TS-02 | **Error paths have tests** — 404, 500, 401, timeout, invalid input | Edge cases are where bugs hide |
| TS-03 | **Table-driven tests for value variations** — multiple inputs in a single `it()`, not one `it()` per input | Keep test files scannable |
| TS-04 | **`node --test` only** — no Jest/Mocha/Vitest | Consistent with project constraint |
| TS-05 | **Test names describe behavior, not implementation** — `'returns 400 for empty name'` not `'validates required field'` | Tests document requirements |
| TS-06 | **No test depends on another test** — each test sets up its own state, `afterEach` cleans up | Isolation prevents ordering bugs |

### BS — Build & Script Standards

| ID | Rule | Rationale |
|----|------|-----------|
| BS-01 | **Build output is deterministic** — same source always produces same `dist/` (modulo version strings) | Reproducible CI |
| BS-02 | **No redundant builds** — the build script must not produce identical output at different paths | Faster CI, less confusion |
| BS-03 | **Release commits version bump** — `package.json` version change is committed before `git tag` | `git log` reflects release history |
| BS-04 | **`external` config in esbuild build must match actual imports** — externalizing a path the bundle never imports is dead config | Avoid misleading maintenance |
| BS-05 | **Build script runs clean before output** — `rm -rf dist` before writing | No stale artifacts from deleted source files |
| BS-06 | **All client tests finish within 10 seconds** — `node --test 'src/test/client/**/*.test.ts'` must complete in under 10s. If it times out, there is a resource leak (unclosed timer, WebSocket, handle, or event loop blocker). | Fast feedback loop; leaked resources mask real bugs and break CI |

### RDR — Render 函数规则

| ID | Rule | Rationale |
|----|------|-----------|
| RDR-01 | **render 函数不改变 `$`** — `$` 的写入只在事件回调（`onClick`/`onInput` 等）、`ref` 回调或 `if (!ctx.ui.ready)` 初始化块中进行 | Proxy `set` trap 已加入值比较防止循环，但保持 render 纯函数是最简洁的约定 |

### FS — Frontend Standards (`weifuwu/client`)

| ID | Rule | Rationale |
|----|------|-----------|
| FS-01 | **Components are pure functions of `(props, ctx) => VNode`** — no classes, no hooks, no `this` | Consistent with component model |
| FS-02 | **Lifecycle effects bound to DOM element, not global** — `ref` callback must be used for mount/unmount, not imperative timers or outside listeners without cleanup | Correct cleanup on conditional rendering |
| FS-03 | **`ctx.ui.$` Proxy drives re-renders, not manual DOM manipulation** — always assign to `$.xxx = val` to trigger VDOM patch; never write to `innerHTML` or `textContent` directly for persistent content | Consistency with VDOM model |
| FS-04 | **No `eval()` or `new Function()`** — prevent XSS vectors | Security baseline |
| FS-05 | **Zero upstream runtime dependencies** — `weifuwu/client` must not `import` from any npm package at runtime | Core constraint |
| FS-06 | **No `ctx.ui.render()` calls in page code** — Proxy auto-dirty handles assignment. Use `ctx.ui.dirty()` only for nested mutations like `push()` or `arr[i].x = y` | Forget-proof rendering |

### PS — Performance Standards

| ID | Rule | Rationale |
|----|------|-----------|
| PS-01 | **No synchronous I/O in request path** — `readFileSync`, `execSync`, `accessSync` must not appear in handler/middleware code | Blocks event loop |
| PS-02 | **Middleware chains avoid unnecessary object spread** — `{ ...ctx, ...fields }` replaces getters with snapshots; use `Object.assign` or `extendCtx` | Preserve getters, reduce GC pressure |
| PS-03 | **Route matching is O(path_segments)** — no regex-based matching that backtracks | Trie-based matching already guaranteed by Router |

### QA — Quality Assurance Standards (`apps/agent-platform/`)

| ID | Rule | Rationale |
|----|------|-----------|
| QA-01 | **Every `apps/agent-platform/` code change must be tested with `agent-browser`** — before merging, open the app, login, navigate to the modified feature, take a snapshot, and verify interactive elements render and function correctly | UI bugs (e.g., ternary/map wrapping, Proxy auto-dirty, layout) are invisible to unit tests. Browser-level testing catches rendering failures, missing fields, and broken interactions that `node --test` cannot detect |
| QA-02 | **Use `agent-browser snapshot -i -c` to inspect interactive elements** — rely on accessibility tree refs (`@e1`, …) for clicking and filling, not CSS selectors | Snapshot refs are stable per-page-load and cheaper to produce than full HTML; they also catch accessibility gaps early |
| QA-03 | **Re-snapshot after every page-changing interaction** — refs become stale after navigation, form submit, or dynamic render. Always call `snapshot -i -c` before the next click/fill | Prevents stale ref errors and ensures the agent sees the current page state |

Before merging any PR, verify:

```
[ ] All new public exports are documented in README (MS-01)
[ ] Stateful modules implement close(): Promise<void> (MS-02)
[ ] Middleware has __meta with injects/depends (MS-03)
[ ] Context augmentation via declare module (MS-04)
[ ] Tests cover happy path + 2+ edge cases (TS-01, TS-02)
[ ] No dead code after throw/return (CS-01)
[ ] No floating promises (CS-02)
[ ] Event handler errors propagate correctly (CS-03)
[ ] tsconfig include paths are accurate (MS-06)
[ ] Build script has no redundant outputs (BS-02)
[ ] No synchronous I/O in request handlers (PS-01)
[ ] No ctx.ui.render() calls in page code (FS-06)
[ ] apps/agent-platform/ 改动已通过 agent-browser 浏览器测试 (QA-01)
```
