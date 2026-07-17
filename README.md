# weifuwu

**AI SaaS full-stack framework** — `(req, ctx) => Response` + `(props, ctx) => JSX`

```bash
npm install weifuwu
```

One package. Backend + frontend. User system, messaging, RAG knowledge base, AI Agent, CMS, dynamic data storage, reactive frontend. Set env vars and go.

---

## Core Concept: `ctx`

**`ctx` 是整个框架的核心模式。** 后端和前端共享同一个理念：通过中间件向 `ctx` 注入能力，组件/handler 直接从 `ctx` 读取。

```
后端:                                    前端:
  Request → 中间件链 → Handler            createApp() → 中间件链 → 组件
              │                                         │
              ▼                                         ▼
          ctx.sql                                  ctx.api
          ctx.user                                 ctx.socket
          ctx.kb                                   ctx.route
          ctx.agent                                ctx.user
          ctx.redis                                ctx.app.navigate
          ctx.messager                             ctx.provide/inject
          ctx.cms
          ctx.base
          ctx.queue
          ctx.ui
```

**后端每个请求创建一个 ctx：**
```ts
// 中间件注入 → handler 直接使用
app.get('/api/chat', async (req, ctx) => {
  const user = ctx.user           // 当前用户（auto-resolve from JWT）
  const result = await ctx.kb.search(query)      // RAG 知识库
  return ctx.agent.chatStreamResponse({ messages })  // AI 流式响应
})
```

**前端每个组件通过第二个参数接收 ctx：**
```tsx
function ChatPage(_props: {}, ctx: WfuiContext) {
  ctx.api.get('/api/posts')       // HTTP 客户端
  ctx.socket.send(data)           // WebSocket
  ctx.route.path                  // 当前路由
  ctx.app.navigate('/about')      // 页面导航
}
```

这种模式让开发者**无需 import 任何工具函数**，所有能力在 `ctx` 中一站获取。

---

## Module Overview

### Backend — 每个模块向 ctx 注入什么

| Module | Import | Injects into `ctx` | Depends on | Purpose |
|--------|--------|-------------------|------------|---------|
| `postgres()` | `weifuwu` | `ctx.sql` | `DATABASE_URL` | PostgreSQL client |
| `redis()` | `weifuwu` | `ctx.redis` | `REDIS_URL` | Redis client |
| `user()` | `weifuwu` | `ctx.user`, `ctx.userModule` | `postgres()`, `JWT_SECRET` | Auth, JWT, roles |
| `messager()` | `weifuwu` | `ctx.messager` | `postgres()`, `user()` | IM + AI conversation |
| `kb()` | `weifuwu` | `ctx.kb` | `postgres()`, `DASHSCOPE_API_KEY` | RAG knowledge base |
| `agent()` | `weifuwu` | `ctx.agent` | — | LLM chat, tools, streaming |
| `cms()` | `weifuwu` | `ctx.cms` | `postgres()`, `user()` | Blog, docs, changelog |
| `base()` | `weifuwu` | `ctx.base` | `postgres()`, `user()` | Dynamic data engine |
| `queue()` | `weifuwu` | `ctx.queue` | `REDIS_URL` | Job queue + cron |
| `ui()` | `weifuwu` | `ctx.ui.html/js/css` | — | SSR/SPA rendering |

### Backend Middleware

| Middleware | Injects into `ctx` | Purpose |
|-----------|-------------------|---------|
| `cors()` | — | CORS headers |
| `helmet()` | — | Security headers |
| `compress()` | — | gzip / brotli / deflate |
| `rateLimit()` | — | Sliding-window rate limiter |
| `logger()` | — | Request logging |
| `upload()` | `ctx.upload` | Multipart file upload |
| `serveStatic()` | — | Static files |
| `sandbox()` | — | Filesystem isolation |

### Frontend (`weifuwu/client`) — 每个中间件向 ctx 注入什么

