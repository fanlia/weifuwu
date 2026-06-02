# weifuwu

**Web-standard HTTP framework for Node.js.** `(req, ctx) => Response` — no framework-specific objects, just the Web API your browser already speaks.

### Design

weifuwu doesn't invent its own request/response abstraction. `Request` and `Response` are the same objects you use in `fetch()` — what you learn in the browser applies directly on the server. `ctx` is the only framework object, and it only carries what the router parsed for you (`params`, `query`).

Everything follows the same `(req, ctx) => Response` contract. The Router handles HTTP routing and WebSocket. All other features — auth, validation, database, GraphQL, AI, workflow — are standalone modules you import and mount with `app.use()`.

## Features

- **Web Standard** — `Request` / `Response` / `ReadableStream`, zero abstractions
- **Trie router** — static > param > wildcard, sub-router mounting, path params
- **Middleware** — global, path-scoped, route-level — onion model, short-circuit
- **Middleware modules** — `auth()`, `cors()`, `logger()`, `rateLimit()`, `compress()`, `validate()`, `upload()`
- **React SSR + Hydration** — `tsx({ dir })` — page.tsx / load.ts / layout.tsx / route.ts / not-found.tsx
- **WebSocket** — `router.ws()` with upgrade middleware (auth before connect)
- **GraphQL** — `graphql(handler)` sub-Router with GraphiQL IDE
- **AI streaming** — `ai(handler)` sub-Router via Vercel AI SDK
- **AI workflows** — `workflow(handler)` sub-Router — intent-to-execution pipelines with `tool()` + SSE
- **AI Agent** — `agent()` — server-side AI agents with chat/workflow/knowledge types, OpenAI-compatible, Ollama-ready
- **Messaging** — `messager()` — real-time chat with channels, WebSocket, agent routing, webhook support
- **Tenant BaaS** — `tenant()` — multi-tenant dynamic tables, auto REST + GraphQL, row-level isolation, pgvector/HNSW
- **Redis** — `redis()` — ioredis client, `ctx.redis`, middleware
- **Queue** — `queue()` — Redis-backed job queue with immediate, delayed, and cron scheduling
- **Auth** — `user()` — register/login/JWT + OAuth2 Server (authorization code + PKCE + client_credentials)
- **Static files** — `serveStatic()` with ETag, 304, MIME, directory index
- **Cookie** — `getCookies()`, `setCookie()`, `deleteCookie()` — immutable
- **Error handling** — global `onError()`
- **Deploy** — `deploy()` — self-hosted PaaS: multi-app reverse proxy, subdomain routing, zero-downtime updates, auto SSL, Git-based deployment
- **Zero build** — native TypeScript in Node.js v24+
- **Zero deps** (core) — only `node:http` and `node:stream`

## Quick start

### Hello World

```ts
import { serve } from 'weifuwu'
serve((req, ctx) => new Response('Hello, World!'), { port: 3000 })
```

### React + Tailwind

```bash
npm install weifuwu
mkdir -p ui/pages
```

```ts
// app.ts
import { serve, Router } from 'weifuwu'

const app = new Router()
app.use('/', await tsx({ dir: './ui/' }))
serve(app.handler(), { port: 3000, websocket: app.websocketHandler() })
```

```tsx
// ui/pages/page.tsx
export default function Home() {
  return <h1 className="text-3xl font-bold text-blue-600">Hello</h1>
}
```

```bash
node app.ts
```

Open http://localhost:3000 — Tailwind CSS is compiled automatically, pages hot-reload on save.

## Router

```ts
import { serve, Router } from 'weifuwu'

const app = new Router()
  .use((req, ctx, next) => {
    console.log(`${req.method} ${new URL(req.url).pathname}`)
    return next(req, ctx)
  })
  .get('/hello/:name', (req, ctx) =>
    Response.json({ message: `Hello, ${ctx.params.name}!` }),
  )
  .post('/data', async (req, ctx) => {
    const body = await req.json()
    return Response.json(body, { status: 201 })
  })

serve(app.handler(), { port: 3000 })
```

## Built-in middleware

### Auth

```ts
import { auth } from 'weifuwu'

// Static bearer token
app.use(auth({ token: 'sk-123' }))

// Custom verify (JWT, DB, etc.) — return object to set ctx.user
app.use(auth({
  verify: async (token) => {
    const user = await db.findUserByToken(token)
    return user ? { sub: user.id, role: user.role } : null
  },
}))

// Proxy validation to external auth service
app.get('/protected', auth({ proxy: 'http://auth:3000/validate' }), handler)

// Custom header
app.use(auth({ header: 'X-API-Key', token: 'my-key' }))
```

### CORS

```ts
import { cors } from 'weifuwu'

app.use(cors())                                          // allow all
app.use(cors({ origin: ['https://example.com'] }))       // whitelist
app.use(cors({ origin: (o) => o.endsWith('.trusted.com') ? o : false }))
app.use(cors({ credentials: true, maxAge: 3600 }))
```

### Logger

```ts
import { logger } from 'weifuwu'

app.use(logger())                           // GET /hello 200 5ms
app.use(logger({ format: 'combined' }))     // with query params
```

### Rate limit

```ts
import { rateLimit } from 'weifuwu'

app.use(rateLimit({ max: 100, window: 60_000 }))          // 100 req/min
app.get('/api', rateLimit({ max: 10 }), handler)          // per-route

// Custom key (by API key, user ID, etc.)
app.use(rateLimit({
  max: 1000,
  key: (req) => req.headers.get('x-api-key') ?? 'anonymous',
}))
```

### Compression

```ts
import { compress } from 'weifuwu'

app.use(compress())                       // brotli > gzip > deflate
app.use(compress({ threshold: 2048 }))    // only compress > 2KB
```

## Validation

