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
import { pgTable, serial, uuid, text, integer, boolean, timestamptz, jsonb, sql, timestamps } from 'weifuwu'

const users = pgTable('_users', {
  id:        serial('id').primaryKey(),
  name:      text('name').notNull(),
  email:     text('email').unique().notNull(),
  age:       integer('age'),
  active:    boolean('active').default(true),
  ...timestamps(),               // adds created_at + updated_at with defaults
  metadata:  jsonb<{ role: string }>('metadata'),
})
```

Supports 11 column types:
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
| `timestamps()` | two TIMESTAMPTZ columns | `{ created_at, updated_at }` |

Column constraints chainable: `.primaryKey()`, `.notNull()`, `.nullable()`, `.default(value | sql\`...\`)`, `.unique()`, `.references(table, column?, onDelete?)`.

### DDL execution

```ts
await users.create()                         // CREATE TABLE IF NOT EXISTS
await users.create({                         // WITH PARTITION BY RANGE
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
  ...timestamps(),
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

// Read — with selected columns
const partial = await users.read(1, { select: ['id', 'name'] })

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

// Update — single row by id (auto-sets updated_at if column exists)
const updated = await users.update(1, { name: 'Bob' })
// → { id: 1, name: 'Bob', email: 'alice@test.com', ... }

// Update — many with Partial where
const count = await users.updateMany({ role: 'guest' }, { role: 'user' })

// Update — many with SQL where
await users.updateMany(gte('age', 65), { role: 'retired' })

// Delete — single row by id, returns deleted row
const deleted = await users.delete(1)
// → { id: 1, name: 'Bob', ... } or undefined

// Delete — many
const deleted = await users.deleteMany({ active: false })

// Read — select specific columns
const { data } = await users.readMany(
  { role: 'admin' },
  { select: ['id', 'name', 'email'], limit: 10 },
)
```

#### Upsert

```ts
// Insert or update on conflict
const user = await users.upsert(
  { email: 'alice@test.com', name: 'Alice' },
  'email',  // conflict target — column(s) with unique constraint
)
// ON CONFLICT (email) DO UPDATE SET "name" = EXCLUDED."name" RETURNING *
```

Supports composite conflict targets:

```ts
await members.upsert(
  { channel_id: 1, member_id: 42, role: 'admin' },
  ['channel_id', 'member_id'],
)
```

#### Count

```ts
const total = await users.count()                         // all rows
const admins = await users.count({ role: 'admin' })       // with Partial filter
const recent = await users.count(gte('created_at', from)) // with SQL condition
```

### Soft delete

If a table has a `deleted_at` column, `delete()` and `deleteMany()` set the timestamp instead of removing the row:

```ts
const users = pg.table('_users', {
  id: serial('id').primaryKey(),
  name: text('name'),
  deleted_at: timestamptz('deleted_at'),  // enables soft delete
})

await users.delete(1)           // SET deleted_at = NOW() WHERE id = 1
await users.deleteMany({ role: 'guest' })

// readMany auto-filters soft-deleted rows
const { data } = await users.readMany()   // WHERE deleted_at IS NULL

// Include soft-deleted rows
const { data } = await users.readMany(undefined, { withDeleted: true })

// Hard delete (bypass soft delete)
await users.hardDelete(1)
await users.hardDeleteMany({ role: 'guest' })
```

### Timestamps

The `timestamps()` macro adds `created_at` and `updated_at` columns with `NOT NULL DEFAULT NOW()`.

`update()` automatically appends `"updated_at" = NOW()` to the SET clause when the column exists — no need to pass it manually.

### Where helpers

Importable functions for composing complex WHERE clauses. Works with `readMany`, `updateMany`, `deleteMany`, and `count` — pass as the first argument (single `SQL` or `SQL[]` for implicit AND):

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

// Also works with updateMany and deleteMany
await users.updateMany(gte('age', 65), { role: 'retired' })
await users.deleteMany(eq('status', 'archived'))
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

Use BoundTable methods inside transactions with `withSql()`:

```ts
const users = pg.table('_users', { ... })
const wallets = pg.table('_wallets', { ... })

const result = await pg.transaction(async (tx) => {
  const txUsers = users.withSql(tx)
  const txWallets = wallets.withSql(tx)

  const user = await txUsers.insert({ name: 'Alice' })
  await txWallets.insert({ user_id: user.id })
  return user
})
```

This ensures all operations participate in the same transaction — a failure rolls everything back.

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

Every database module extends `PgModule`:

```ts
import { PgModule } from 'weifuwu'

class MyModule extends PgModule {
  constructor(pg: PostgresClient) {
    super(pg)   // sets this.sql = pg.sql
  }
  async migrate() { /* override */ }

  // Built-in helpers
  // this.table(name, builders) — create a BoundTable
  // this.transaction(fn) — run in a transaction
  // close() — calls pg.close() automatically
}
```

Migration is inlined in the module factory — no separate `migrate.ts` file needed:

```ts
export function myModule(options) {
  const pg = options.pg
  const table = pg.table('_my_table', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
  })

  return {
    migrate: async () => {
      await table.create()
      await table.createIndex('name')
    },
    close: () => pg.close(),
  }
}
```
