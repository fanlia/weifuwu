# weifuwu — AI SaaS Framework

**Goal: From zero to a production-ready AI SaaS project with a single `npm init`.**

We are not a general-purpose web framework. We are purpose-built for AI-native SaaS products. Every built-in module solves a specific AI SaaS infrastructure need: user system, instant messaging, content management, RAG knowledge base, AI Agent, dynamic data storage, and a reactive frontend framework.

## Principles

- **AI-native** — `kb` + `ai/agent` + `messager` work together, providing a complete pipeline from LLM conversation to RAG knowledge retrieval to real-time interaction. No manual integration needed.
- **Full-stack, one package** — `npm install weifuwu` gives you both backend (`weifuwu`) and frontend (`weifuwu/client`). One version number, no mismatch.
- **Every module earns its place** — each one solves a concrete AI SaaS problem (identity, conversation, knowledge, Agent, UI reactivity). No bloat.
- **Batteries included, but swappable** — defaults cover 80% of scenarios (Postgres + pgvector + DashScope/DeepSeek), but you can always replace them.
- **Production-ready, zero config** — `postgres()` reads `DATABASE_URL`, `redis()` reads `REDIS_URL`, `user()` reads `JWT_SECRET`, `kb()` reads `DASHSCOPE_API_KEY`. Set env vars and go.

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
