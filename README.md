# weifuwu

**Web framework + reactive frontend** — `(req, ctx) => Response` + `(props, ctx) => JSX`

```bash
npm install weifuwu
```

One package. Backend (`weifuwu`) + frontend (`weifuwu/client`). Minimal, composable, no magic.

---

## Core Concept: `ctx`

Backend and frontend share the same pattern: middleware injects fields into `ctx`, handlers/components read from `ctx`.

```
Backend:                              Frontend:
  Request → Middleware → Handler       createApp() → Middleware → Component
             │                                      │
             ▼                                      ▼
         ctx.sql                               ctx.ws
         ctx.redis                             ctx.route
         ctx.ui                                ctx.app.navigate
```

**Backend:**
```ts
app.use(postgres())       // → ctx.sql
app.use(redis())          // → ctx.redis
app.use(ui())             // → ctx.ui.html / ctx.ui.js / ctx.ui.css
```

**Frontend:**
```tsx
app.use(ws())                      // → ctx.ws.send / onMessage / isConnected
app.use(router({ routes }))        // → ctx.route.path / params / query
```

---

## Backend

### Exports

| Export | Type | Purpose |
|--------|------|---------|
| `Router` | class | HTTP router + middleware chain + `.ws()` + `.graphql()` |
| `serve` | function | HTTP server |
| `cors` | middleware | CORS headers |
| `postgres` | middleware | PostgreSQL client → `ctx.sql` |
| `redis` | middleware | Redis client → `ctx.redis` |
| `serveStatic` | middleware | Static file serving |
| `ui` | middleware | SSR/SPA rendering → `ctx.ui.html/css/js` |
| `HttpError` | class | HTTP error with status code |
| `DEFAULT_MAX_BODY` | constant | Default 10MB body limit |
| `MIGRATIONS_TABLE` | constant | Postgres migrations table name |

### Types

`Context`, `Handler`, `Middleware`, `ErrorHandler`, `WebSocket`, `WebSocketHandler`, `ServeOptions`, `Server`, `CORSOptions`, `ServeStaticOptions`, `PostgresOptions`, `PostgresClient`, `PostgresInjected`, `RedisOptions`, `RedisClient`, `RedisInjected`, `GraphQLOptions`, `GraphQLHandler`

### Quick Start

```ts
import { serve, Router, cors, serveStatic, ui } from 'weifuwu'

const app = new Router()
app.use(cors())
app.use(serveStatic('./public'))
app.use(ui())

// API routes
app.get('/api/hello', async (req, ctx) => {
  return Response.json({ message: 'hello' })
})

// WebSocket
app.ws('/ws', {
  open(ws) { ws.send('connected') },
  message(ws, ctx, data) { ws.send(data.toString()) },
})

// GraphQL
app.graphql(async (req, ctx) => ({
  schema: `type Query { hello: String }`,
  resolvers: { Query: { hello: () => 'world' } },
  graphiql: true,
}))

// SSR page
app.get('/blog/:slug', async (req, ctx) => ctx.ui.html`
  <!DOCTYPE html>
  <html><body><h1>${post.title}</h1></body></html>
`)

// Dynamic JS compilation (no build step)
app.get('/app.js', async (req, ctx) => ctx.ui.js('./src/main.tsx'))

serve(app, { port: 3000 })
```

### Router

```ts
const app = new Router()
app.get(path, ...handlers)
app.post / put / delete / patch / head / options(path, ...handlers)
app.all(path, ...handlers)
app.ws(path, handler)           // WebSocket
app.graphql(handler)            // GraphQL at /
app.graphql('/graphql', handler) // GraphQL at /graphql
app.use(middleware)              // Global middleware
app.mount(prefix, subRouter)     // Sub-router
app.onError(handler)             // Error handler
app.routes()                     // Debug: list all routes
```

### WebSocket

```ts
app.ws('/ws', {
  open(ws, ctx) { ws.send('connected') },
  message(ws, ctx, data) { /* data: string | Buffer */ },
  close(ws, ctx) { /* cleanup */ },
  error(ws, ctx, err) { /* log */ },
})
```

### GraphQL

```ts
// At root
app.graphql(async (req, ctx) => ({
  schema: `type Query { hello: String }`,
  resolvers: { Query: { hello: () => 'world' } },
  graphiql: true,
}))

// Or at a custom path
app.graphql('/graphql', handler)
```

### Graceful Shutdown

```ts
const srv = serve(app)
// Ctrl+C / SIGTERM immediately closes all connections and exits
await srv.stop()  // Programmatic stop
```

---

## Frontend (`weifuwu/client`)

16 runtime exports, zero dependencies, zero virtual DOM.

