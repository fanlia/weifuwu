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
await users.create(sql, {                    // WITH PARTITION BY RANGE
  partitionBy: partitionBy('range', 'created_at'),
})
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

The `BoundTable` follows a clean CRUD naming — singular for one, plural for many:

```ts
// pg.table() — auto-binds sql, no need to pass it
const users = pg.table('_users', {
  id:        serial('id').primaryKey(),
  name:      text('name').notNull(),
  email:     text('email').unique(),
  active:    boolean('active').default(true),
  createdAt: timestamptz('created_at').default(sql`NOW()`),
})

// Create — single
const user = await users.insert({ name: 'Alice', email: 'alice@test.com' })
// → { id: 1, name: 'Alice', ... }

// Create — many
const batch = await users.insertMany([
  { name: 'Alice' },
  { name: 'Bob' },
  { name: 'Charlie' },
])
// → [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }, { id: 3, name: 'Charlie' }]

// Read — by id
const found = await users.read(1)

// Read — many with optional filtering + pagination
const { count, data } = await users.readMany({ role: 'admin' })
// count is total matching rows, data is the page
const { data: sorted } = await users.readMany({ active: true }, { orderBy: { name: 'asc' } })
const { data: page } = await users.readMany(undefined, { limit: 10, offset: 0 })
const { data: filtered } = await users.readMany(
  { role: 'admin' },
  { orderBy: { name: 'desc' }, limit: 5 },
)

// Read — complex conditions with where helpers
import { eq, gte, lt, contains, and } from 'weifuwu'
const { count, data } = await users.readMany(
  and(
    eq('role', 'admin'),
    gte('created_at', '2026-01-01'),
    contains('metadata', { region: 'us' }),
  ),
  { orderBy: { name: 'asc' } },
)
// Array shorthand — implicit AND
const { data } = await users.readMany(
  [eq('role', 'admin'), gte('created_at', '2026-01-01')],
  { limit: 10 },
)

// Update — single row by id
const updated = await users.update(1, { name: 'Bob' })
// → { id: 1, name: 'Bob', email: 'alice@test.com', ... }

// Update — with SQL expressions:
await users.update(1, { name: 'Bob', updated_at: sql`NOW()` })

// Update — many, returns count of affected rows
const count = await users.updateMany({ role: 'guest' }, { role: 'user' })

// Delete — single row by id, returns deleted row
const deleted = await users.delete(1)
// → { id: 1, name: 'Bob', ... } or undefined

// Delete — many, returns count of deleted rows
const deleted = await users.deleteMany({ active: false })

// Read — select specific columns
const { data } = await users.readMany(
  { role: 'admin' },
  { select: ['id', 'name', 'email'], limit: 10 },
)
```

When using `pgTable()` directly (without `pg`), pass `sql` as the first argument:

```ts
const t = pgTable('_users', { ... })
await t.insert(ctx.sql, { name: 'Alice' })
await t.readMany(ctx.sql, { role: 'admin' }, { orderBy: { name: 'asc' } })
await t.read(ctx.sql, 1)
await t.update(ctx.sql, 1, { name: 'Bob' })
await t.delete(ctx.sql, 1)
```

### Where helpers

Importable functions for composing complex WHERE clauses. Works with `readMany` — pass as the first argument (single `SQL` or `SQL[]` for implicit AND):

```ts
import { eq, ne, gt, gte, lt, lte, isNull, isNotNull, like, contains, in_, and, or, not } from 'weifuwu'

// Single condition
const { data } = await users.readMany(gte('created_at', '2026-01-01'))

// Array = implicit AND
const { data } = await users.readMany([
  eq('role', 'admin'),
  gte('created_at', '2026-01-01'),
  contains('metadata', { region: 'us' }),
])

// Explicit AND/OR composition
const { data } = await users.readMany(
  or(
    and(eq('role', 'admin'), eq('status', 'active')),
    eq('role', 'superadmin'),
  ),
  { orderBy: { name: 'asc' }, limit: 10 },
)
```

| Helper | SQL | Example |
|--------|-----|---------|
| `eq(col, val)` | `= $1` | `eq('level', 'error')` |
| `ne(col, val)` | `!= $1` | `ne('status', 'archived')` |
| `gt(col, val)` | `> $1` | `gt('age', 18)` |
| `gte(col, val)` | `>= $1` | `gte('created_at', '2026-01-01')` |
| `lt(col, val)` | `< $1` | `lt('id', beforeId)` |
| `lte(col, val)` | `<= $1` | `lte('score', 100)` |
| `isNull(col)` | `IS NULL` | `isNull('deleted_at')` |
| `isNotNull(col)` | `IS NOT NULL` | `isNotNull('email')` |
| `like(col, pattern)` | `LIKE $1` | `like('name', 'Alice%')` |
| `contains(col, obj)` | `@> $1::jsonb` | `contains('metadata', { service: 'auth' })` |
| `in_(col, arr)` | `= ANY($1)` | `in_('id', [1, 2, 3])` |
| `and(...conds)` | `(... AND ...)` | `and(eq('a', 1), eq('b', 2))` |
| `or(...conds)` | `(... OR ...)` | `or(eq('a', 1), eq('b', 2))` |
| `not(cond)` | `NOT (...)` | `not(eq('status', 'archived'))` |

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
