# weifuwu

**AI SaaS full-stack framework** — `(req, ctx) => Response` + `(props, ctx) => JSX`

```bash
npm install weifuwu
```

One package. Backend + frontend. User system, instant messaging, RAG knowledge base, AI Agent, CMS, dynamic data storage, and a reactive frontend framework. Configure environment variables and go.

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
      <nav><a onClick={() => ctx.app.navigate('/chat')}>聊天</a></nav>
      <main><RouteView /></main>
    </div>
  )
}

const app = createApp()
app.use(api())              // ← ctx.api.get/post
app.use(auth())             // ← ctx.user / ctx.login / ctx.logout
app.use(ws())               // ← ctx.ws.send / onMessage
app.use(router({ routes })) // ← ctx.route / 路由
app.mount('#root', AppShell)
```

```json
// tsconfig.json
{ "jsx": "react-jsx", "jsxImportSource": "weifuwu/client" }
```

```js
// build.mjs — 传统构建方式（可选）
// 推荐：使用 ctx.ui.js() 服务端动态编译，无需独立构建脚本
esbuild.build({
  entryPoints: ['src/main.tsx'],
  jsx: 'automatic',
  jsxImportSource: 'weifuwu/client',
  bundle: true,
})
```

或用服务端动态编译——一行代码，无需构建步骤、无需 watch 模式：
```ts
app.get('/static/app.js', async (req, ctx) => ctx.ui.js('./src/main.tsx'))
app.get('/static/style.css', async (req, ctx) => ctx.ui.css('./src/style.css'))
```

### Environment Variables

| Variable | Default | Used by |
|----------|---------|---------|
| `DATABASE_URL` | `postgres://root:123456@localhost:5432/demo` | `postgres()` |
| `REDIS_URL` | `redis://localhost:6379` | `redis()` |
| `JWT_SECRET` | — | `user()` |
| `DASHSCOPE_API_KEY` | — | `kb()` (embedding) |
| `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` | — | `agent()` (LLM) |
| `DEEPSEEK_MODEL` | `deepseek-v4-flash` | `agent()` |

---

## Modules

### Backend

| Module | Import | Dependency | Purpose |
|--------|--------|-----------|---------|
| User | `user()` | `postgres()` | Auth, JWT, roles |
| Messager | `messager()` | `postgres()`, `user()` | IM + AI conversation layer |
| KB | `kb()` | `postgres()` | RAG knowledge base |
| Agent | `agent()` | — | LLM chat, tool calling, streaming |
| CMS | `cms()` | `postgres()`, `user()` | Blog, docs, changelog |
| Base | `base()` | `postgres()`, `user()` | Dynamic data engine |

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

### Core

| Import | Purpose |
|--------|---------|
| `serve(app, opts?)` | Start HTTP server |
| `Router` | Trie-based router + WebSocket |
| `HttpError` | `throw new HttpError(msg, 404)` |
| `trace()` | Request tracing |
| `postgres()` | PostgreSQL client (`ctx.sql`) |
| `redis()` | Redis client (`ctx.redis`) |
| `queue()` | Job queue + cron |
| `createHub()` | WebSocket pub/sub |
| `ui()` | SSR + SPA rendering (`ctx.ui.html`, `ctx.ui.js`, `ctx.ui.css`) |

### Frontend (weifuwu/client)

| Import | Purpose |
|--------|---------|
| `signal()` | Reactive state |
| `computed()` | Derived signals |
| `effect()` | Auto-tracked side effects |
| `<Show>` | Conditional rendering |
| `<For>` | List rendering |
| `<RouteView>` | Route outlet |
| `createApp()` | App instance with middleware chain |
| `router()` | Hash/history router with params + query |
| `api()` | HTTP client (`ctx.api.get/post`) |
| `auth()` | Auth state (`ctx.user/login/logout`) |
| `ws()` | WebSocket (`ctx.ws.send/onMessage`) |
| `LoginForm` | Login/register form component |
| `Chat` | Real-time messaging component |
| `domMount()` | Direct DOM mounting |
| `wrap()` | Third-party library integration |
| `useForm()` | Form state management (validation, submit, reset) |
| `createPortal()` | Render outside parent DOM hierarchy |
| `<ErrorBoundary>` | Catch render errors, show fallback |

