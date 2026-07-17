# weifuwu

**AI SaaS full-stack framework** — `(req, ctx) => Response` + `(props, ctx) => JSX`

```bash
npm install weifuwu
```

One package. Backend + frontend. User system, messaging, RAG knowledge base, AI Agent, CMS, dynamic data storage, reactive frontend. Set env vars and go.

---

## Module Overview

### Backend

| Module | Import | Depends on | Purpose |
|--------|--------|-----------|---------|
| `postgres()` | `weifuwu` | `DATABASE_URL` | PostgreSQL client (`ctx.sql`) |
| `redis()` | `weifuwu` | `REDIS_URL` | Redis client (`ctx.redis`) |
| `user()` | `weifuwu` | `postgres()`, `JWT_SECRET` | Auth, JWT, roles (`ctx.user`) |
| `messager()` | `weifuwu` | `postgres()`, `user()` | IM + AI conversation layer |
| `kb()` | `weifuwu` | `postgres()`, `DASHSCOPE_API_KEY` | RAG knowledge base |
| `agent()` | `weifuwu` | — | LLM chat, tools, streaming |
| `cms()` | `weifuwu` | `postgres()`, `user()` | Blog, docs, changelog |
| `base()` | `weifuwu` | `postgres()`, `user()` | Dynamic data engine |
| `queue()` | `weifuwu` | `REDIS_URL` | Job queue + cron |
| `ui()` | `weifuwu` | — | SSR/SPA rendering (`ctx.ui.html`, `ctx.ui.js`, `ctx.ui.css`) |

### Middleware

| Import | Purpose |
|--------|---------|
| `cors()` | CORS headers |
| `helmet()` | Security headers |
| `compress()` | gzip / brotli / deflate |
| `rateLimit()` | Sliding-window rate limiter |
| `logger()` | Request logging |
| `upload()` | Multipart file upload |
| `serveStatic()` | Static files |
| `sandbox()` | Filesystem isolation |

### Frontend (`weifuwu/client`)

| Import | Type | Purpose |
|--------|------|---------|
| `signal()` | function | Reactive state |
| `computed()` | function | Derived signals |
| `effect()` | function | Auto-tracked side effects |
| `<Show>` | component | Conditional rendering |
| `<For>` | component | List rendering |
| `<ErrorBoundary>` | component | Catch render errors |
| `<RouteView>` | component | Route outlet |
| `createApp()` | function | App instance with middleware chain |
| `mount()` | method | Mount SPA |
| `hydrate()` | method | SSR hydration |
| `router()` | middleware | Hash/history router |
| `api()` | middleware | HTTP client (`ctx.api`) |
| `auth()` | middleware | Auth state (`ctx.user/login/logout`) |
| `ws()` | middleware | WebSocket (`ctx.ws`) |
| `wrap()` | function | Third-party library integration |
| `useForm()` | function | Form state management |
| `createPortal()` | function | Render outside parent DOM |
| `LoginForm` | component | Login/register form |
| `Chat` | component | Real-time messaging |

### Utils

| Import | Purpose |
|--------|---------|
| `requireRole('admin')` | Middleware factory: check `ctx.user.role` |
| `createHub()` | WebSocket pub/sub |
| `HttpError` | `throw new HttpError(msg, 404)` |
| `trace()` | Request tracing |

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

## Quick Start

### Backend

```ts
import { serve, Router, postgres, user, kb, agent, messager } from 'weifuwu'
import { openai } from '@ai-sdk/openai'

const app = new Router()
app.use(postgres())
app.use(user())
app.use(kb())
app.use(messager())
app.use(agent({
  model: openai('deepseek-v4-flash', { baseURL: 'https://api.deepseek.com/v1' }),
  knowledge: { search: async (q, ctx) => ctx.kb.search(q) },
}))

app.post('/api/chat', async (req, ctx) => {
  const { messages } = await req.json()
  return ctx.agent.chatStreamResponse({ messages })
})

serve(app, { port: 3000 })
```

### Frontend