```ts
import { z } from 'zod'
import { validate } from 'weifuwu'

const CreateUser = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

router.post('/users',
  validate({ body: CreateUser }),
  (req, ctx) => {
    // ctx.parsed.body — typed & validated
  },
)
```

## File upload

```ts
import { upload } from 'weifuwu'

router.post('/upload',
  upload({ dir: './uploads', maxFileSize: 10_485_760 }),
  (req, ctx) => {
    // ctx.parsed.files.avatar  → { name, type, size, path }
    // ctx.parsed.fields.title  → 'hello'
  },
)
```

## Cookie

```ts
import { getCookies, setCookie, deleteCookie } from 'weifuwu'

// Read
const cookies = getCookies(req)        // { session: 'abc' }

// Set (immutable — returns new Response)
let res = new Response('ok')
res = setCookie(res, 'session', 'token', { httpOnly: true, secure: true, maxAge: 3600 })

// Delete
res = deleteCookie(res, 'session')
```

## Static files

```ts
import { serveStatic } from 'weifuwu'

router.get('/static/*', serveStatic('./public'))
```

Features: MIME type detection (20+ types), ETag + If-None-Match (304), directory index (index.html), path traversal protection, Cache-Control.

## PostgreSQL

Built-in PostgreSQL client — connection management, type-safe DDL, transactions, and module lifecycle.

```ts
import { serve, Router, postgres } from 'weifuwu'

const app = new Router()
const pg = postgres()          // reads DATABASE_URL
app.use(pg)                     // injects ctx.sql into handlers
```

### Type-safe DDL with schema builder

Define tables declaratively with type inference — no raw SQL for common operations, no Zod needed:

```ts
import { pgTable, serial, uuid, text, integer, boolean, timestamptz, jsonb, sql } from 'weifuwu'

const users = pgTable('_users', {
  id:        serial('id').primaryKey(),
  name:      text('name').notNull(),
  email:     text('email').unique().notNull(),
  age:       integer('age'),
  active:    boolean('active').default(true),
  createdAt: timestamptz('created_at').default(sql`NOW()`),
  metadata:  jsonb<{ role: string }>('metadata'),
})
```

Supports 10 column types:
| Builder | DDL | TS Type |
|---------|-----|---------|
| `serial()` | `SERIAL` | `number` |
| `uuid()` | `UUID` | `string` |
| `text()` | `TEXT` | `string` |
| `integer()` | `INTEGER` | `number` |
| `boolean()` | `BOOLEAN` | `boolean` |
| `timestamptz()` | `TIMESTAMPTZ` | `string` |
| `jsonb<T>()` | `JSONB` | `T` |
| `textArray()` | `TEXT[]` | `string[]` |
| `vector(name, dims)` | `vector(N)` | `number[]` |

Column constraints chainable: `.primaryKey()`, `.notNull()`, `.nullable()`, `.default(value | sql\`...\`)`, `.unique()`, `.references(table, column?, onDelete?)`.

### DDL execution

```ts
await users.create()                         // CREATE TABLE IF NOT EXISTS
await users.createIndex('email')             // CREATE INDEX
await users.createUniqueIndex('slug')        // CREATE UNIQUE INDEX
await users.createIndex('created_at', { desc: true })
await users.createIndex(['a', 'b'])          // multi-column
await users.createIndex('embedding', {       // pgvector HNSW
  type: 'hnsw', operator: 'vector_cosine_ops',
})
await users.drop({ cascade: true })
```

### Complex queries use raw SQL

```ts
app.get('/users/stats', async (req, ctx) => {
  const rows = await ctx.sql`
    SELECT u.*, count(p.id) as posts
    FROM ${users} u LEFT JOIN posts p ON p.user_id = u.id
    GROUP BY u.id
  `
  return Response.json(rows)
})
```

### Transactions

```ts
const result = await pg.transaction(async (tx) => {
  const [user] = await tx`INSERT INTO "_users" (...) VALUES (...) RETURNING *`
  const [wallet] = await tx`INSERT INTO "_wallets" ("user_id") VALUES (${user.id}) RETURNING *`
  return { user, wallet }
})
```

### Connection lifecycle

```ts
const pg = postgres()                          // reads DATABASE_URL
const pg = postgres('postgres://...')          // explicit connection
const pg = postgres({
  connection: 'postgres://...',
  max: 10,                                     // pool size
  ssl: { rejectUnauthorized: false },          // SSL options
  idle_timeout: 30,                            // idle timeout (s)
  connect_timeout: 10,                         // connection timeout (s)
  closeTimeout: 5,                             // close grace period (s)
  signal: ac.signal,                           // abort → sql.end()
})
await pg.close()
```

### Module base class

Every database module (`opencode`, `messager`, `tenant`, `agent`, `user`) extends `PgModule`:

```ts
import { PgModule } from 'weifuwu'

class MyModule extends PgModule {
  constructor(pg: PostgresClient) {
    super(pg)   // sets this.sql = pg.sql
  }
  async migrate() { /* override */ }
  // close() inherited — calls pg.close() automatically
}
```

## Opencode

AI programming assistant — chat with LLM agents that have access to filesystem tools, skills, and isolated session workspaces.

```ts
import { serve, Router, postgres, opencode } from 'weifuwu'

const app = new Router()
const pg = postgres()
const oc = await opencode({ pg, permissions: { ... } })

await oc.migrate()
app.use('/opencode', await oc.router())
app.ws('/opencode', oc.wsHandler())

serve(app.handler(), { port: 3000, websocket: app.websocketHandler() })
```

### Session-isolated workspaces

Each session gets its own sandbox directory — tools operate within it, files cannot escape:

```
cwd/.sessions/opencode/1/    ← session 1's workspace
cwd/.sessions/opencode/2/    ← session 2's workspace
cwd/.sessions/chat/3/        ← different mount point
```

Workspaces are computed from `cwd { ctx.mountPath } { sessionId }`. The system prompt shows the session's workspace so the LLM knows where it is.