### Utilities

| Import | Purpose |
|--------|---------|
| `requireRole('admin')` | Middleware: check `ctx.user.role` |

---

## Frontend (weifuwu/client)

**weifuwu/client** is a reactive frontend framework built on Signal + TSX. Zero virtual DOM, zero dependencies, ~600 lines total.

### Concepts

```ts
// 1. Signal — reactive data
const count = signal(0)
count.value = count.value + 1  // DOM updates automatically

// 2. Computed — derived signals
const doubled = computed(() => count.value * 2)

// 3. Effect — auto-tracked side effects
effect(() => console.log('count:', count.value))

// 4. Component — (props, ctx) => JSX
function MyComponent({ name }: { name: string }, ctx: WfuiContext) {
  return <div>Hello {name}</div>
}
```

### createApp + Middleware

```tsx
import { createApp, router, RouteView } from 'weifuwu/client'
import type { WfuiContext, RouteDef } from 'weifuwu/client'

const app = createApp()
app.use(router({ routes, mode: 'hash' }))
app.mount('#root', AppShell)
```

### Router

```tsx
const routes: RouteDef[] = [
  { path: '/', component: HomePage, title: '首页' },
  { path: '/chat/:id', component: ChatPage, title: '聊天' },
  { path: '/user/:name', component: UserPage, title: '用户' },
]

app.use(router({
  routes,
  notFound: NotFound,
  mode: 'hash', // or 'history'
}))

// In layout:
function AppShell(_, ctx) {
  return (
    <div>
      <nav>
        <a onClick={() => ctx.app.navigate('/')}>首页</a>
        <a onClick={() => ctx.app.navigate('/chat/123')}>聊天</a>
      </nav>
      <main>
        <RouteView />  {/* ← renders matched route */}
      </main>
    </div>
  )
}

// Route params and query:
ctx.route.path     // "/chat/123"
ctx.route.params   // { id: "123" }
ctx.route.query    // { tab: "settings" }

#### Route Loader — 数据预取

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

// In component:
function PostPage(_, ctx) {
  const post = ctx.route.data.post
  if (!post) return <p class="text-gray-400">加载中...</p>
  return <h1 class="text-2xl font-bold">{post.title}</h1>
}
```

组件先渲染（显示 loading），loader 完成后自动重渲染。

### Middleware: api / auth / ws

```tsx
import { api, auth, ws } from 'weifuwu/client'

app.use(api())    // ctx.api.get/post/put/patch/delete
app.use(auth())   // ctx.user / ctx.login / ctx.logout / ctx.register
app.use(ws())     // ctx.ws.send / onMessage / join / leave
```

`api()` creates a fetch client with automatic token injection.
`auth()` persists sessions to localStorage, validates tokens on startup.
`ws()` manages WebSocket connections with auto-reconnect.

### Pre-built Components

```tsx
import { LoginForm, Chat } from 'weifuwu/client'

// Login / Register form
function LoginPage(_, ctx) {
  if (ctx.isAuthenticated) return ctx.app.navigate('/')
  return <LoginForm />
}

// Real-time chat
function ChatPage(_, ctx) {
  return <Chat conversationId="123" />
}
```

### SSR & SPA (ctx.ui.html / ctx.ui.js / ctx.ui.css)