| Import | Type | Injects into `ctx` | Purpose |
|--------|------|-------------------|---------|
| `signal()` | function | — | Reactive state container |
| `computed()` | function | — | Derived signals |
| `effect()` | function | — | Auto-tracked side effects |
| `batch()` | function | — | Batch multiple signal writes |
| `untrack()` | function | — | Read signal without subscribing |
| `onMount()` | function | — | Component mount callback |
| `onCleanup()` | function | — | Component unmount callback |
| `api()` | **middleware** | `ctx.api.get/post/...` | HTTP client |
| `auth()` | **middleware** | `ctx.user/login/logout` | Auth state management |
| `socket()` | **middleware** | `ctx.socket.send/onMessage/...` | WebSocket client |
| `router()` | **middleware** | `ctx.route.path/params/query`, `ctx.app.navigate` | Hash/history router |
| `createApp()` | function | — | App instance |
| `<RouteView>` | component | — | Route outlet |
| `<Show>` | component | — | Conditional rendering |
| `<For>` | component | — | Keyed list rendering |
| `<Transition>` | component | — | Animated enter/leave |
| `<ErrorBoundary>` | component | — | Catch render errors |
| `<Link>` | component | — | SPA navigation link |
| `<LoginForm>` | component | — | Login/register form |
| `<Chat>` | component | — | Real-time messaging |
| `useForm()` | function | — | Form state management |
| `useModel()` | function | — | Two-way form binding |
| `reactiveArray()` | function | — | Reactive array with mut methods |
| `createResource()` | function | — | Async data (loading/error/data) |
| `createStyles()` | function | — | Scoped CSS |
| `createContext()` | function | — | Type-safe provide/inject |
| `createPortal()` | function | — | Render outside parent DOM |
| `wrap()` | function | — | Third-party lib integration |
| `enableDevtools()` | function | — | Dev warnings + browser inspector |

---

## Quick Start

### 完整全栈示例 — ctx 贯穿前后端

**后端 `server.ts`：**
```ts
import { serve, Router, postgres, user, agent, kb, messager, ui, cors, logger } from 'weifuwu'
import { openai } from '@ai-sdk/openai'

const app = new Router()
app.use(cors())
app.use(logger())
app.use(postgres())                    // → ctx.sql
app.use(user())                        // → ctx.user, ctx.userModule
app.use(kb())                          // → ctx.kb
app.use(agent({
  model: openai('deepseek-v4-flash', { baseURL: 'https://api.deepseek.com/v1' }),
  knowledge: { search: async (q, ctx) => ctx.kb.search(q) },
}))                                     // → ctx.agent
app.use(messager())                    // → ctx.messager
app.use(ui())                          // → ctx.ui

// 业务 API — ctx 中所有能力可直接使用
app.post('/api/chat', async (req, ctx) => {
  const { messages } = await req.json()
  return ctx.agent.chatStreamResponse({ messages })
})

app.post('/api/messages', async (req, ctx) => {
  const msg = await ctx.messager.sendMessage(ctx.params.conversationId, req.body)
  return Response.json(msg, { status: 201 })
})

// 客户端编译（无需本地构建步骤）
app.get('/static/app.js', async (req, ctx) => ctx.ui.js('./src/main.tsx'))

serve(app, { port: 3000 })
```

**前端 `src/main.tsx` — ctx 驱动组件：**
```tsx
import { signal, createApp, api, auth, socket, router, RouteView, LoginForm, Link } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'

function AppShell(_props: {}, ctx: WfuiContext) {
  if (!ctx.isAuthenticated) return <LoginForm />
  return (
    <div>
      <nav><Link to="/chat">Chat</Link></nav>
      <main><RouteView /></main>
    </div>
  )
}

const app = createApp()
app.use(api())                        // → ctx.api.get/post/...
app.use(auth())                       // → ctx.user/login/logout
app.use(socket())                     // → ctx.socket.send/onMessage
app.use(router({ routes }))           // → ctx.route.path/params/query
app.mount('#root', AppShell)
```