### Tools

| Tool | Description |
|------|-------------|
| `bash` | Execute shell commands in the workspace |
| `read` | Read files with offset/limit |
| `write` | Create or overwrite files |
| `edit` | Exact string replacements |
| `grep` | Regex content search |
| `glob` | Glob pattern file search |
| `web` | Fetch URL content |
| `question` | Ask the user for input |
| `skill` | Load a skill on demand |

### Skills

Skills are discovered from filesystem and loaded on demand via the `skill` tool — no system prompt bloat:

- Project: `.opencode/skills/{name}/SKILL.md`
- Global: `~/.config/opencode/skills/{name}/SKILL.md`
- Also reads: `.claude/skills/`, `.agents/skills/` (project + global)

```ts
const oc = await opencode({
  pg,
  skills: [{ name: 'git', description: 'Git workflow', content: '...' }],
})
```

### Permissions

Control tool access per conversation:

```ts
const oc = await opencode({
  pg,
  permissions: {
    bash: { allow: true },
    read: { allow: true },
    write: { allow: false },
    edit: { allow: false },
    skill: { '*': { allow: true }, 'internal-*': { allow: false } },
  },
})
```

### Workspace isolation

```ts
const oc = await opencode({ pg, permissions })
// All sessions inherit the instance's workspace (default: process.cwd())
// Sessions cannot override their workspace
// Different mount points = different opencode() instances = isolated workspaces
```

```ts
import { serve, Router, postgres, user } from 'weifuwu'

const app = new Router()
const pg = postgres()
await pg.migrate()

const auth = user({ pg, jwtSecret: process.env.JWT_SECRET! })

// POST /auth/register  { email, password, name }
// POST /auth/login     { email, password }
// GET  /auth/oauth/authorize?client_id=...&redirect_uri=...&response_type=code
// POST /auth/oauth/consent
// POST /auth/oauth/token  (grant_type=authorization_code|client_credentials)
app.use('/auth', auth.router())

// Protected routes — verifies JWT, sets ctx.user
app.get('/me', auth.middleware(), async (req, ctx) => {
  return Response.json(ctx.user)
  // { id, email, name, role }
})
```

Password hashing uses `crypto.scryptSync` + `timingSafeEqual` (Node.js built-in, zero deps). JWT tokens use the `jsonwebtoken` package. The users table (`_users` by default) is auto-created on first `migrate()`.

### OAuth2 Server

Enable OAuth2 Server to let third-party apps (SPA, mobile, microservices) authenticate users through your app.

```ts
const auth = user({
  pg,
  jwtSecret: process.env.JWT_SECRET!,
  oauth2: { server: true },
})

await auth.migrate()  // creates _users + _oauth2_clients + _oauth2_codes + _oauth2_tokens

// Register a client app (programmatic — CLI, admin UI, seed script)
const client = await auth.registerClient({
  name: 'My SPA',
  redirectUris: ['https://myapp.com/callback'],
})
// → { clientId, clientSecret, name, redirectUris }

// Use auth middleware to protect routes — OAuth2 JWT tokens work seamlessly
app.get('/api/data', auth.middleware(), handler)
```

#### Supported Grant Types

| Grant | Use Case | PKCE |
|-------|----------|------|
| `authorization_code` (with client_secret) | Server-side apps | Optional |
| `authorization_code` (with `code_challenge`/`code_verifier`) | SPA / Mobile apps | Required |
| `client_credentials` | Machine-to-machine | — |

#### Flow (Authorization Code + PKCE)

```
1. 第三方 App 引导用户:
    GET /oauth/authorize?client_id=xxx&redirect_uri=https://app.com/cb
                       &response_type=code&code_challenge=S256&state=yyy

2. 用户未登录 → 302 到 /login?redirect=... → 登录后自动回到授权页

3. 用户确认授权 → POST /oauth/consent { approve: true, client_id, ... }
   302 redirect_uri?code=xxx&state=yyy

4. 第三方 App POST /oauth/token
   { grant_type: authorization_code, code, client_id, client_secret,
     redirect_uri, code_verifier }
   → { access_token, token_type: "Bearer", expires_in, refresh_token }

5. access_token 是标准 JWT，auth.middleware() 和 auth.verify() 直接可用
```

#### Client Management

```ts
const client  = await auth.registerClient({ name, redirectUris })
const found   = await auth.getClient(client.clientId)
await auth.revokeClient(client.clientId)
```

#### Using OAuth2 Tokens with the Built-in Auth Middleware

OAuth2 Server 签发的 `access_token` 与密码登录的 JWT 使用同一 `jwtSecret`，payload 向下兼容（`sub`、`email`、`role`），所以 `auth()` 无需任何修改即可验证 OAuth2 签发的 token：

```ts
import { auth } from 'weifuwu'

// 同一个 auth() 中间件同时支持密码登录 JWT 和 OAuth2 JWT
app.get('/api', auth({ verify: (token) => auth.verify(token) }), handler)
```

For `client_credentials` tokens (machine-to-machine), `verify()` returns `null` since no user is associated.

## Tenant BaaS

Built-in multi-tenant backend-as-a-service — define tables at runtime via API, get RESTful CRUD + GraphQL automatically, with row-level tenant isolation.

```ts
import { serve, Router, postgres, user, tenant } from 'weifuwu'

const pg = postgres()
const u = user({ pg, jwtSecret: process.env.JWT_SECRET! })
const t = tenant({ pg, usersTable: '_users' })

await pg.migrate()
await u.migrate()
await t.migrate()           // creates _tenants, _tenant_members, _user_tables

const app = new Router()
app.use('/auth', u.router())
app.use('/api', u.middleware())     // → ctx.user
app.use('/api', t.middleware())     // → ctx.tenant
app.use('/api', t.router())        // → management + data CRUD
app.use('/graphql', t.graphql())   // → dynamic GraphQL
```

### System tables