```ts
import { ui } from 'weifuwu'

app.use(ui())

// SSR page — ctx.ui.html`` returns complete HTML Response
app.get('/blog/:slug', async (req, ctx) => ctx.ui.html`
  <!DOCTYPE html>
  <html>
  <head>
    <title>${post.title}</title>
    <link rel="stylesheet" href="/static/style.css">
  </head>
  <body>
    <div id="root">
      <h1>${post.title}</h1>
      <div>${ctx.ui.html.unsafe(post.body)}</div>
      <div data-hydrate="like"></div>
    </div>
    <script>window.__WFUI_PROPS__=${ctx.ui.html.unsafe(JSON.stringify({ post }))}</script>
    <script src="/static/app.js"></script>
  </body>
  </html>
`)

// Dynamic JS compilation — ctx.ui.js() compiles TSX on demand
app.get('/static/app.js', async (req, ctx) => ctx.ui.js('./src/main.tsx'))

// Dynamic CSS serving — ctx.ui.css() reads and serves CSS
app.get('/static/style.css', async (req, ctx) => ctx.ui.css('./src/style.css'))

// Client hydrates interactive sections, skips SSR content
const app = createApp()
app.use(api())

const root = document.getElementById('root')
if (root && root.children.length > 0) {
  // SSR page — hydrate only interactive areas
  app.hydrate('[data-hydrate="like"]', LikeButton)
} else {
  // SPA page — full mount
  app.mount('#root', AppShell)
}
```

### wrap() — Third-party Library Integration

```tsx
import { wrap, effect } from 'weifuwu/client'
import * as echarts from 'echarts'

// wrap(tagName, setup) creates a component:
// - Creates a <div> container
// - Calls setup(el, props, ctx) when element enters the document
// - Runs cleanup when element is removed
const PieChart = wrap('div', (el, props: { data: any[] }, ctx) => {
  const chart = echarts.init(el)
  chart.setOption({ series: [{ type: 'pie', data: props.data }] })
  effect(() => chart.setOption({ series: [{ type: 'pie', data: props.data }] }))
  return () => chart.dispose()
})

// Use in JSX like any component
<Dashboard>
  <PieChart data={salesData} />
</Dashboard>
```

### useForm() — 表单状态管理

```tsx
import { useForm } from 'weifuwu/client'

const form = useForm({
  initial: { email: '', password: '' },
  validate: {
    email: (v) => !v.includes('@') && '请输入有效邮箱',
    password: (v) => v.length < 6 && '至少 6 位',
  },
})

// 绑定到 input：{...form.field('name')} 自动设置 value + onInput
<input {...form.field('email')} placeholder="邮箱" />
{form.errors.email && <span class="text-red-500">{form.errors.email}</span>}

// 提交时自动验证所有字段
<button onClick={() => form.submit((data) => ctx.login(data.email, data.password))}>
  登录
</button>

// 重置
<button onClick={form.reset}>重置</button>

// 编程设置
form.setValue('email', 'a@b.com')
form.setValues({ email: 'a@b.com', password: '123' })
```

### createPortal() — 渲染到父容器外

适用于 Modal、Dropdown、Tooltip 等需突破 `overflow: hidden` 或 z-index 层级的情况。

```tsx
import { createPortal, Show } from 'weifuwu/client'

function Modal({ show, title, children }) {
  return <Show when={show}>
    {createPortal(
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center">
        <div class="bg-white rounded-xl p-6 min-w-[400px]">
          <h2 class="text-lg font-bold mb-4">{title}</h2>
          {children}
        </div>
      </div>,
      document.body
    )}
  </Show>
}
```

### ErrorBoundary — 错误边界

子组件渲染异常时捕获，显示 fallback 而非白屏。children 必须是 thunk（延迟执行）。

```tsx
import { ErrorBoundary } from 'weifuwu/client'

function AppShell(_, ctx) {
  return (
    <div>
      <nav>...</nav>
      <main>
        <ErrorBoundary fallback={(e) => <p>出错了: {e.message}</p>}>
          {() => <RouteView />}
        </ErrorBoundary>
      </main>
    </div>
  )
}
```

### Show / For