**`tsconfig.json`：**
```json
{ "jsx": "react-jsx", "jsxImportSource": "weifuwu/client" }
```

---

## Environment Variables

| Variable | Default | Used by |
|----------|---------|---------|
| `DATABASE_URL` | `postgres://root:123456@localhost:5432/demo` | `postgres()` |
| `REDIS_URL` | `redis://localhost:6379` | `redis()`, `queue()` |
| `JWT_SECRET` | — | `user()` |
| `DASHSCOPE_API_KEY` | — | `kb()` (embedding) |
| `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` | — | `agent()` (LLM) |
| `DEEPSEEK_MODEL` | `deepseek-v4-flash` | `agent()` |

---

## Backend Modules

### postgres
```ts
import { postgres } from 'weifuwu'
const sql = postgres()
app.use(sql)  // → ctx.sql
await ctx.sql`SELECT * FROM users WHERE id = ${id}`
await ctx.sql.begin(async (sql) => { /* transaction */ })
```
| Method | Description |
|--------|-------------|
| `ctx.sql\`...\`` | Tagged template SQL |
| `ctx.sql.begin(fn)` | Transaction |
| `sql.close()` | Close pool |

### redis
```ts
import { redis } from 'weifuwu'
const r = redis()
app.use(r)  // → ctx.redis
await ctx.redis.set('key', 'value')
await ctx.redis.get('key')
redis.close()
```
Reads `REDIS_URL` env (default: `redis://localhost:6379`).

### user
```ts
import { user, requireRole } from 'weifuwu'
app.use(postgres())
app.use(user({ secret: process.env.JWT_SECRET }))
// → ctx.user (UserRecord | undefined), ctx.userModule

// ctx.user 由 Authorization Bearer token 或 token cookie 自动解析
app.get('/api/me', async (req, ctx) => {
  if (!ctx.user) return new Response('Unauthorized', { status: 401 })
  return Response.json(ctx.user)  // ctx.user.name / .email / .role
})
```
| `ctx.userModule.*` | Returns | Description |
|--------------------|---------|-------------|
| `register(input)` | `{ user, token }` | Register |
| `login(email, pw)` | `{ user, token } \| null` | Login |
| `getUserById(id)` | `UserRecord \| null` | Get by ID |
| `updateUser(id, input)` | `UserRecord \| null` | Update |
| `changePassword(id, oldPw, newPw)` | `boolean` | Change password |
| `deleteUser(id)` | `boolean` | Soft delete |
| `listUsers(inactive?)` | `UserRecord[]` | List users |
| `verifyToken(token)` | `TokenPayload \| null` | Verify JWT |

`requireRole('admin')` — guard middleware. No auth → 401, wrong role → 403.

### messager
```ts
import { messager } from 'weifuwu'
app.use(postgres())
app.use(user())
app.use(messager())  // → ctx.messager
```
| `ctx.messager.*` | Returns | Description |
|------------------|---------|-------------|
| `sendMessage(convId, body)` | `Message` | Send + WebSocket broadcast |
| `getMessages(convId, opts?)` | `Message[]` | Cursor pagination |
| `getConversations()` | `Conversation[]` | List with unread |
| `createDirectConversation(userId)` | `Conversation` | Create/reuse DM |
| `createGroupConversation(title, userIds)` | `Conversation` | Create group |
| `editMessage(msgId, body)` | `Message \| null` | Edit (24h) |
| `deleteMessage(msgId)` | `boolean` | Soft delete |
| `markRead(convId)` | `void` | Mark as read |

### kb — Knowledge Base
```ts
import { kb } from 'weifuwu'
app.use(postgres())
app.use(kb())  // → ctx.kb
```
| `ctx.kb.*` | Returns | Description |
|------------|---------|-------------|
| `importText(title, text)` | `{ document, chunks }` | Import → chunk → embed |
| `search(query, opts?)` | `SearchResult[]` | Semantic search |
| `list()` | `Document[]` | List documents |
| `get(id)` | `Document \| null` | Get document |
| `delete(id)` | `boolean` | Delete + cascade chunks |