```tsx
import { signal, createApp, api, auth, ws, router, RouteView, LoginForm } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'

function AppShell(_props: {}, ctx: WfuiContext) {
  if (!ctx.isAuthenticated) return <LoginForm />
  return (
    <div>
      <nav><a onClick={() => ctx.app.navigate('/chat')}>Chat</a></nav>
      <main><RouteView /></main>
    </div>
  )
}

const app = createApp()
app.use(api())
app.use(auth())
app.use(ws())
app.use(router({ routes }))
app.mount('#root', AppShell)
```

```json
// tsconfig.json
{ "jsx": "react-jsx", "jsxImportSource": "weifuwu/client" }
```

Build (traditional, or use `ctx.ui.js()` for dynamic compilation):

```js
import esbuild from 'esbuild'
esbuild.build({
  entryPoints: ['src/main.tsx'],
  jsx: 'automatic',
  jsxImportSource: 'weifuwu/client',
  bundle: true,
})
```

Or skip the build step entirely with server-side compilation:

```ts
app.get('/static/app.js', async (req, ctx) => ctx.ui.js('./src/main.tsx'))
app.get('/static/style.css', async (req, ctx) => ctx.ui.css('./src/style.css'))
```

---

## Backend Modules

Each module follows: import → usage → API table.

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
| `ctx.sql\`...\`` | Tagged template SQL queries |
| `ctx.sql.begin(fn)` | Transaction |
| `sql.close()` | Close pool |

Reads `DATABASE_URL` env. Supports migrations via `postgres({ migrate: { directory: './migrations' } })`.

### redis

```ts
import { redis } from 'weifuwu'

const r = redis()
app.use(r)  // → ctx.redis

await ctx.redis.set('key', 'value')
await ctx.redis.get('key')
```

| Method | Description |
|--------|-------------|
| `ctx.redis.set(key, value)` | Set key |
| `ctx.redis.get(key)` | Get key |
| `ctx.redis.del(key)` | Delete key |
| `redis.close()` | Close connection |

Reads `REDIS_URL` env (default: `redis://localhost:6379`).

### user

```ts
import { user, requireRole } from 'weifuwu'

app.use(postgres())
app.use(user({ secret: process.env.JWT_SECRET }))

app.post('/api/register', async (req, ctx) =>
  Response.json(await ctx.userModule.register(await req.json())))

app.post('/api/login', async (req, ctx) => {
  const { email, password } = await req.json()
  const result = await ctx.userModule.login(email, password)
  return result ? Response.json(result) : new Response('Unauthorized', { status: 401 })
})

app.get('/api/me', async (req, ctx) =>
  ctx.user ? Response.json(ctx.user) : new Response('Unauthorized', { status: 401 }))
```

| Method | Returns | Description |
|--------|---------|-------------|
| `register(input)` | `{ user, token }` | Register |
| `login(email, pw)` | `{ user, token } \| null` | Login |
| `getUserById(id)` | `UserRecord \| null` | Get by ID |
| `getUserByEmail(email)` | `UserRecord \| null` | Get by email |
| `updateUser(id, input)` | `UserRecord \| null` | Update |
| `changePassword(id, oldPw, newPw)` | `boolean` | Change password |
| `deleteUser(id)` | `boolean` | Soft delete |
| `listUsers(inactive?)` | `UserRecord[]` | List users |
| `generateToken(user)` | `string` | Issue JWT |
| `verifyToken(token)` | `TokenPayload \| null` | Verify JWT |

`ctx.user` — auto-resolved from `Authorization: Bearer` or `token` cookie. Fields: `id, name, email, role, [key: string]`.

`requireRole('admin')` — guard middleware. No auth → 401, wrong role → 403.

Password: scrypt + 32-byte random salt. Token: HMAC SHA-256, 7 day expiry.

### messager

```ts
import { messager } from 'weifuwu'

app.use(postgres())
app.use(user())
app.use(messager())

app.ws('/ws', {
  async open(ws, ctx) {
    for (const c of await ctx.messager.getConversations())
      ctx.ws.join(`conversation:${c.id}`)
  },
})

app.post('/api/messages', async (req, ctx) => {
  const { conversationId, body } = await req.json()
  const msg = await ctx.messager.sendMessage(conversationId, body)
  return Response.json(msg, { status: 201 })
})

app.get('/api/conversations/:id/messages', async (req, ctx) => {
  const url = new URL(req.url)
  return Response.json(await ctx.messager.getMessages(ctx.params.id, {
    before: url.searchParams.get('before') || undefined,
    limit: parseInt(url.searchParams.get('limit') || '50'),
  }))
})
```