```tsx
// Conditional rendering (supports Signal)
<Show when={isLoggedIn} fallback={<LoginPage />}>
  <Dashboard />
</Show>

// List rendering (supports Signal)
<For each={filteredItems}>
  {(item) => <div>{item.name}</div>}
</For>
```

---

## user

Auth, registration, JWT, password management, roles.

```ts
import { user, requireRole } from 'weifuwu'

app.use(postgres())
app.use(user({ secret: process.env.JWT_SECRET }))

// Register
app.post('/api/register', async (req, ctx) => {
  const result = await ctx.userModule.register(await req.json())
  return Response.json(result)
})
// Login
app.post('/api/login', async (req, ctx) => {
  const { email, password } = await req.json()
  const result = await ctx.userModule.login(email, password)
  if (!result) return new Response('Unauthorized', { status: 401 })
  return Response.json(result)
})
// Current user
app.get('/api/me', async (req, ctx) => {
  if (!ctx.user) return new Response('Unauthorized', { status: 401 })
  return Response.json(ctx.user)
})
// Admin only
app.get('/api/admin/users', requireRole('admin'), async (req, ctx) => {
  return Response.json(await ctx.userModule.listUsers())
})
```

### ctx.userModule API

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
| `refreshToken(token)` | `string \| null` | Refresh JWT |

### ctx.user

Auto-resolved from `Authorization: Bearer` or `token` cookie.

```ts
interface User {
  id: string
  name: string
  email: string
  role: string
  [key: string]: unknown
}
```

### requireRole

```ts
app.get('/admin', requireRole('admin'), handler)
// No auth → 401, wrong role → 403
```

### Security

- Password: scrypt + 32-byte random salt
- Token: HMAC SHA-256, 7 day expiry

---

## messager

Instant messaging + AI conversation layer. Direct/group chat, message persistence, WebSocket push.

```ts
import { messager } from 'weifuwu'

app.use(postgres())
app.use(user())
app.use(messager())

// WebSocket — auto-join all user conversations
app.ws('/ws', {
  async open(ws, ctx) {
    for (const c of await ctx.messager.getConversations()) {
      ctx.ws.join(`conversation:${c.id}`)
    }
  },
})

// REST API
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

### ctx.messager API

| Method | Returns | Description |
|--------|---------|-------------|
| `createDirectConversation(userId)` | `Conversation` | Create/reuse DM |
| `createGroupConversation(title, userIds)` | `Conversation` | Create group |
| `sendMessage(convId, body)` | `Message` | Send, auto-broadcast to `conversation:{id}` room |
| `getMessages(convId, opts?)` | `Message[]` | Cursor pagination |
| `editMessage(msgId, body)` | `Message \| null` | Edit (24h window) |
| `deleteMessage(msgId)` | `boolean` | Soft delete |
| `getConversations()` | `Conversation[]` | List with unread + last message |
| `getConversation(id)` | `Conversation \| null` | Get detail |
| `markRead(convId)` | `void` | Mark as read |
| `getUnreadCount()` | `{ total, byConversation }` | Unread stats |
| `addParticipants(convId, userIds)` | `void` | Add members |
| `removeParticipant(convId, userId?)` | `boolean` | Leave / kick |

### Storage

3 tables: `conversations` / `participants` / `messages`. Auto-migration.

### AI Conversations

messager + agent = ChatGPT foundation. Messager handles sessions + push, agent handles LLM generation.

---

## kb

RAG knowledge base. Import docs → auto-chunk → DashScope embedding → pgvector storage → semantic search.

```ts
import { kb } from 'weifuwu'

app.use(postgres())
app.use(kb())

// Import
app.post('/api/kb/import', async (req, ctx) => {
  const { title, content } = await req.json()
  const result = await ctx.kb.importText(title, content)
  return Response.json(result, { status: 201 })
})