| Table | Purpose |
|-------|---------|
| `_tenants` | Tenant records (`id TEXT PK DEFAULT gen_random_uuid()`, `name`, `created_at`) |
| `_tenant_members` | User-tenant membership (`tenant_id`, `user_id`, `role`) |
| `_user_tables` | Dynamic table definitions (`tenant_id`, `slug`, `fields JSONB`) |

### Dynamic table API

Create a table at runtime:

```json
POST /api/tables
{
  "slug": "articles",
  "fields": [
    { "name": "title", "type": "string", "required": true },
    { "name": "content", "type": "text" },
    { "name": "status", "type": "enum", "options": ["draft", "published"], "default": "draft" },
    { "name": "views", "type": "integer", "default": 0 },
    { "name": "embedding", "type": "vector", "dimensions": 1536, "index": "hnsw" }
  ]
}
```

→ Creates a PostgreSQL table with `id SERIAL PK`, `tenant_id TEXT NOT NULL`, and the specified columns, plus indexes. The table name is internally scoped to the tenant.

### Field types

| type | PostgreSQL | Index support |
|------|-----------|---------------|
| `string` | `TEXT` | `true`, `unique` |
| `integer` | `INTEGER` | `true`, `desc`, `unique` |
| `float` | `DOUBLE PRECISION` | `true`, `desc` |
| `boolean` | `BOOLEAN` | `true` |
| `text` | `TEXT` | `true` |
| `datetime` | `TIMESTAMPTZ` | `true`, `desc` |
| `date` | `DATE` | `true`, `desc` |
| `enum` | `TEXT` (with validation) | `true` |
| `json` | `JSONB` | `gin` |
| `vector` | `vector(n)` (pgvector) | `hnsw` (HNSW, vector_cosine_ops) |

### Relationships

Declare a foreign key via the `relation` field:

```json
{ "name": "article_id", "type": "integer", "relation": { "table": "articles", "onDelete": "cascade" } }
```

Supported relationship patterns:

| Pattern | Detection | REST | GraphQL |
|---------|-----------|------|---------|
| **belongs_to** | Field with `relation` | — | `comment.article` resolver |
| **has_many** | Another table has a relation pointing here | `GET /api/articles/:id/comments` | `article.comments` resolver |
| **M2M** | Junction table with exactly two relation fields | `GET /api/articles/:id/tags` (bypasses junction) | `article.tags` / `tag.articles` resolver |
| **Self-ref** | Relation field pointing to same table | — | With depth control |

### RESTful API

All routes require `ctx.tenant` (set by `t.middleware()`). All queries automatically filter by `tenant_id`.

| Route | Method | Description |
|-------|--------|-------------|
| `/sys/tenants` | POST | Create tenant, caller becomes admin |
| `/sys/tenants` | GET | List user's tenants |
| `/sys/tenants/invite` | POST | Invite user by email (admin) |
| `/sys/tenants/members/:userId` | DELETE | Remove member (admin) |
| `/sys/tables` | POST/GET | Create / list dynamic tables |
| `/sys/tables/:slug` | GET/PATCH/DELETE | Get schema / add fields / drop table |
| `/:slug` | GET | List rows (limit, offset, sort) |
| `/:slug` | POST | Create row |
| `/:slug/:id` | GET/PATCH/DELETE | Get / update / delete row |
| `/:slug/:id/:_nested` | GET | List related rows (has_many / M2M) |
| `/:slug/:id/:_nested` | POST | Create related row (auto-fills relation field) |

### Vector search

```http
GET /api/articles?search_vector=[0.1,0.2,...]&search_field=embedding&search_limit=10
```

Returns rows ordered by cosine distance (`<=>`), includes `_distance` field. Supports `l2` (`<->`) and `ip` (`<#>`):

```http
GET /api/articles?search_vector=[...]&search_field=embedding&search_distance=l2
```

### GraphQL

Dynamic GraphQL schema generated per-request based on the authenticated tenant's tables:

```graphql
type Article {
  id: ID!
  title: String!
  content: String
  status: String
  comments(limit: Int, offset: Int): [Comment!]!
}

type Query {
  articles(limit: Int, offset: Int): [Article!]!
  getArticle(id: ID!): Article
}

type Mutation {
  createArticle(data: CreateArticleInput!): Article!
  updateArticle(id: ID!, data: PatchArticleInput!): Article!
  deleteArticle(id: ID!): Boolean!
}
```

Built with `graphql-js` native constructors (`GraphQLObjectType`), no SDL generation, no `makeExecutableSchema`.

### Middleware

`t.middleware()` extracts the tenant context:

1. Requires `ctx.user` (from `u.middleware()`)
2. Looks up user's tenant memberships
3. Single tenant → automatically set `ctx.tenant`
4. Multiple tenants → require `X-Tenant-ID` header, return 300 with tenant list if missing
5. No tenants → 403

### Tenant lifecycle

```ts
const t = tenant({ pg, usersTable: '_users' })

// Create a tenant — the caller becomes admin
const tenant = await (await fetch('http://localhost/api/sys/tenants', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer <jwt>' },
  body: JSON.stringify({ name: 'Acme Corp' }),
})).json()
// → { id: "uuid", name: "Acme Corp", created_at: "..." }

// Invite a member
await fetch('http://localhost/api/sys/tenants/invite', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer <jwt>' },
  body: JSON.stringify({ email: 'colleague@acme.com', role: 'member' }),
})
```

## AI Agent

Server-side AI agents with OpenAI-compatible API. Built-in chat, workflow (tool-calling), and knowledge (RAG) types. Works out of the box with Ollama or any OpenAI-compatible provider.

```ts
import { agent } from 'weifuwu'

const agents = agent({ pg })

await agents.migrate()
app.use('/api', agents.router())
```

| Type | Description | Execution |
|------|-------------|-----------|
| `chat` | Pure conversation | `streamText()` / `generateText()` |
| `workflow` | Tool-calling agent | `streamText({ tools })` |