| Method | Returns | Description |
|--------|---------|-------------|
| `createDirectConversation(userId)` | `Conversation` | Create/reuse DM |
| `createGroupConversation(title, userIds)` | `Conversation` | Create group |
| `sendMessage(convId, body)` | `Message` | Send + broadcast to room |
| `getMessages(convId, opts?)` | `Message[]` | Cursor pagination |
| `editMessage(msgId, body)` | `Message \| null` | Edit (24h window) |
| `deleteMessage(msgId)` | `boolean` | Soft delete |
| `getConversations()` | `Conversation[]` | List with unread + last message |
| `getConversation(id)` | `Conversation \| null` | Get detail |
| `markRead(convId)` | `void` | Mark as read |
| `addParticipants(convId, userIds)` | `void` | Add members |
| `removeParticipant(convId, userId?)` | `boolean` | Leave / kick |

Storage: 3 auto-migrated tables (conversations, participants, messages). WebSocket push via rooms.

### kb — Knowledge Base

```ts
import { kb } from 'weifuwu'

app.use(postgres())
app.use(kb())

app.post('/api/kb/import', async (req, ctx) => {
  const { title, content } = await req.json()
  return Response.json(await ctx.kb.importText(title, content), { status: 201 })
})

app.post('/api/kb/search', async (req, ctx) => {
  const { query } = await req.json()
  return Response.json(await ctx.kb.search(query, { limit: 5 }))
})
```

| Method | Returns | Description |
|--------|---------|-------------|
| `importText(title, text, opts?)` | `{ document, chunks }` | Import → chunk → embed → store |
| `importDocuments(docs)` | `Document[]` | Batch import |
| `search(query, opts?)` | `SearchResult[]` | Semantic search (cosine) |
| `list()` | `Document[]` | List documents |
| `get(id)` | `Document \| null` | Get document |
| `delete(id)` | `boolean` | Delete + cascade chunks |

Default: DashScope `text-embedding-v4`. Customizable via `kb({ embed: async (text) => number[], dimensions: 1536 })`. Storage: `kb_documents` + `kb_chunks` (VECTOR(1536) + TSVECTOR GIN index).

Integration with agent:

```ts
app.use(agent({
  model: openai('deepseek-v4-flash', ...),
  knowledge: { search: async (query, ctx) => ctx.kb.search(query) },
}))
```

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
}))

app.post('/api/chat', async (req, ctx) => {
  const { messages } = await req.json()
  return ctx.agent.chatStreamResponse({ messages })
})
```

| Method | Description |
|-------------|-------------|
| `chat(prompt, opts?)` | Non-streaming, returns text |
| `chatStreamResponse({ messages })` | SSE stream (compatible with `useChat`) |

Default model: DeepSeek-V4-Flash via `@ai-sdk/openai`. Override with `DEEPSEEK_MODEL` env. API key via `DEEPSEEK_API_KEY` or `OPENAI_API_KEY`.

Features: `knowledge.search` (RAG), `tools` (auto-loop with maxSteps), `sandbox: true` (filesystem isolation), `store` (session persistence), `agents` (multi-agent).

### cms

```ts
import { cms, requireRole } from 'weifuwu'

app.use(postgres())
app.use(user())
app.use(cms())

app.get('/api/posts', async (req, ctx) =>
  Response.json(await ctx.cms.list({ type: 'post', status: 'published' })))

app.get('/api/posts/:slug', async (req, ctx) => {
  const post = await ctx.cms.get(ctx.params.slug)
  return post ? Response.json(post) : new Response('Not found', { status: 404 })
})

app.post('/api/admin/posts', requireRole('admin'), async (req, ctx) =>
  Response.json(await ctx.cms.create(await req.json()), { status: 201 }))