| Export | Type | Purpose |
|--------|------|---------|
| `signal`, `computed`, `effect`, `batch` | function | Reactive state system |
| `jsx`/`jsxs`/`jsxDEV` | function | JSX compilation target |
| `Fragment` | component | `<></>` |
| `Show` | component | Conditional rendering |
| `For` | component | Keyed list rendering |
| `onMount`, `onCleanup` | function | Lifecycle hooks |
| `createApp` | function | App instance with middleware chain |
| `router` | middleware | Hash/history router → `ctx.route` |
| `RouteView` | component | Route outlet |
| `ws` | middleware | WebSocket client → `ctx.ws` |

Types: `Signal`, `Component`, `WfuiContext`, `AppMiddleware`, `RouteDef`

### Quick Start

```tsx
import { signal, Show, For, createApp, ws, router, RouteView } from 'weifuwu/client'
import type { WfuiContext, RouteDef } from 'weifuwu/client'

const routes: RouteDef[] = [
  { path: '/', component: HomePage },
  { path: '/hello/:name', component: HelloPage },
]

const app = createApp()
app.use(ws())
app.use(router({ routes, mode: 'hash' }))
app.mount('#root', AppShell)

function AppShell(_props: {}, ctx: WfuiContext) {
  return (
    <div>
      <nav>...</nav>
      <main><RouteView /></main>
    </div>
  )
}
```

### Signal

```tsx
const count = signal(0)
const doubled = computed(() => count.value * 2)
effect(() => console.log('count:', count.value))
batch(() => { a.value = 1; b.value = 2 })
```

### Control Flow

```tsx
<Show when={isLoggedIn} fallback={<Login />}>
  <Dashboard />
</Show>

<For each={items} keyBy="id">
  {(item) => <div>{item.name}</div>}
</For>
```

### WebSocket (`ctx.ws`)

```tsx
app.use(ws({ url: '/ws' }))

// In component:
onMount(() => {
  const unsub = ctx.ws.onMessage((data) => { ... })
  onCleanup(() => unsub())
})
ctx.ws.send({ type: 'chat', body: 'hello' })
<Show when={ctx.ws.isConnected}>🟢 已连接</Show>
```

### Router (`ctx.route`)

```tsx
app.use(router({ routes, notFound: NotFound, mode: 'hash' }))

ctx.route.path       // '/hello/world'
ctx.route.params     // { name: 'world' }
ctx.route.query      // { tab: 'intro' }
ctx.app.navigate('/hello/world')
```

### Lifecycle

```tsx
onMount(() => {
  init()
  return () => cleanup()   // Auto-cleanup on unmount
})
onCleanup(() => clearInterval(id))
```

### From React

| React | weifuwu/client |
|-------|----------------|
| `useState(0)` | `signal(0)` |
| `useMemo(() => a*2, [a])` | `computed(() => a.value * 2)` |
| `useEffect(() => f, [])` | `onMount(f)` |
| `useEffect(() => f, [dep])` | `effect(f)` |
| `{cond && <X/>}` | `<Show when={cond}><X/></Show>` |
| `{items.map(i => <X/>)}` | `<For each={items}>{(i) => <X/>}</For>` |
| `useNavigate()` | `ctx.app.navigate()` |
| `useParams()` | `ctx.route.params` |

---

## Demo

```bash
cd apps/demo
node server.ts
# http://localhost:3000
```

---

## Environment Variables

| Variable | Default | Used by |
|----------|---------|---------|
| `DATABASE_URL` | `postgres://root:123456@localhost:5432/demo` | `postgres()` |
| `REDIS_URL` | `redis://localhost:6379` | `redis()` |

---

## Project Structure

```
src/
├── index.ts              Entry, exports
├── types.ts              Context, Handler, Middleware
├── core/                 Router, serve, WebSocket upgrade
├── middleware/           cors, serveStatic
├── postgres/             PostgreSQL client
├── redis/                Redis client
├── ui/                   ctx.ui.html/js/css
├── graphql.ts            GraphQL + router.graphql()
├── client/               Frontend framework
│   ├── index.ts          16 runtime exports
│   ├── signal.ts         signal/computed/effect/batch
│   ├── jsx-runtime.ts    JSX → DOM + Show/For/Fragment/Portal
│   ├── app.ts            createApp
│   ├── router.ts         Router + RouteView
│   ├── types.ts          WfuiContext + types
│   └── middleware/ws.ts  WebSocket client
├── test/                 47 backend + 77 frontend tests
apps/demo/                Full-stack demo
```

```bash
npm run build       # esbuild → dist/
npm run typecheck   # tsc --noEmit
npm test            # Run all tests
```
