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
- **JSX types** — 50+ HTML elements with typed attributes (div, input, button, form, img, etc.). Signal-compatible props (class, value, checked). Event handlers with proper DOM event types (MouseEvent, KeyboardEvent, etc.).
- **Template syntax** — TSX via esbuild `--jsx=automatic --jsxImportSource=weifuwu/client`
- **No upstream dependencies** — ~1600 lines total, zero runtime deps
- **Context alignment** — frontend `WfuiContext` follows the same pattern as backend `Context`: middleware injects fields, components read from `ctx`
- **Control flow** — `<Show when={signal}>` for conditions, `<For each={signal}>` for lists, `<ErrorBoundary>` for error isolation
- **Routing** — `router()` middleware injects `ctx.route.path / params / query / data`, `<RouteView />` renders matched component. Routes support `loader(ctx)` for data pre-fetching.
- **Third-party libraries** — `wrap(tagName, setup)` creates a component that manages lifecycle automatically. Initialize ECharts, Chart.js, Leaflet, CodeMirror in ~5 lines.
- **Form handling** — `useForm({ initial, validate })` manages field signals, validation, submit, and reset.
- **Portal** — `createPortal(node, target)` renders DOM outside the parent hierarchy (modals, dropdowns, tooltips).
- **SSR / Hydrate** — Server renders full HTML via `ctx.ui.html\`...\``, client hydrates interactive sections without clearing existing DOM.
- **State management** — built-in via signals. `provide/inject` for cross-component data. No Redux, no Zustand.
- **Build** — esbuild with `jsxImportSource: 'weifuwu/client'`. No Vite, no webpack. For server-side projects, `ctx.ui.js(entry)` compiles TSX on demand.
- **CSS** — `ctx.ui.css(entry)` reads CSS files with optional PostCSS + Tailwind CSS v4 compilation. Auto-detects installed tooling, silent fallback.
- **Testing** — components are plain functions, test by calling `MyComponent(props, mockCtx)` and asserting on returned Node.

### Full Public API (`weifuwu/client`)

```
Core:
  signal(value)            → Signal
  computed(fn)             → Signal
  effect(fn)               → cleanup function
  isSignal(value)          → boolean

Component model:
  (props: P, ctx: WfuiContext) → Node
  jsx(type, props, ...children)
  Fragment(props, ...children)
  domMount(selector, node)

Components:
  <Show when={bool | Signal} fallback={Node}>
  <For each={T[] | Signal<T[]>}>{(item, index) => Node}</For>
  <ErrorBoundary fallback={(Error) => Node}>{() => Node}</ErrorBoundary>
  <RouteView />

Factories:
  wrap(tagName, (el, props, ctx) => dispose?) → Component
  createPortal(node, target) → Node

Form:
  useForm({ initial, validate? }) → {
    field(name) → { value: Signal, onInput: fn },
    errors: Record<string, string|null>,
    touched: Record<string, boolean>,
    valid: Signal<boolean>,
    values: Signal<T>,
    submit(handler),
    reset(),
    setValue(name, value),
    setValues(partial),
  }

Router:
  router({ mode?, routes, notFound? }) → Middleware
  RouteView → Component
  RouteDef { path, component, auth?, title?, loader?(ctx) → data }

App:
  createApp() → { ctx, use(mw), mount(sel, Comp), hydrate(sel, Comp, props?) }

Middleware:
  api({ baseUrl? })     → ctx.api.get/post/put/patch/delete
  auth({ ... })         → ctx.user/login/logout/register
  ws({ url? })          → ctx.ws.send/onMessage/join/leave
  router({ routes })    → ctx.route.path/params/query/data

Components (pre-built):
  LoginForm — login/register form
  Chat({ conversationId }) — real-time messaging

Utils:
  wrap(tag, setup)  — third-party lib integration
  useForm(opts)     — form management
  createPortal(node, target)  — out-of-parent rendering
```

### Server-side UI Module (`weifuwu`)

```
ui() → Middleware (injects ctx.ui)

ctx.ui:
  html``           → Tagged template, returns Response (Content-Type: text/html)
  html.unsafe(str) → Mark string as safe (skip escaping)
  js(entryPath)    → Compile TSX with esbuild, returns Response (application/javascript)
  css(entryPath)   → Read/compile CSS, returns Response (text/css)
                     Auto-detects tailwindcss + postcss for Tailwind CSS v4 compilation

Usage:
  app.use(ui())
  
  // SSR page
  app.get('/blog/:slug', async (req, ctx) => ctx.ui.html`
    <!DOCTYPE html><html>
    <head><title>${post.title}</title></head>
    <body><div id="root">${ctx.ui.html.unsafe(post.body)}</div>
    <script src="/static/app.js"></script></body></html>`)
  
  // Dynamic JS bundle (no build step needed)
  app.get('/static/app.js', async (req, ctx) => ctx.ui.js('./src/main.tsx'))
  
  // CSS with Tailwind support
  app.get('/static/style.css', async (req, ctx) => ctx.ui.css('./src/style.css'))
```

### Example: Full SSR Page with Hydration

Server:
```ts
app.get('/blog/:slug', async (req, ctx) => ctx.ui.html`
  <!DOCTYPE html><html>
  <head><title>${post.title}</title><link rel="stylesheet" href="/static/style.css"></head>
  <body>
    <div id="root">
      <h1>${post.title}</h1>
      <div>${ctx.ui.html.unsafe(post.body)}</div>
      <div data-hydrate="like"></div>
    </div>
    <script>window.__WFUI_PROPS__=${ctx.ui.html.unsafe(JSON.stringify({ post }))}</script>
    <script src="/static/app.js"></script>
  </body></html>`)
```

Client:
```tsx
const app = createApp()
app.use(api())

const root = document.getElementById('root')
if (root?.children.length > 0) {
  app.hydrate('[data-hydrate="like"]', LikeButton)
} else {
  app.mount('#root', AppShell)
}
```

### Example: Third-party Library with wrap()

```tsx
import { wrap, effect } from 'weifuwu/client'
import * as echarts from 'echarts'

const PieChart = wrap('div', (el, props: { data: any[] }, ctx) => {
  const chart = echarts.init(el)
  chart.setOption({ series: [{ type: 'pie', data: props.data }] })
  effect(() => chart.setOption({ series: [{ type: 'pie', data: props.data }] }))
  return () => chart.dispose()
})

// Use as a regular component:
<Dashboard><PieChart data={salesData} /></Dashboard>
```

### Example: Form with Validation

```tsx
const form = useForm({
  initial: { email: '', password: '' },
  validate: {
    email: (v) => !v.includes('@') && 'Invalid email',
    password: (v) => v.length < 6 && 'At least 6 characters',
  },
})

// In JSX:
<input {...form.field('email')} placeholder="Email" />
{form.errors.email && <span>{form.errors.email}</span>}

<button onClick={() => form.submit(d => ctx.login(d.email, d.password))}>Login</button>
```

### Example: Route with Loader

```tsx
const routes: RouteDef[] = [
  {
    path: '/post/:id',
    component: PostPage,
    loader: async (ctx) => ({
      post: await ctx.api.get(`/api/posts/${ctx.route.params.id}`),
    }),
  },
]

function PostPage(_, ctx) {
  const post = ctx.route.data.post
  if (!post) return <p>Loading...</p>
  return <h1>{post.title}</h1>
}
```
