# PostgreSQL

> [Home](../README.md) → PostgreSQL

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

### Type-safe CRUD with BoundTable

Two usage paths — use `pg.table()` when you have a `pg` handle, or `pgTable()` with explicit `sql`:

```ts
// pg.table() — auto-binds sql, no need to pass it
const users = pg.table('_users', {
  id:        serial('id').primaryKey(),
  name:      text('name').notNull(),
  email:     text('email').unique(),
  active:    boolean('active').default(true),
  createdAt: timestamptz('created_at').default(sql`NOW()`),
})

// INSERT ... RETURNING * — auto-strips serial id
const user = await users.insert({ name: 'Alice', email: 'alice@test.com' })
// → { id: 1, name: 'Alice', email: 'alice@test.com', active: true, ... }

// SELECT ... WHERE id = ? LIMIT 1
const found = await users.findById(1)

// SELECT ... WHERE ... [ORDER BY ...] [LIMIT ...] [OFFSET ...]
const admins = await users.find({ role: 'admin' })
const sorted = await users.find({ active: true }, { orderBy: { name: 'asc' } })
const page = await users.find(undefined, { limit: 10, offset: 0 })
const filtered = await users.find({ role: 'admin' }, { orderBy: { name: 'desc' }, limit: 5 })

// UPDATE ... SET ... WHERE ... RETURNING *
const updated = await users.update({ id: 1 }, { name: 'Bob' })
// With SQL expressions:
await users.update({ id: 1 }, { name: 'Bob', updated_at: sql`NOW()` })

// DELETE ... WHERE ... RETURNING 1
const ok = await users.delete({ id: 1 })
```

When using `pgTable()` directly (without `pg`), pass `sql` as the first argument:

```ts
const t = pgTable('_users', { ... })
await t.insert(ctx.sql, { name: 'Alice' })
await t.find(ctx.sql, { role: 'admin' }, { orderBy: { name: 'asc' } })
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