// Search
app.post('/api/kb/search', async (req, ctx) => {
  const { query } = await req.json()
  return Response.json(await ctx.kb.search(query, { limit: 5 }))
})
```

### ctx.kb API

| Method | Returns | Description |
|--------|---------|-------------|
| `importText(title, text, opts?)` | `{ document, chunks }` | Import → chunk → embed → store |
| `importDocuments(docs)` | `Document[]` | Batch import |
| `search(query, opts?)` | `SearchResult[]` | Semantic search (cosine) |
| `list()` | `Document[]` | List documents |
| `get(id)` | `Document \| null` | Get document |
| `getChunks(documentId)` | `Chunk[]` | Get chunks |
| `delete(id)` | `boolean` | Delete + cascade chunks |

### Configuration

```ts
// Default: DashScope text-embedding-v4 (env: DASHSCOPE_API_KEY)
app.use(kb())

// Custom embedding
app.use(kb({
  embed: async (text) => { /* return number[] */ },
  dimensions: 1536,
  chunkSize: 512,    // tokens
  chunkOverlap: 64,
}))
```

### Integration with Agent

```ts
app.use(agent({
  model: openai('deepseek-v4-flash', { baseURL: 'https://api.deepseek.com/v1' }),
  knowledge: {
    search: async (query, ctx) => ctx.kb.search(query),
  },
}))
```

### Storage

- `kb_documents` — document metadata
- `kb_chunks` — chunk content + VECTOR(1536) + TSVECTOR GIN index

---

## agent

AI Agent — LLM chat, tool calling, RAG, streaming.

```ts
import { agent } from 'weifuwu'
import { openai } from '@ai-sdk/openai'
import { tool } from 'ai'
import { z } from 'zod'

app.use(agent({
  model: openai('deepseek-v4-flash', { baseURL: 'https://api.deepseek.com/v1' }),
  system: 'You are a helpful assistant.',
  knowledge: {
    search: async (query, ctx) => ctx.kb.search(query),
  },
  tools: {
    getWeather: tool({
      description: 'Get weather for a city',
      parameters: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ temp: 22, unit: 'C' }),
    }),
  },
  maxSteps: 5,
}))

// Streaming
app.post('/api/chat', async (req, ctx) => {
  const { messages } = await req.json()
  return ctx.agent.chatStreamResponse({ messages })
})

// Non-streaming
app.post('/api/chat/sync', async (req, ctx) => {
  const { prompt } = await req.json()
  const text = await ctx.agent.chat(prompt)
  return Response.json({ text })
})
```

### ctx.agent API

| Method | Description |
|-------------|-------------|
| `chat(prompt, opts?)` | Non-streaming, returns text |
| `chatStreamResponse({ messages })` | SSE stream (compatible with `useChat`) |

### Default Model

- LLM: DeepSeek-V4-Flash (via `@ai-sdk/openai` + `baseURL: 'https://api.deepseek.com/v1'`)
- Override with `DEEPSEEK_MODEL` env
- API key via `DEEPSEEK_API_KEY` or `OPENAI_API_KEY` env

### Features

| Feature | Description |
|---------|-------------|
| `knowledge.search` | RAG callback, auto-injected into system prompt |
| `tools` | Tool definitions, auto-loop (maxSteps) |
| `sandbox: true` | Integrates with `ctx.sandbox` |
| `store` | Session persistence (save/load) |
| `agents` | Multi-agent orchestration |

---

## cms

Content management — blog, docs, changelog.

```ts
import { cms, requireRole } from 'weifuwu'

app.use(postgres())
app.use(user())
app.use(cms())

// Public
app.get('/api/posts', async (req, ctx) => {
  return Response.json(await ctx.cms.list({ type: 'post', status: 'published' }))
})
app.get('/api/posts/:slug', async (req, ctx) => {
  const post = await ctx.cms.get(ctx.params.slug)
  if (!post) return new Response('Not found', { status: 404 })
  return Response.json(post)
})