### Knowledge (RAG)

Add documents to any agent — `searchKnowledge` tool auto-injected:

```ts
await agents.addKnowledge(agentId, 'Title', 'Document content...')
// The agent automatically calls searchKnowledge when answering
```

### Streaming

```http
POST /agents/:id/run  { input: "hello", stream: true }
→ event-stream (fullStream SSE: text-delta, tool-call, tool-result, finish)
```

### Programmatic API

```ts
const result = await agents.run(agentId, { input: 'hello', stream: false })
// { output: "Hello!", elapsed: 1234 }
```

## Messager

Real-time chat with channels, WebSocket, and agent routing.

```ts
import { messager, agent } from 'weifuwu'

const agents = agent({ pg })
const msg = messager({ pg, agents })

await msg.migrate()
app.use('/api', msg.router())
app.ws('/ws', u.middleware(), msg.wsHandler())
```

### Channels

```http
POST   /channels            name, type (channel|dm), members
GET    /channels
GET    /channels/:id
```

### Messages

```http
GET  /channels/:id/messages     ?limit=50&before={id}
POST /channels/:id/messages     content, sender_type, type
POST /channels/:id/read         last_message_id
```

### WebSocket

```json
{ "type": "message",  "channel_id": 1, "content": "Hi" }
{ "type": "typing",   "channel_id": 1, "is_typing": true }
{ "type": "read",     "channel_id": 1, "last_message_id": 42 }
```

### Programmatic send

```ts
await msg.send(channelId, 'System message', { sender_type: 'system' })
```

## WebSocket
    message(ws, ctx, data) {
      ws.send(`echo: ${data}`)
    },
    close(ws, ctx) {
      console.log('disconnected')
    },
  })

serve(app.handler(), { port: 3000, websocket: app.websocketHandler() })
```

Middleware runs **before** WebSocket upgrade — you can reject connections with HTTP status codes:

```ts
app.ws('/secure',
  (req, _ctx, next) => {
    const auth = req.headers.get('Authorization')
    if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return next(req, _ctx)
  },
  { open(ws) { ws.send('authorized') } },
)
```

## GraphQL

GraphQL endpoint with GraphiQL IDE. Mount as a sub-Router:

```ts
import { serve, Router, graphql } from 'weifuwu'

const app = new Router()
app.use('/graphql', graphql(() => ({
  schema: `
    type Query { hello: String }
    type Mutation { setMessage(msg: String!): String }
  `,
  resolvers: {
    Query: { hello: () => 'world' },
    Mutation: { setMessage: (_, { msg }) => msg },
  },
  graphiql: true,
})))

serve(app.handler(), { port: 3000 })
```

The handler receives `(req, ctx)` so you can customize the schema based on the request.

## AI streaming

Server-sent event streaming via the Vercel AI SDK:

```ts
import { serve, Router, ai } from 'weifuwu'
import { openai } from '@ai-sdk/openai'

const app = new Router()
app.use('/chat', ai(async (req, ctx) => {
  const { messages } = await req.json()
  return { model: openai('gpt-4o'), messages }
}))

serve(app.handler(), { port: 3000 })
```

## Workflow

Define business capabilities as **Tools** (`tool()`), then chain them into **workflows** for AI-driven multi-step execution. Works with or without an LLM — hand-write the workflow JSON or let AI generate it from a goal.

```ts
import { Router, tool, workflow } from 'weifuwu'
import { z } from 'zod'

// 1. Define tools (business capabilities)
const tools = {
  queryUser: tool({
    description: 'Query user info, returns email, name',
    inputSchema: z.object({ userId: z.string() }),
    execute: async ({ userId }) => ({ id: userId, email: 'user@test.com', name: 'Test' }),
  }),
  sendEmail: tool({
    description: 'Send an email',
    inputSchema: z.object({ to: z.string(), subject: z.string() }),
    execute: async ({ to, subject }) => ({ sent: true }),
  }),
}

// 2. Mount workflow sub-router
const app = new Router()
app.use('/agent', workflow(() => ({ tools })))
// POST /agent  { nodes: [...] }  →  200 { workflow: {...}, result: ... }

// With SSE streaming:
app.use('/agent-stream', workflow(() => ({ tools, stream: true })))
// POST /agent-stream  { nodes: [...] }
// → 200 { workflowId: "xxx", eventsUrl: "/xxx/events" }
// GET  /agent-stream/:workflowId/events
// → SSE: workflow-start → node-start → node-end → complete

// With LLM model (generates workflow from goal):
app.use('/agent-llm', workflow(() => ({
  tools,
  model: openai('gpt-4o'),
})))
// POST /agent-llm  { goal: "给用户123发欢迎邮件" }
// ← LLM generates → executes → returns result
```

### Tool

```ts
import { tool } from 'weifuwu'
import { z } from 'zod'