```

| Method | Returns | Description |
|--------|---------|-------------|
| `create(input)` | `Content` | Create (admin) |
| `get(slug)` | `Content \| null` | Get by slug |
| `getById(id)` | `Content \| null` | Get by ID |
| `update(id, input)` | `Content \| null` | Update (admin) |
| `delete(id)` | `boolean` | Delete (admin) |
| `list(opts?)` | `Content[]` | List with cursor + filters |
| `publish(id)` | `Content \| null` | Publish (admin) |
| `unpublish(id)` | `Content \| null` | Unpublish (admin) |
| `listTags()` | `TagWithCount[]` | List tags |
| `createTag(name)` | `Tag` | Create tag |

Types: post / page / doc / changelog (any string). Status: draft / published / archived. Tags: many-to-many, auto-created. Parent_id for hierarchy. Auth: non-admin users see published only.

### base — Dynamic Data Engine

```ts
import { base } from 'weifuwu'

app.use(postgres())
app.use(user())
app.use(base())

app.post('/api/bases', async (req, ctx) =>
  Response.json(await ctx.base.create(await req.json()), { status: 201 }))

app.post('/api/bases/:id/:table', async (req, ctx) =>
  Response.json(await ctx.base.insert(ctx.params.id, ctx.params.table, await req.json()), { status: 201 }))

app.get('/api/bases/:id/:table', async (req, ctx) => {
  const url = new URL(req.url)
  return Response.json(await ctx.base.query(ctx.params.id, ctx.params.table, {
    filter: url.searchParams.get('filter') ? JSON.parse(url.searchParams.get('filter')!) : undefined,
    limit: parseInt(url.searchParams.get('limit') || '50'),
  }))
})
```

| Method | Returns | Description |
|--------|---------|-------------|
| `create({ name, tables })` | `BaseDef` | Create database |
| `insert(baseId, table, data)` | `Row` | Insert row |
| `getRow(baseId, table, id)` | `Row \| null` | Get row |
| `updateRow(baseId, table, id, data)` | `Row \| null` | Update row |
| `deleteRow(baseId, table, id)` | `boolean` | Delete row |
| `query(baseId, table, opts?)` | `Row[]` | Query (filter/sort/limit/offset) |
| `search(baseId, table, field, query)` | `Row[]` | Full-text search |
| `similaritySearch(baseId, table, field, vector)` | `Row[]` | Vector search |

Fixed Slot architecture: a single `base_data` table with ~120 physical columns (64 text, 32 number, 8 date, 4 vector, 4 search). Field → physical column mapping stored in `base_column_map`. Overflow to JSONB. pgvector auto-detected.

### queue

```ts
import { queue } from 'weifuwu'

const q = queue()
app.use(q)  // → ctx.queue

q.process('email', async (job) => { await sendEmail(job.payload) })
q.cron('cleanup', '0 3 * * *', () => cleanup())
await q.add('email', { to: 'user@example.com' })
q.run()
```

| Method | Description |
|--------|-------------|
| `q.process(name, handler)` | Register job processor |
| `q.add(name, payload, opts?)` | Enqueue job |
| `q.cron(name, schedule, fn)` | Schedule recurring job |
| `q.run()` | Start processing |
| `q.close()` | Shutdown |

### ui — SSR & SPA

```ts
import { ui } from 'weifuwu'

app.use(ui())

// SSR page — tagged template returns Response
app.get('/blog/:slug', async (req, ctx) => ctx.ui.html`
  <!DOCTYPE html><html>
  <head><title>${post.title}</title></head>
  <body><div id="root">${ctx.ui.html.unsafe(post.body)}</div>
  <script src="/static/app.js"></script></body></html>`)

// Dynamic JS compilation (no build step needed)
app.get('/static/app.js', async (req, ctx) => ctx.ui.js('./src/main.tsx'))

// CSS with Tailwind support (auto-detects tailwindcss + postcss)
app.get('/static/style.css', async (req, ctx) => ctx.ui.css('./src/style.css'))
```

| API | Returns | Description |
|-----|---------|-------------|
| `ctx.ui.html\`...\`` | `Response` | Tagged template → HTML |
| `ctx.ui.html.unsafe(str)` | `string` | Mark as safe (skip escaping) |
| `ctx.ui.js(entryPath)` | `Response` | Compile TSX → JS bundle |
| `ctx.ui.css(entryPath)` | `Response` | Read/compile CSS (Tailwind v4) |

