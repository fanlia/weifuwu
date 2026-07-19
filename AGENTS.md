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

- **Component model** — `(props: P, ctx: WfuiContext) => Node`. No classes, no hooks, no lifecycle.
- **Reactivity** — `signal(value)` / `computed(fn)` / `effect(fn)`. No virtual DOM, no diffing.
- **Template syntax** — TSX via esbuild `--jsx=automatic --jsxImportSource=weifuwu/client`
- **No upstream dependencies** — zero runtime deps
- **Context alignment** — frontend `WfuiContext` follows the same pattern as backend `Context`: middleware injects fields, components read from `ctx`
- **Control flow** — `<Show when={signal}>` for conditions, `<For each={signal}>` for lists
- **Routing** — `router()` middleware injects `ctx.route.path / params / query`, `<RouteView />` renders matched component
- **State management** — built-in via signals. No Redux, no Zustand.
- **Build** — esbuild with `jsxImportSource: 'weifuwu/client'`. No Vite, no webpack.
- **Testing** — components are plain functions, test by calling `MyComponent(props, mockCtx)` and asserting on returned Node
- **No built-in UI components** — `weifuwu/client` ships **only primitives**: signals, JSX runtime, control flow, middleware, routing, and utilities. There are no pre-built components. UI is application-specific and opinionated—shipping it in the core would create false expectations and maintenance burden. Users build their own UI from the primitives, following patterns shown in `apps/` and `examples/`.
- **Minimal public API** — `weifuwu/client` exports **29 symbols** (15 runtime + 14 types). Every export earns its place: no syntax sugar (`reactiveArray`, `domMount`, `wrap`, `createPortal`, `ErrorBoundary`, `createContext`, `ApiClient`, `ApiError`, `useModel`), no dev-only tools (`enableDevtools`). If a feature can be built from primitives in under 30 lines of user code, it doesn't belong in the framework.
  - **What belongs in core**: signal system, JSX factory, `Show`/`For`/`Fragment`, lifecycle hooks (`onMount`/`onCleanup`), middleware (`api`/`auth`/`ws`/`router`), utilities (`useForm`/`createResource`/`createStyles`).
  - **What does NOT belong in core**: any component with visual output, application-specific logic, syntax sugar replaceable with primitives, or dev-only tooling. These are either removed entirely or available as patterns in `apps/`.