const myTool = tool({
  description: '做什么的，返回什么',
  inputSchema: z.object({ key: z.string() }),
  execute: async (input, ctx) => {
    return { result: input.key }
  },
})
```

`ctx.onStream` 用于流式推送（如 LLM token 输出）：

```ts
const llmTool = tool({
  description: '生成文本',
  inputSchema: z.object({ prompt: z.string() }),
  execute: async (input, ctx) => {
    const stream = await openai.chat.completions.create({ ... })
    let full = ''
    for await (const chunk of stream) {
      full += chunk.choices[0]?.delta?.content || ''
      ctx.onStream?.({ type: 'llm-stream', chunk, accumulated: full })
    }
    return { text: full }
  },
})
```

### Core Nodes

7 built-in node types:

| Node | Purpose | Input |
|------|---------|-------|
| `call` | Call a tool or sub-workflow | `{ tool: "name", args: {...} }` or `{ function: "name", args: {...} }` |
| `set` | Declare or assign a variable | `{ name: "x", value: 42 }` |
| `get` | Read a variable | `{ name: "x" }` |
| `eval` | Evaluate an expression | `{ expression: "$var.x + 1" }` |
| `if` | Conditional branch | `{ conditions: [{ test: ..., body: [nodes] }] }` |
| `while` | Loop | `{ condition: "$var.i < 5" }, body: [nodes]` |
| `http` | HTTP request | `{ url: "https://...", method: "GET" }` |

### Variable Reference Syntax

| Pattern | Meaning | Example |
|---------|---------|---------|
| `$var.x` | Variable `x` | `$var.counter` |
| `$nodes.u.output` | Full output of node `u` | `$nodes.u.output` |
| `$nodes.u.output.field` | Specific field | `$nodes.u.output.email` |
| `$input.userId` | Workflow input param | `$input.userId` |
| `42`, `true`, `"hello"` | Literal values | Passed as-is |

### Engine API

For programmatic use outside of Router:

```ts
import { createWorkflowEngine, createSSEManager } from 'weifuwu'

const sse = createSSEManager()
const engine = createWorkflowEngine({ tools, sseManager: sse })

// Sync execution
const result = await engine.execute({ nodes: [...] })

// Async execution with SSE
engine.runAsync('wf-1', { nodes: [...] })
```

### SSE Events

```ts
const sse = createSSEManager()
const stream = sse.createStream('wf-1')

const reader = stream.getReader()
//   event: workflow-start   — { workflowId, goal }
//   event: node-start       — { nodeId, tool, input }
//   event: node-end         — { nodeId, output }
//   event: llm-stream       — { nodeId, chunk, accumulated }
//   event: complete         — { result, duration }
//   event: error            — { error }
```

### Sub-workflows

Define reusable sub-workflows in the `functions` field:

```json
{
  "functions": {
    "double": {
      "inputSchema": { "type": "object", "properties": { "x": { "type": "number" } } },
      "workflow": {
        "nodes": [
          { "id": "calc", "tool": "eval", "input": { "expression": "$input.x * 2" } }
        ]
      }
    }
  },
  "nodes": [
    { "id": "call_double", "tool": "call", "input": { "function": "double", "args": { "x": 21 } } }
  ]
}
```

## React pages with tsx()

```ts
import { serve, Router } from 'weifuwu'
import { tsx } from 'weifuwu/tsx'

const app = new Router()
app.use('/', await tsx({ dir: './ui/' }))