### agent
```ts
import { agent } from 'weifuwu'
import { openai } from '@ai-sdk/openai'
import { tool } from 'ai'
import { z } from 'zod'

app.use(agent({
  model: openai('deepseek-v4-flash', { baseURL: 'https://api.deepseek.com/v1' }),
  system: 'You are a helpful assistant.',
  knowledge: { search: async (q, ctx) => ctx.kb.search(q) },
  tools: {
    getWeather: tool({
      description: 'Get weather for a city',
      parameters: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ temp: 22, unit: 'C' }),
    }),
  },
  maxSteps: 5,
}))  // → ctx.agent
```
| `ctx.agent.*` | Description |
|--------------|-------------|
| `chat(prompt, opts?)` | Non-streaming, returns text |
| `chatStreamResponse({ messages })` | SSE stream (useChat compatible) |

### cms
```ts
import { cms, requireRole } from 'weifuwu'
app.use(postgres())
app.use(user())
app.use(cms())  // → ctx.cms
```
| `ctx.cms.*` | Returns | Description |
|-------------|---------|-------------|
| `create(input)` | `Content` | Create (admin) |
| `get(slug)` | `Content \| null` | Get by slug |
| `list(opts?)` | `Content[]` | List with filters |
| `publish(id)` / `unpublish(id)` | `Content \| null` | Toggle status |

### base — Dynamic Data Engine
```ts
app.use(base())  // → ctx.base
ctx.base.create({ name, tables })
ctx.base.insert(baseId, table, data)
ctx.base.query(baseId, table, { filter, limit })
```

### queue
```ts
const q = queue()
app.use(q)
q.process('email', async (job) => { ... })
q.cron('cleanup', '0 3 * * *', () => ...)
await q.add('email', { to: 'user@example.com' })
q.run()
```

### ui — SSR & SPA
```ts
app.use(ui())  // → ctx.ui
// SSR page
app.get('/blog/:slug', async (req, ctx) => ctx.ui.html`<!DOCTYPE html>...`)
// Dynamic JS compilation (no build step)
app.get('/static/app.js', async (req, ctx) => ctx.ui.js('./src/main.tsx'))
// CSS with Tailwind v4 support
app.get('/static/style.css', async (req, ctx) => ctx.ui.css('./public/style.css'))
```

---

## Frontend — weifuwu/client

Reactive frontend framework. Zero virtual DOM, zero external dependencies.

### Core APIs

```tsx
// Signal — reactive state
const count = signal(0)
const doubled = computed(() => count.value * 2)
effect(() => console.log('count:', count.value))

// Batch — merge multiple writes
batch(() => { a.value = 1; b.value = 2 })

// Untrack — read without subscribing
effect(() => { console.log(untrack(() => theme.value)) })

// Lifecycle
onMount(() => { init(); return () => cleanup() })
onCleanup(() => clearInterval(id))
```

### Reactive Array

```tsx
const items = reactiveArray([1, 2, 3])
items.push(4)        // [1, 2, 3, 4]
items.pop()          // [1, 2, 3]
items.remove(1)      // [1, 3]
items.clear()        // []
items.sort()
items.reverse()
```

### Control Flow

```tsx
// Show — conditional rendering
<Show when={isLoggedIn} fallback={<LoginPage />}>
  <Dashboard />
</Show>

// For — keyed list rendering
<For each={todos} keyBy="id">
  {(todo) => <TodoItem todo={todo} />}
</For>

// Transition — animated enter/leave
<Transition show={isOpen} name="fade">
  <Modal />
</Transition>

// ErrorBoundary — catch render errors
<ErrorBoundary fallback={(e) => <p>{e.message}</p>} onError={reportError}>
  {() => <Dashboard />}
</ErrorBoundary>
```

### Form Handling