// Admin
app.post('/api/admin/posts', requireRole('admin'), async (req, ctx) => {
  const post = await ctx.cms.create(await req.json())
  return Response.json(post, { status: 201 })
})
app.patch('/api/admin/posts/:id', requireRole('admin'), async (req, ctx) => {
  const post = await ctx.cms.update(ctx.params.id, await req.json())
  if (!post) return new Response('Not found', { status: 404 })
  return Response.json(post)
})
```

### ctx.cms API

| Method | Returns | Description |
|--------|---------|-------------|
| `create(input)` | `Content` | Create (admin) |
| `get(slug)` | `Content \| null` | Get by slug |
| `getById(id)` | `Content \| null` | Get by ID |
| `update(id, input)` | `Content \| null` | Update (admin) |
| `delete(id)` | `boolean` | Delete (admin) |
| `list(opts?)` | `Content[]` | List with cursor |
| `publish(id)` | `Content \| null` | Publish (admin) |
| `unpublish(id)` | `Content \| null` | Unpublish (admin) |
| `listTags()` | `TagWithCount[]` | List tags |
| `createTag(name)` | `Tag` | Create tag |

### Features

- Types: post / page / doc / changelog (any string)
- Status: draft / published / archived
- Slug: auto-generated, unique per type
- Tags: many-to-many, auto-created
- Tree: parent_id for hierarchy
- Auth: non-admin users see published only

---

## base

Dynamic data storage engine — let users define their own data structures (like Airtable).

```ts
import { base } from 'weifuwu'

app.use(postgres())
app.use(user())
app.use(base())

// Define schema
app.post('/api/bases', async (req, ctx) => {
  const b = await ctx.base.create(await req.json())
  return Response.json(b, { status: 201 })
})

// CRUD
app.post('/api/bases/:id/:table', async (req, ctx) => {
  const row = await ctx.base.insert(ctx.params.id, ctx.params.table, await req.json())
  return Response.json(row, { status: 201 })
})

app.get('/api/bases/:id/:table', async (req, ctx) => {
  const url = new URL(req.url)
  return Response.json(await ctx.base.query(ctx.params.id, ctx.params.table, {
    filter: url.searchParams.get('filter') ? JSON.parse(url.searchParams.get('filter')!) : undefined,
    limit: parseInt(url.searchParams.get('limit') || '50'),
  }))
})
```

### ctx.base API

| Method | Returns | Description |
|--------|---------|-------------|
| `create({ name, tables })` | `BaseDef` | Create database |
| `defineTable(baseId, schema)` | `BaseDef` | Add table |
| `updateTable(baseId, name, schema)` | `BaseDef \| null` | Update table |
| `removeTable(baseId, name)` | `BaseDef \| null` | Remove table |
| `insert(baseId, table, data)` | `Row` | Insert row |
| `getRow(baseId, table, id)` | `Row \| null` | Get row |
| `updateRow(baseId, table, id, data)` | `Row \| null` | Update row |
| `deleteRow(baseId, table, id)` | `boolean` | Delete row |
| `query(baseId, table, opts?)` | `Row[]` | Query (filter/sort/limit/offset) |
| `search(baseId, table, field, query)` | `Row[]` | Full-text search |
| `similaritySearch(baseId, table, field, vector)` | `Row[]` | Vector search |
| `list()` / `get(id)` / `getBySlug(slug)` / `delete(id)` | — | Manage databases |

### Architecture

Fixed Slot: a single `base_data` table with ~120 physical columns:

| Type | Count | PG Type |
|------|:-----:|:--------:|
| text001..064 | 64 | TEXT |
| number001..032 | 32 | DOUBLE PRECISION |
| date001..008 | 8 | TIMESTAMPTZ |
| vector001..004 | 4 | VECTOR(1536) |
| search001..004 | 4 | TEXT |
| ext | 1 | JSONB (overflow) |

Field name → physical column mapping stored in `base_column_map`. Fields beyond the physical columns overflow to ext JSONB.

pgvector auto-detected (included in docker image).

---

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

## Middleware

```ts
import { cors, helmet, compress, rateLimit, logger, upload, serveStatic, sandbox } from 'weifuwu'