serve(app.handler(), { port: 3000, websocket: app.websocketHandler() })
```

### Directory structure

```
ui/
├── pages/              ← 页面文件
│   ├── page.tsx        → GET /           (React component, default export)
│   ├── layout.tsx      → root layout     (HTML shell, receives req/ctx, NOT hydrated)
│   ├── not-found.tsx   → 404 error page  (rendered for unmatched routes, wrapped in layout)
│   ├── about/page.tsx  → GET /about
│   ├── blog/[slug]/
│   │   ├── page.tsx    → GET /blog/:slug
│   │   ├── load.ts     → data fetching   (server-only, default export)
│   │   └── route.ts    → POST /blog/:slug (API, named exports POST/PUT/DELETE/...)
│   ├── blog/layout.tsx → /blog/* layout  (UI structure, receives children, hydrated)
│   └── api/search/
│       └── route.ts    → GET /api/search (standalone API, no page.tsx needed)
└── components/         ← 组件文件（会被热更自动感知）
    └── button.tsx
```

### Development mode

tsx() runs in development mode automatically when `NODE_ENV !== 'production'`:

- **File watching** — chokidar watches the `dir` directory for `.tsx`/`.ts` changes
  - Page files in `pages/` → single-file recompilation + registry update
  - Component files in `components/` → full rebuild of all pages
  - New files are detected automatically
- **Live reload** — Compiled via esbuild `write: false` + `vm.Script.runInContext` (no disk writes, no `node --watch` conflict)
- **WebSocket auto-refresh** — `/__weifuwu/livereload` endpoint pushes reload signals; browser refreshes automatically
- **`node --watch` compatible** — External files (`app.ts`, `middleware/`) handled by `--watch` restart; `ui/` changes handled by tsx() without conflict

```bash
node app.ts                # development (auto-reload + live refresh)
NODE_ENV=production node app.ts   # production
```

### Tailwind CSS

tsx() includes built-in Tailwind CSS v4 support. If an `app.css` file exists in the `dir` directory, it is compiled automatically through PostCSS + `@tailwindcss/postcss`. If no `app.css` is found, one is created automatically:

```css
@import "tailwindcss";
```

Write `className` directly in your components — no CLI, no configuration:

```tsx
export default function Home() {
  return <h1 className="text-3xl font-bold text-blue-600">Hello</h1>
}
```

In development mode, Tailwind is reprocessed whenever a `.tsx` file changes (new class names are picked up automatically).

### `@` alias

If your project has a `tsconfig.json` or `jsconfig.json` with `compilerOptions.paths`, tsx() reads it automatically and passes aliases to all esbuild builds (SSR compilation, hydration bundles, and hot reload):

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./ui/*"]
    }
  }
}
```

This enables imports like `@/components/button` or `@/lib/utils` in both server-rendered and client-hydrated code.

### shadcn/ui

tsx() works with [shadcn/ui](https://ui.shadcn.com) out of the box. The `@` alias and Tailwind CSS are handled automatically.

```bash
# 1. Install shadcn CLI and init (select "other" framework)
npx shadcn@latest init

# 2. When prompted, configure:
#    - Style:            your preference
#    - Base color:       your preference
#    - CSS file path:    ui/app.css
#    - Import alias:     @/  →  ./ui/
#    - React hooks:      yes
```

```json
// tsconfig.json (generated by shadcn init)
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./ui/*"]
    }
  }
}
```

Add components:

```bash
npx shadcn@latest add button card dialog
```

Use them in your pages:

```tsx
// ui/pages/page.tsx
import { Button } from '@/components/ui/button'

export default function Home() {
  return <Button variant="outline">Click me</Button>
}
```

```bash
node app.ts
```

### Backward compatibility

`tsx({ dir: './pages/' })` still works. When there is no `pages/` subdirectory under `dir`, the `dir` itself is used as the pages directory.

### page.tsx — page component

```tsx
export default function Page({ params, query }: {
  params: { slug: string }
  query: Record<string, string>
}) {
  return <article><h1>{params.slug}</h1></article>
}
```

### load.ts — data fetching (server-only)

```ts
export default async function load({ params, query }: {
  params: Record<string, string>
  query: Record<string, string>
}) {
  const data = await db.query(params.slug)
  return { data }   // merged into props passed to page.tsx
}
```

### layout.tsx

**Root layout** (`pages/layout.tsx`) — receives `{ children, req, ctx }`:

```tsx
export default function RootLayout({ children, req, ctx }: {
  children: React.ReactNode
  req: Request
  ctx: Context
}) {
  return (
    <html>
      <head><title>App</title></head>
      <body><div id="__weifuwu_root">{children}</div></body>
    </html>
  )
}
```

**Nested layouts** (`pages/blog/layout.tsx`) — receives only `{ children }`.

### route.ts — API (co-located with page)

```ts
export const POST: Handler = async (req, ctx) => {
  const body = await req.json()
  return Response.json({ ...body, slug: ctx.params.slug })
}
```

### not-found.tsx — 404 page

```tsx
export default function NotFound() {
  return <h1 class="text-4xl">404 – Not Found</h1>
}
```

## Usage within a full app

```ts
import { serve, Router, ai, graphql, workflow } from 'weifuwu'
import { tsx } from 'weifuwu/tsx'

const app = new Router()
app.use('/', await tsx({ dir: './pages/' }))
app.use('/chat', ai(async (req) => ({ model: openai('gpt-4o'), messages: (await req.json()).messages })))
app.use('/graphql', graphql(() => ({ schema: `type Query { hello: String }`, resolvers: { Query: { hello: () => 'world' } } })))
app.use('/agent', workflow(() => ({ tools: myTools, stream: true })))
app.ws('/chat', { message(ws, _, data) { ws.send(data) } })

serve(app.handler(), { websocket: app.websocketHandler() })
```

```bash
node app.ts                # development (auto-reload + live refresh)
NODE_ENV=production node app.ts   # production
```

No build step, no configuration file — just Node.js.

## Graceful shutdown

```ts
import { serve } from 'weifuwu'
import type { Server } from 'weifuwu'

const ac = new AbortController()
let server: Server

process.on('SIGTERM', () => {
  ac.abort()
  server.stop()
})

server = serve((req, ctx) => new Response('Hello'), {
  port: 3000,
  signal: ac.signal,
})
await server.ready
```

### Using with WebSocket

```ts
const app = new Router().ws('/chat', { … })
const server = serve(app.handler(), {
  port: 3000,
  signal: ac.signal,
  websocket: app.websocketHandler(),
})
```

## Error handling

```ts
const app = new Router()
  .onError((err, req, ctx) =>
    Response.json({ error: err.message }, { status: 500 }),
  )
  .get('/crash', () => { throw new Error('boom') })
```

## Deploy

See [deploy.md](./deploy.md) for complete documentation — VPS setup, subdomain routing, blue-green zero-downtime, WebSocket bridge, Git webhook, auto SSL, and management API.

Quick start on a fresh VPS:

```bash
# 1. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs git

# 2. Create deploy project
mkdir -p /opt/deploy && cd /opt/deploy
npm init -y && npm install weifuwu

# 3. Write deploy.ts
cat > deploy.ts << 'EOF'
import { deploy, defineConfig } from 'weifuwu'
await deploy(defineConfig({
  domain: 'example.com',
  deployToken: process.env.DEPLOY_TOKEN,
  apps: {
    blog: {
      repo: 'https://github.com/me/my-blog.git',
      subdomain: 'blog',
      entry: 'app.ts',
      port: 3001,
    },
  },
}))
EOF

# 4. Run
DEPLOY_TOKEN='my-secret' node deploy.ts
```

## API

### `serve(handler, options?)`

| Option | Default | Description |
|--------|---------|-------------|
| `port` | `0` | Listen port (`0` = random) |
| `hostname` | `'0.0.0.0'` | Bind address |
| `signal` | — | `AbortSignal` for graceful shutdown |
| `websocket` | — | Upgrade handler from `router.websocketHandler()` |

Returns `{ stop, port, hostname, ready }`.

### `user(options)`

| Option | Default | Description |
|--------|---------|-------------|
| `pg` | — | PostgreSQL client from `postgres()` |
| `jwtSecret` | — | Secret key for JWT signing |
| `table` | `'_users'` | Users table name |
| `expiresIn` | `'24h'` | JWT expiration |
| `oauth2.server` | `false` | Enable OAuth2 Server |

Returns `UserModule` — `{ router, middleware, migrate, register, login, verify, registerClient, getClient, revokeClient, close }`.

### `tenant(options)`

| Option | Default | Description |
|--------|---------|-------------|
| `pg` | — | PostgreSQL client from `postgres()` |
| `usersTable` | — | Users table name (matching the `table` option passed to `user()`) |

Returns `TenantModule` — `{ migrate, middleware, router, graphql, close }`.

### `agent(options)`

| Option | Default | Description |
|--------|---------|-------------|
| `pg` | — | PostgreSQL client from `postgres()` |
| `model` | env `OPENAI_MODEL` → Ollama | `LanguageModel` from ai SDK |
| `embeddingModel` | env `OPENAI_EMBEDDING_MODEL` → Ollama | `EmbeddingModel` for knowledge RAG |
| `embeddingDimension` | `1024` | Vector dimension for pgvector |
| `tools` | — | Tools for workflow-type agents (ai SDK `Tool` objects) |

Returns `AgentModule` — `{ migrate, router, run, addKnowledge, close }`.

### `opencode(options)`

| Option | Default | Description |
|--------|---------|-------------|
| `pg` | — | PostgreSQL client from `postgres()` |
| `workspace` | `process.cwd()` | Base directory for `.sessions` |
| `model` | `'deepseek-v4-flash'` | LLM model name |
| `baseURL` | env `DEEPSEEK_BASE_URL` | API base URL |
| `apiKey` | env `DEEPSEEK_API_KEY` | API key |
| `systemPrompt` | — | Custom system prompt |
| `skills` | `[]` | Static skill definitions |
| `permissions` | — | Tool permission config |

Returns `OpencodeModule` — `{ migrate, router, wsHandler, close }`.

### `messager(options)`

| Option | Default | Description |
|--------|---------|-------------|
| `pg` | — | PostgreSQL client from `postgres()` |
| `agents` | — | `AgentModule` instance (enables agent message routing) |

Returns `MessagerModule` — `{ migrate, router, wsHandler, send, close }`.

### `tsx(options)`

| Option | Default | Description |
|--------|---------|-------------|
| `dir` | — | UI directory path (containing `pages/` and optionally `components/`) |

Returns `Promise<Router>`.

Auto-detected features (no configuration needed):

| Feature | Behavior |
|---------|----------|
| **File watching** | Enabled in dev mode. Watches `dir` for changes, recompiles on the fly, sends reload via WebSocket |
| **WebSocket live reload** | Endpoint at `/__weifuwu/livereload`. Browser auto-refreshes on file changes or server restart |
| **Tailwind CSS** | Auto-detected when `app.css` exists. Compiled through PostCSS + `@tailwindcss/postcss`. Served at `/__wfw/style.css`, auto-injected into HTML `<head>` |
| **`@` alias** | Read from `tsconfig.json` / `jsconfig.json` `compilerOptions.paths`. Passed to all esbuild builds |
| **Process state** | Dev mode keeps the process alive on file changes. DB connections, WebSockets, in-memory caches persist |

To use WebSocket features, pass `router.websocketHandler()` to `serve()`:

```ts
serve(app.handler(), { websocket: app.websocketHandler() })
```

### `Router`

| Method | Description |
|--------|-------------|
| `get/post/put/delete/patch/head/options/all(path, ...mws, handler)` | Route registration |
| `use(mw)` / `use(path, mw)` / `use(path, subRouter)` | Middleware / sub-router |
| `ws(path, ...mws, handler)` | WebSocket route |
| `onError(handler)` | Global error handler |
| `handler()` | Returns `(req, ctx) => Response` for `serve()` |
| `websocketHandler()` | Returns upgrade handler for `serve({ websocket })` |

### Middleware modules

| Import | Description |
|--------|-------------|
| `auth(options)` | Bearer token / custom header / verify / proxy |
| `cors(options?)` | CORS with preflight, origin whitelist, credentials |
| `logger(options?)` | Request logging with duration |
| `rateLimit(options?)` | In-memory rate limiting with headers |
| `compress(options?)` | Brotli / Gzip / Deflate compression |
| `validate(schemas)` | Zod validation middleware |
| `upload(options?)` | Multipart file upload middleware |

### Sub-Router modules (mount via `app.use()`)

| Import | Description |
|--------|-------------|
| `postgres(options?)` | PostgreSQL connection + DDL schema builder + transactions + module lifecycle |
| `redis(options?)` | Redis client (ioredis) — injects `ctx.redis` |
| `queue(options?)` | Redis-backed job queue — immediate, delayed, cron scheduling |
| `user(options)` | Built-in authentication (password + OAuth2 Server + JWT, middleware) |
| `tenant(options)` | Multi-tenant BaaS — dynamic tables, REST + GraphQL auto-generation, row-level isolation |
| `agent(options)` | AI Agent — chat/workflow/knowledge, Ollama-ready, programmatic API |
| `messager(options)` | Real-time messaging — channels, WebSocket, agent routing, webhooks |
| `opencode(options)` | AI programming assistant — chat agents with tools, skills, permissions, isolated workspaces |
| `graphql(handler)` | GraphQL endpoint (GET/POST + GraphiQL) |
| `ai(handler)` | AI streaming endpoint (POST) |
| `workflow(handler)` | Workflow engine (POST + SSE) |

### Deploy

| Import | Description |
|--------|-------------|
| `deploy(config)` | Start the deployment platform — see [deploy.md](./deploy.md) |
| `defineConfig(config)` | Type-safe config helper with validation — see [deploy.md](./deploy.md) |

### Utilities

| Function | Description |
|----------|-------------|
| `serveStatic(root, options?)` | Static file serving handler |
| `getCookies(req)` | Parse Cookie header → object |
| `setCookie(res, name, value, options?)` | Set cookie (returns new Response) |
| `deleteCookie(res, name)` | Delete cookie (returns new Response) |
| `useTsx()` | Hook returning `{ params, query, user, parsed }` from `TsxContext` |
| `createWorkflowEngine(options)` | Programmatic workflow engine |
| `createSSEManager()` | SSE event manager for workflows |
| `tool(def)` | Define a workflow tool |
| `pgTable(name, columns)` | Type-safe table schema definition with DDL generation |
| `serial()`, `uuid()`, `text()`, `integer()`, `boolean()`, `timestamptz()`, `jsonb()`, `textArray()`, `vector()` | Column type builders |
| `sql(strings, ...)` | SQL expression literal for table defaults (e.g. `sql\`NOW()\``) |
| `PgModule` | Base class for database-backed modules (provides `sql`, `close()`) |

Import `useTsx` and `TsxContext` from `'weifuwu'`.

## License

MIT