```tsx
// useForm — validation + submit
const form = useForm({
  initial: { email: '', password: '' },
  validate: { email: (v) => !v && '必填' },
  validateOnInit: true,
})
<input {...form.field('email')} placeholder="邮箱" />
<button onClick={() => form.submit(data => ctx.login(data))}>登录</button>

// useModel — two-way binding (shorter)
const name = signal('')
const agreed = signal(false)
<input {...useModel(name)} placeholder="姓名" />
<input type="checkbox" {...useModel(agreed)} /> 同意
```

### Async Data

```tsx
const [posts, { loading, error, refetch }] = createResource(
  () => ctx.api.get('/api/posts'),
  { retry: 2, timeout: 5000 },  // optional
)

<Show when={loading}><Skeleton /></Show>
<Show when={error}><Error /></Show>
<For each={posts}>{(post) => <PostCard post={post} />}</For>
```

### Scoped CSS

```tsx
const s = createStyles({
  card: 'background: white; border-radius: 8px; padding: 16px;',
  title: 'font-size: 18px; color: #333;',
})
<div class={s.card}><h2 class={s.title}>...</h2></div>
```

### Type-Safe Context

```tsx
const ThemeCtx = createContext<string>('theme')
ThemeCtx.provide(ctx, 'dark')     // 提供
const theme = ThemeCtx.inject(ctx) // string | null
```

### Third-Party Integration

```tsx
const PieChart = wrap('div', (el, props, ctx) => {
  const chart = echarts.init(el)
  chart.setOption({ series: [{ type: 'pie', data: props.data }] })
  effect(() => chart.setOption(...))
  return () => chart.dispose()
})
<Dashboard><PieChart data={salesData} /></Dashboard>
```

### Pre-built Components

```tsx
import { LoginForm, Chat, Link } from 'weifuwu/client'

<LoginForm />       // 登录/注册（自动切换模式）
<Chat conversationId="123" />  // 实时消息聊天
<Link to="/about">关于</Link>   // SPA 导航（支持右键新标签页）
```

### Router

```tsx
const routes: RouteDef[] = [
  { path: '/', component: HomePage, title: 'Home' },
  { path: '/post/:id', component: PostPage,
    loader: async (ctx) => ({ post: await ctx.api.get(`/api/posts/${ctx.route.params.id}`) }),
  },
]

app.use(router({ routes, notFound: NotFound, mode: 'hash', transition: 'page' }))
// ctx.route.path / .params / .query / .data / .loading

// 路由出口
function AppShell() { return <main><RouteView /></main> }
```

### DevTools

```ts
import { enableDevtools } from 'weifuwu/client'
if (import.meta.env.DEV) enableDevtools()

// 浏览器控制台：
// __wefu__.inspect()     → 查看所有 signal
// __wefu__.warnings()    → 切换开发警告
```

---

## From React to weifuwu/client

| React | weifuwu/client |
|-------|----------------|
| `useState(0)` | `signal(0)` |
| `useMemo(() => a * 2, [a])` | `computed(() => a.value * 2)` |
| `useEffect(() => {...}, [])` | `effect(() => {...})` + `onCleanup(() => {...})` |
| `{condition && <X/>}` | `<Show when={condition}><X/></Show>` |
| `{items.map(i => <X/>)}` | `<For each={items}>{(i) => <X/>}</For>` |
| `className={...}` | `class={...}` |
| Context Provider | `ctx.provide(key, val)` / `createContext()` |
| `useNavigate()` | `ctx.app.navigate(path)` |
| `useParams()` | `ctx.route.params` |
| `fetch / axios` | `ctx.api.get/post/...` |
| WebSocket | `ctx.socket.send/onMessage` |

**What you DON'T need:**
- No hooks rules — no `use` prefix, no rules-of-hooks
- No virtual DOM — JSX creates real DOM directly
- No dependency arrays — `effect()` auto-tracks
- No state management library — signal is the state management
- No Context.Provider component — just `ctx.provide/inject`

---

## Utils