Tailwind CSS v4 support: add `@import 'tailwindcss'` to your CSS entry file. `ctx.ui.css` auto-detects `postcss` + `@tailwindcss/postcss`. Falls back to raw file serving if not installed.

---

## Quick Start (Frontend Only)

You can use `weifuwu/client` standalone — just build with esbuild:

```bash
npm install weifuwu esbuild
```

**src/main.tsx:**
```tsx
import { signal, computed, Show, For, createStyles, domMount } from 'weifuwu/client'

const todos = signal([
  { id: 1, text: 'Learn weifuwu', done: false },
  { id: 2, text: 'Build an app', done: false },
])
const input = signal('')
const filter = signal<'all' | 'active' | 'done'>('all')

const filtered = computed(() => {
  const f = filter.value
  return todos.value.filter(t => f === 'all' ? true : f === 'active' ? !t.done : t.done)
})

const s = createStyles({
  container: 'max-width: 400px; margin: 40px auto; font-family: system-ui;',
  input: 'width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;',
  item: 'display: flex; gap: 8px; padding: 8px 0; border-bottom: 1px solid #eee;',
  done: 'text-decoration: line-through; color: #999;',
  btn: 'padding: 4px 12px; border: none; border-radius: 4px; cursor: pointer;',
  btnActive: 'padding: 4px 12px; border: none; border-radius: 4px; cursor: pointer; background: #0066ff; color: white;',
})

function App() {
  return (
    <div class={s.container}>
      <h1>Todo</h1>
      <div style="display: flex; gap: 4px; margin-bottom: 12px;">
        {(['all', 'active', 'done'] as const).map(f => (
          <button class={filter.value === f ? s.btnActive : s.btn}
            onClick={() => filter.value = f}>{f}</button>
        ))}
      </div>
      <div style="display: flex; gap: 4px;">
        <input class={s.input} value={input}
          onInput={(e: any) => input.value = e.target.value}
          onKeyDown={(e: any) => e.key === 'Enter' && addTodo()}
          placeholder="Add todo..." />
        <button class={s.btn} onClick={addTodo}>+</button>
      </div>
      <For each={filtered}>
        {(todo: any) => (
          <div class={s.item}>
            <input type="checkbox" checked={todo.done}
              onChange={() => toggleTodo(todo.id)} />
            <span class={todo.done ? s.done : ''}>{todo.text}</span>
          </div>
        )}
      </For>
    </div>
  )
}

function addTodo() {
  const text = input.value.trim()
  if (!text) return
  todos.value = [...todos.value, { id: Date.now(), text, done: false }]
  input.value = ''
}
function toggleTodo(id: number) {
  todos.value = todos.value.map(t => t.id === id ? { ...t, done: !t.done } : t)
}

domMount('#root', <App />)
```

**Build & run:**
```bash
npx esbuild src/main.tsx --jsx=automatic --jsxImportSource=weifuwu/client --bundle --outfile=dist/app.js
```

Create `index.html` and open in browser:
```html
<!DOCTYPE html><html><body><div id="root"></div>
<script src="dist/app.js"></script></body></html>
```

---

## Frontend — weifuwu/client

Reactive frontend framework. Zero virtual DOM, zero external dependencies. Component model: `(props, ctx) => Node`.

### Concepts

```tsx
// Signal — reactive data
const count = signal(0)
count.value = count.value + 1  // DOM updates automatically

// Computed — derived signals
const doubled = computed(() => count.value * 2)

// Effect — auto-tracked side effects
effect(() => console.log('count:', count.value))

// Component — (props, ctx) => JSX
function MyComponent({ name }: { name: string }, ctx: WfuiContext) {
  return <div>Hello {name}</div>
}
```

### createApp + Middleware

```tsx
const app = createApp()
app.use(api())    // ctx.api.get/post/put/patch/delete
app.use(auth())   // ctx.user / ctx.login / ctx.logout / ctx.register
app.use(ws())     // ctx.ws.send / onMessage / join / leave
app.use(router({ routes }))  // ctx.route.path/params/query

app.mount('#root', AppShell)      // SPA mode
app.hydrate('#comments', Comments)  // SSR hydration (doesn't clear DOM)
```