app.use(cors({ origin: '*' }))
app.use(helmet())
app.use(compress())
app.use(rateLimit({ max: 100 }))
app.use(logger({ format: 'short' }))
app.use(upload())
app.use(serveStatic('./public'))
app.use(sandbox({ baseDir: '/tmp/workspaces' }))
```

---

## Postgres

```ts
import { postgres } from 'weifuwu'

const sql = postgres()
app.use(sql)  // → ctx.sql

await sql.sql`SELECT * FROM users WHERE id = ${id}`
await sql.sql.begin(async (sql) => { /* transaction */ })
```

Reads `DATABASE_URL` env. Supports migrations, transactions, connection pool stats.

---

## Redis

```ts
import { redis } from 'weifuwu'

const r = redis()
app.use(r)  // → ctx.redis
await r.redis.set('key', 'value')
```

Reads `REDIS_URL` env (default: `redis://localhost:6379`).

---

## Queue & Cron

```ts
import { queue } from 'weifuwu'

const q = queue()
app.use(q)  // → ctx.queue

q.process('email', async (job) => { await sendEmail(job.payload) })
q.cron('cleanup', '0 3 * * *', () => cleanup())
await q.add('email', { to: 'user@example.com' })
await q.add('remind', {}, { delay: 60_000 })
q.run()
```

---

## Project Structure

```
src/
├── index.ts             ← Entry, exports all modules
├── types.ts             ← Context, Handler, Middleware types
├── core/                ← serve, router, ws, trace, logger
├── middleware/           ← cors, helmet, compress, rate-limit, upload, static, sandbox
├── user/                ← User system (CRUD, JWT, requireRole)
├── messager/            ← IM + AI conversation layer
├── kb/                  ← RAG knowledge base (chunking, embedding, vector search)
├── ai/                  ← AI Agent (LLM, tools, RAG)
├── cms/                 ← Content management (blog, docs, changelog)
├── base/                ← Dynamic data engine (Fixed Slot)
├── postgres/            ← PostgreSQL client
├── redis/               ← Redis client
├── queue/               ← Job queue + cron
├── graphql.ts           ← GraphQL
├── hub.ts               ← WebSocket hub
├── ui/                  ← ctx.ui.html / ctx.ui.js / ctx.ui.css
├── client/              ← Frontend framework
│   ├── index.ts         ← Entry (exports signal, useForm, wrap, createApp, ...)
│   ├── signal.ts        ← Signal / effect / computed
│   ├── jsx-runtime.ts   ← JSX → DOM / Show / For / wrap / ErrorBoundary / createPortal
│   ├── app.ts           ← createApp / hydrate / middleware chain
│   ├── router.ts        ← Route matching / RouteView / loader
│   ├── types.ts         ← WfuiContext / RouteDef
│   ├── lib/
│   │   └── form.ts     ← useForm
│   ├── middleware/
│   │   ├── api.ts       ← HTTP client
│   │   ├── auth.ts      ← Login / logout / token
│   │   └── ws.ts        ← WebSocket
│   └── components/
│       ├── LoginForm.ts ← Login / register form
│       └── Chat.ts      ← Real-time messaging
└── test/                ← Tests

apps/demo/               ← Full-stack demo
├── src/main.tsx          ← SPA + SSR hydrate demo pages
├── server.ts             ← weifuwu server
├── public/
│   ├── index.html        ← HTML skeleton with placeholders
│   └── style.css         ← Demo styles
└── tsconfig.json

docker-compose.yml       ← postgres (pgvector) + redis
```

---

## Development

```bash
docker compose up -d         # Start postgres + redis
npm run build                # esbuild → dist/
npm run typecheck            # tsc --noEmit
npm test                     # 281 tests
```
