# GraphQL

> [Home](../README.md) → GraphQL

## GraphQL

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