### Router

```tsx
const routes: RouteDef[] = [
  { path: '/', component: HomePage, title: 'Home' },
  { path: '/post/:id', component: PostPage, loader: async (ctx) => ({
    post: await ctx.api.get(`/api/posts/${ctx.route.params.id}`),
  })},
]

app.use(router({ routes, notFound: NotFound, mode: 'hash' }))

// In component:
ctx.route.path     // "/post/123"
ctx.route.params   // { id: "123" }
ctx.route.query    // { tab: "settings" }
ctx.route.data     // { post: {...} } — from loader
```

Loader data flow: component renders immediately (shows loading state), loader completes → re-render with data.

### wrap() — Third-party Library Integration

```tsx
import { wrap, effect } from 'weifuwu/client'
import * as echarts from 'echarts'

const PieChart = wrap('div', (el, props: { data: any[] }, ctx) => {
  const chart = echarts.init(el)
  chart.setOption({ series: [{ type: 'pie', data: props.data }] })
  effect(() => chart.setOption({ series: [{ type: 'pie', data: props.data }] }))
  return () => chart.dispose()  // cleanup when element is removed
})

// Use as regular component:
<Dashboard><PieChart data={salesData} /></Dashboard>
```

### useForm() — Form State Management

```tsx
import { useForm } from 'weifuwu/client'

const form = useForm({
  initial: { email: '', password: '' },
  validate: {
    email: (v) => !v.includes('@') && 'Invalid email',
  },
})

// Bind to input — {...form.field('name')} sets value + onInput
<input {...form.field('email')} placeholder="Email" />
{form.errors.email && <span>{form.errors.email}</span>}

// Auto-validates all fields before calling handler
<button onClick={() => form.submit((data) => ctx.login(data.email, data.password))}>
  Login
</button>

// Programmatic control
form.setValue('email', 'a@b.com')
form.setValues({ email: 'a@b.com', password: '123' })
form.reset()
```

### createPortal & ErrorBoundary

```tsx
import { createPortal, Show, ErrorBoundary } from 'weifuwu/client'

// Portal — render outside parent (modals, dropdowns)
<Show when={showModal}>
  {createPortal(
    <div class="fixed inset-0 bg-black/50">...</div>,
    document.body,
  )}
</Show>

// ErrorBoundary — catch render errors, children must be a thunk
<ErrorBoundary fallback={(e) => <p>Error: {e.message}</p>}>
  {() => <Dashboard />}
</ErrorBoundary>
```

### Pre-built Components

```tsx
import { LoginForm, Chat } from 'weifuwu/client'

function LoginPage(_, ctx) {
  if (ctx.isAuthenticated) return ctx.app.navigate('/')
  return <LoginForm />
}

function ChatPage(_, ctx) {
  return <Chat conversationId="123" />
}
```

---

## Router

```ts
const app = new Router()

// HTTP
app.get(path, ...handlers)
app.post / put / delete / patch / head / options(path, ...handlers)
app.all(path, ...handlers)

// WebSocket
app.ws(path, ...middlewares, handler)
// handler: { open?, message?, close?, error? }

// Middleware & mounting
app.use(middleware)
app.mount(prefix, router)
app.plugin(fn)
app.onError(handler)
app.routes()  // debug: list all routes
```

---

## Project Structure