| Import | Purpose |
|--------|---------|
| `requireRole('admin')` | Middleware factory: check `ctx.user.role` |
| `createHub()` | WebSocket pub/sub |
| `HttpError` | `throw new HttpError(msg, 404)` |
| `trace()` | Request tracing |

---

## Router (Backend)

```ts
const app = new Router()
app.get(path, ...handlers)
app.post / put / delete / patch / head / options(path, ...handlers)
app.all(path, ...handlers)
app.ws(path, ...handler)          // WebSocket
app.use(middleware)                // Global middleware
app.mount(prefix, router)         // Sub-router
app.plugin(fn)                    // Plugin
app.onError(handler)              // Error handler
app.routes()                      // Debug: list all routes
```

---

## Project Structure

```
src/
├── index.ts              ← Entry, exports all modules
├── types.ts              ← Context, Handler, Middleware types
├── core/                 ← serve, router, ws, trace, logger
├── middleware/           ← cors, helmet, compress, rate-limit, upload, static, sandbox
├── user/                 ← User system (CRUD, JWT, requireRole)
├── messager/             ← IM + AI conversation layer
├── kb/                   ← RAG knowledge base
├── ai/                   ← AI Agent (LLM, tools, RAG)
├── cms/                  ← Content management
├── base/                 ← Dynamic data engine
├── postgres/             ← PostgreSQL client
├── redis/                ← Redis client
├── queue/                ← Job queue + cron
├── graphql.ts            ← GraphQL
├── hub.ts                ← WebSocket hub
├── ui/                   ← ctx.ui.html / ctx.ui.js / ctx.ui.css
├── client/               ← Frontend framework
│   ├── index.ts          ← Exports all client APIs (33 exports)
│   ├── signal.ts         ← Signal / effect / computed / batch / untrack
│   ├── jsx-runtime.ts    ← JSX → DOM + types + Show/For/wrap/ErrorBoundary/Portal/Transition
│   ├── app.ts            ← createApp / hydrate / middleware chain
│   ├── router.ts         ← Route matching / RouteView / loader / transition
│   ├── types.ts          ← WfuiContext / RouteDef / createContext
│   ├── lib/
│   │   ├── form.ts       ← useForm (validated forms)
│   │   ├── model.ts      ← useModel (two-way binding)
│   │   ├── resource.ts   ← createResource (async data)
│   │   ├── css.ts        ← createStyles (scoped CSS)
│   │   └── dev.ts        ← enableDevtools (dev warnings)
│   ├── middleware/
│   │   ├── api.ts        ← HTTP client → ctx.api
│   │   ├── auth.ts       ← Auth → ctx.user/login/logout
│   │   └── ws.ts         ← WebSocket → ctx.socket
│   └── components/
│       ├── LoginForm.tsx  ← Login/register
│       ├── Chat.tsx       ← Real-time chat
│       ├── Link.tsx       ← SPA navigation
│       └── Transition.tsx ← Animated enter/leave
└── test/                 ← 66 unit tests + 10 benchmarks

apps/demo/                ← Full-stack demo
├── server.ts             ← weifuwu server (user, kb, agent, messager 未演示)
├── src/main.tsx          ← SPA + SSR hydrate demo pages
├── public/               ← style.css (Tailwind + transition classes)
└── tsconfig.json

docker-compose.yml        ← postgres (pgvector) + redis
```

---

## Development

```bash
docker compose up -d         # Start postgres + redis
npm run build                # esbuild → dist/
npm run typecheck            # tsc --noEmit
npm test                     # Run all tests
```

---

## Performance (Client Benchmarks)

| Operation | Throughput |
|-----------|-----------|
| Signal creation | ~10,000 ops/ms |
| Signal read/write | ~9,600 ops/ms |
| Notify 10,000 effects | ~2,600 ops/ms |
| batch merge 10,000 writes | ~0.6ms |
| JSX div creation | ~200 ops/ms |
| For render 10,000 items | ~109 ops/ms |
