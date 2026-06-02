# Tenant BaaS

> [Home](../README.md) → Tenant BaaS

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