```
src/
├── index.ts            ← Entry, exports all modules
├── types.ts            ← Context, Handler, Middleware types
├── core/               ← serve, router, ws, trace, logger
├── middleware/          ← cors, helmet, compress, rate-limit, upload, static, sandbox
├── user/               ← User system (CRUD, JWT, requireRole)
├── messager/           ← IM + AI conversation layer
├── kb/                 ← RAG knowledge base
├── ai/                 ← AI Agent (LLM, tools, RAG)
├── cms/                ← Content management
├── base/               ← Dynamic data engine
├── postgres/           ← PostgreSQL client
├── redis/              ← Redis client
├── queue/              ← Job queue + cron
├── graphql.ts          ← GraphQL
├── hub.ts              ← WebSocket hub
├── ui/                 ← ctx.ui.html / ctx.ui.js / ctx.ui.css
├── client/             ← Frontend framework
│   ├── index.ts        ← Exports all client APIs
│   ├── signal.ts       ← Signal / effect / computed
│   ├── jsx-runtime.ts  ← JSX → DOM + types + Show/For/wrap/ErrorBoundary/createPortal
│   ├── app.ts          ← createApp / hydrate / middleware chain
│   ├── router.ts       ← Route matching / RouteView / loader
│   ├── types.ts        ← WfuiContext / RouteDef
│   ├── lib/
│   │   └── form.ts     ← useForm
│   ├── middleware/
│   │   ├── api.ts      ← HTTP client
│   │   ├── auth.ts     ← Login / logout / token
│   │   └── ws.ts       ← WebSocket
│   └── components/
│       ├── LoginForm.ts
│       └── Chat.ts
└── test/               ← Tests

apps/demo/              ← Full-stack demo
├── src/main.tsx         ← SPA + SSR hydrate demo pages
├── server.ts            ← weifuwu server
├── public/
│   ├── index.html       ← HTML skeleton
│   └── style.css        ← Demo styles (Tailwind)
└── tsconfig.json

docker-compose.yml      ← postgres (pgvector) + redis
```

---

## From React to weifuwu/client

If you know React, you already know most of weifuwu/client. Here's a direct mapping:

### State

| React | weifuwu/client |
|-------|----------------|
| `useState(0)` | `signal(0)` |
| `useMemo(() => a * 2, [a])` | `computed(() => a.value * 2)` |
| `useEffect(() => {...}, [])` | `effect(() => {...})` + `onCleanup(() => {...})` |
| `useRef(null)` | `signal(null)` |
| `useCallback(fn, [])` | Plain function — no memo needed |

### Rendering

| React | weifuwu/client |
|-------|----------------|
| `props.children` | `props.children` |
| `{condition && <X/>}` | `<Show when={condition}><X/></Show>` |
| `{items.map(i => <X/>)}` | `<For each={items}>{(i) => <X/>}</For>` |
| `<React.Fragment>` | `<></>` (same) |
| `onClick={handler}` | `onClick={handler}` (same) |
| `className={...}` | `class={...}` |
| `dangerouslySetInnerHTML` | N/A — use `innerHTML` via `ref` |

### Component Model

```tsx
// React
function Card({ title, children }: { title: string; children: ReactNode }) {
  return <div className="card"><h2>{title}</h2>{children}</div>
}

// weifuwu/client — same shape, different types
function Card({ title, children }: { title: string; children: any }, ctx: WfuiContext) {
  return <div class="card"><h2>{title}</h2>{children}</div>
}
```

### What you DON'T need

- **No hooks rules** — no `use` prefix, no rules-of-hooks. Signal is just a function.
- **No virtual DOM** — JSX creates real DOM nodes directly. No diffing, no reconciliation.
- **No `useEffect` dependency arrays** — `effect()` auto-tracks signal dependencies.
- **No `useMemo` / `useCallback`** — `computed()` for derived values, plain functions for callbacks.
- **No `useRef`** — use `signal()` or `ref` callback.
- **No Context Provider component** — `ctx.provide(key, val)` / `ctx.inject(key)` or typed `createContext()`.
- **No class components** — only functions.
- **No state management library** — signal is the state management.

### Key difference: `ctx`

In React, data flows through props and Context. In weifuwu/client, the second argument `ctx` carries all environment:

```tsx
function Page(props: {}, ctx: WfuiContext) {
  ctx.route.path       // current route
  ctx.api.get(...)     // HTTP client
  ctx.ws.send(...)     // WebSocket
  ctx.user             // current user (if auth middleware used)
  ctx.provide(key, v)  // provide to descendants
}
```

No need to import Router hooks, HTTP clients, or auth helpers — they're all in `ctx`.

---

## Development

```bash
docker compose up -d         # Start postgres + redis
npm run build                # esbuild → dist/
npm run typecheck            # tsc --noEmit
npm test                     # Run tests
```
