import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from '../postgres/index.ts'
import type { PostgresClient } from '../postgres/types.ts'
import { pgTable, BoundTable, serial, uuid, text, integer, textArray, boolean as bool, timestamptz, jsonb, vector, sql, timestamps, eq, lt, gte, isNull, toDDL, partitionBy } from '../postgres/schema/index.ts'
import { randomUUID } from 'node:crypto'

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

/** Generate a unique table name for test isolation. Automatically tracked for cleanup. */
function tn(name: string): string {
  const t = `__test_${name}_${randomUUID().slice(0, 8)}`
  createdTables.push(t)
  return t
}

describe('schema', { skip: !DATABASE_URL }, () => {
  let pg: PostgresClient
  const createdTables: string[] = []

  before(async () => {
    pg = postgres({ connection: DATABASE_URL })
  })

  afterEach(async () => {
    for (const t of createdTables.splice(0)) {
      await pg.sql.unsafe(`DROP TABLE IF EXISTS "${t}" CASCADE`)
    }
  })

  after(async () => {
    await pg.close()
  })

  it('creates a table with various column types', async () => {
    const t = pgTable(tn('types'), {
      id: serial('id').primaryKey(),
      name: text('name').notNull(),
      email: text('email').unique(),
      age: integer('age'),
      active: bool('active').default(true),
      bio: text('bio'),
      created_at: timestamptz('created_at').default(sql`NOW()`),
      metadata: jsonb<{ key: string }>('metadata'),
    })

    await t.create(pg.sql)
    await t.drop(pg.sql, { cascade: true })
  })

  it('creates a table with UUID primary key', async () => {
    const t = pgTable(tn('uuid'), {
      id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
      name: text('name').notNull(),
    })

    await t.create(pg.sql)
    await pg.sql`INSERT INTO "__schema_test_uuid" ("name") VALUES (${'test'})`
    const [row] = await pg.sql`SELECT * FROM "__schema_test_uuid"`
    assert.ok(row)
    assert.ok(row.id)
    assert.equal(row.name, 'test')

    await t.drop(pg.sql, { cascade: true })
  })

  it('creates a table with foreign key', async () => {
    const parent = pgTable(tn('parent'), {
      id: serial('id').primaryKey(),
      name: text('name'),
    })
    const child = pgTable(tn('child'), {
      id: serial('id').primaryKey(),
      parent_id: integer('parent_id').notNull().references(tn('parent'), 'id', 'cascade'),
    })

    await parent.create(pg.sql)
    await child.create(pg.sql)

    await parent.drop(pg.sql, { cascade: true })
  })

  it('creates basic index', async () => {
    const t = pgTable(tn('idx'), {
      id: serial('id').primaryKey(),
      email: text('email'),
    })
    await t.create(pg.sql)
    await t.createIndex(pg.sql, 'email')

    await t.drop(pg.sql, { cascade: true })
  })

  it('creates unique index', async () => {
    const t = pgTable(tn('uidx'), {
      id: serial('id').primaryKey(),
      slug: text('slug'),
    })
    await t.create(pg.sql)
    await t.createUniqueIndex(pg.sql, 'slug')

    await t.drop(pg.sql, { cascade: true })
  })

  it('creates multi-column index', async () => {
    const t = pgTable(tn('mcol'), {
      id: serial('id').primaryKey(),
      a: integer('a'),
      b: integer('b'),
    })
    await t.create(pg.sql)
    await t.createIndex(pg.sql, ['a', 'b'])

    await t.drop(pg.sql, { cascade: true })
  })

  it('creates descending index', async () => {
    const t = pgTable(tn('desc'), {
      id: serial('id').primaryKey(),
      created_at: timestamptz('created_at'),
    })
    await t.create(pg.sql)
    await t.createIndex(pg.sql, 'created_at', { desc: true })

    await t.drop(pg.sql, { cascade: true })
  })

  it('creates hnsw vector index', async () => {
    try {
      await pg.sql`CREATE EXTENSION IF NOT EXISTS "vector"`
    } catch {
      return  // skip if vector extension not available
    }

    const t = pgTable(tn('hnsw'), {
      id: serial('id').primaryKey(),
      embedding: vector('embedding', 3),
    })
    await t.create(pg.sql)
    await t.createIndex(pg.sql, 'embedding', {
      type: 'hnsw',
      operator: 'vector_cosine_ops',
    })

    await t.drop(pg.sql, { cascade: true })
  })

  it('create is idempotent', async () => {
    const t = pgTable(tn('idem'), {
      id: serial('id').primaryKey(),
      name: text('name'),
    })
    await t.create(pg.sql)
    await t.create(pg.sql)
    await t.drop(pg.sql, { cascade: true })
  })

  it('string default value', async () => {
    const t = pgTable(tn('strdef'), {
      id: serial('id').primaryKey(),
      role: text('role').default('user'),
    })
    await t.create(pg.sql)
    await pg.sql`INSERT INTO "__schema_test_strdef" DEFAULT VALUES`
    const [row] = await pg.sql`SELECT * FROM "__schema_test_strdef"`
    assert.equal(row.role, 'user')
    await t.drop(pg.sql, { cascade: true })
  })

  it('supports nullable columns', async () => {
    const t = pgTable(tn('null'), {
      id: serial('id').primaryKey(),
      name: text('name').nullable(),
    })
    await t.create(pg.sql)
    await pg.sql`INSERT INTO "__schema_test_null" DEFAULT VALUES`
    const [row] = await pg.sql`SELECT * FROM "__schema_test_null"`
    assert.equal(row.name, null)
    await t.drop(pg.sql, { cascade: true })
  })

  // --- CRUD ---

  it('insert returns the created row with auto-generated id', async () => {
    const t = pgTable(tn('insert'), {
      id: serial('id').primaryKey(),
      name: text('name').notNull(),
      email: text('email'),
    })
    await t.create(pg.sql)

    const row = await t.insert(pg.sql, { name: 'Alice', email: 'a@b.com' })
    assert.ok(row)
    assert.ok(typeof row.id === 'number')
    assert.equal(row.name, 'Alice')
    assert.equal(row.email, 'a@b.com')

    await t.drop(pg.sql, { cascade: true })
  })

  it('insert auto-strips serial id', async () => {
    const t = pgTable(tn('insert_auto'), {
      id: serial('id').primaryKey(),
      label: text('label'),
    })
    await t.create(pg.sql)

    const row = await t.insert(pg.sql, { label: 'test' })
    assert.ok(row)
    assert.ok(typeof row.id === 'number')

    await t.drop(pg.sql, { cascade: true })
  })

  it('findById returns the row by primary key', async () => {
    const t = pgTable(tn('fbid'), {
      id: serial('id').primaryKey(),
      name: text('name'),
    })
    await t.create(pg.sql)

    const inserted = await t.insert(pg.sql, { name: 'Bob' })
    const found = await t.read(pg.sql, inserted.id)
    assert.ok(found)
    assert.equal(found.name, 'Bob')

    await t.drop(pg.sql, { cascade: true })
  })

  it('findById returns undefined for missing id', async () => {
    const t = pgTable(tn('fbid_miss'), {
      id: serial('id').primaryKey(),
      name: text('name'),
    })
    await t.create(pg.sql)

    const found = await t.read(pg.sql, 99999)
    assert.equal(found, undefined)

    await t.drop(pg.sql, { cascade: true })
  })

  it('find with empty where returns all rows', async () => {
    const t = pgTable(tn('find_all'), {
      id: serial('id').primaryKey(),
      name: text('name'),
    })
    await t.create(pg.sql)

    await t.insert(pg.sql, { name: 'A' })
    await t.insert(pg.sql, { name: 'B' })
    const { data: rows } = await t.readMany(pg.sql)
    assert.equal(rows.length, 2)

    await t.drop(pg.sql, { cascade: true })
  })

  it('readMany with where returns filtered rows', async () => {
    const t = pgTable(tn('find_whr'), {
      id: serial('id').primaryKey(),
      name: text('name'),
      role: text('role'),
    })
    await t.create(pg.sql)

    await t.insert(pg.sql, { name: 'A', role: 'admin' })
    await t.insert(pg.sql, { name: 'B', role: 'user' })
    await t.insert(pg.sql, { name: 'C', role: 'admin' })

    const { data: admins } = await t.readMany(pg.sql, { role: 'admin' })
    assert.equal(admins.length, 2)
    admins.forEach(r => assert.equal(r.role, 'admin'))

    await t.drop(pg.sql, { cascade: true })
  })

  it('update modifies and returns the row', async () => {
    const t = pgTable(tn('upd'), {
      id: serial('id').primaryKey(),
      name: text('name'),
      email: text('email'),
    })
    await t.create(pg.sql)

    const inserted = await t.insert(pg.sql, { name: 'Old', email: 'old@test.com' })
    const updated = await t.update(pg.sql, inserted.id, { name: 'New' })
    assert.ok(updated)
    assert.equal(updated.name, 'New')
    assert.equal(updated.email, 'old@test.com')

    await t.drop(pg.sql, { cascade: true })
  })

  it('update returns undefined for non-existent id', async () => {
    const t = pgTable(tn('upd_none'), {
      id: serial('id').primaryKey(),
      name: text('name'),
    })
    await t.create(pg.sql)

    const result = await t.update(pg.sql, 99999, { name: 'Nope' })
    assert.equal(result, undefined)

    await t.drop(pg.sql, { cascade: true })
  })

  it('delete returns deleted row', async () => {
    const t = pgTable(tn('del'), {
      id: serial('id').primaryKey(),
      name: text('name'),
    })
    await t.create(pg.sql)

    const inserted = await t.insert(pg.sql, { name: 'DeleteMe' })
    const deleted = await t.delete(pg.sql, inserted.id)
    assert.ok(deleted)
    assert.equal(deleted.name, 'DeleteMe')

    const found = await t.read(pg.sql, inserted.id)
    assert.equal(found, undefined)

    await t.drop(pg.sql, { cascade: true })
  })

  it('delete returns undefined for non-existent id', async () => {
    const t = pgTable(tn('del_none'), {
      id: serial('id').primaryKey(),
      name: text('name'),
    })
    await t.create(pg.sql)

    const deleted = await t.delete(pg.sql, 99999)
    assert.equal(deleted, undefined)

    await t.drop(pg.sql, { cascade: true })
  })

  it('BoundTable via pg.table() works', async () => {
    const t = pg.table(tn('bound'), {
      id: serial('id').primaryKey(),
      name: text('name'),
    })

    await t.create()

    const row = await t.insert({ name: 'Bound' })
    assert.ok(row)
    assert.ok(typeof row.id === 'number')
    assert.equal(row.name, 'Bound')

    const found = await t.read(row.id)
    assert.ok(found)
    assert.equal(found.name, 'Bound')

    await t.drop({ cascade: true })
  })

  it('readMany with orderBy works', async () => {
    const t = pgTable(tn('ord'), {
      id: serial('id').primaryKey(),
      name: text('name'),
    })
    await t.create(pg.sql)

    await t.insert(pg.sql, { name: 'c' })
    await t.insert(pg.sql, { name: 'a' })
    await t.insert(pg.sql, { name: 'b' })

    const { data: rows } = await t.readMany(pg.sql, undefined, { orderBy: { name: 'asc' } })
    assert.equal(rows.length, 3)
    assert.equal(rows[0].name, 'a')
    assert.equal(rows[1].name, 'b')
    assert.equal(rows[2].name, 'c')

    await t.drop(pg.sql, { cascade: true })
  })

  it('readMany with limit works', async () => {
    const t = pgTable(tn('lim'), {
      id: serial('id').primaryKey(),
      name: text('name'),
    })
    await t.create(pg.sql)

    for (const n of ['a', 'b', 'c']) await t.insert(pg.sql, { name: n })

    const { data: rows } = await t.readMany(pg.sql, undefined, { limit: 2, orderBy: { id: 'asc' } })
    assert.equal(rows.length, 2)

    await t.drop(pg.sql, { cascade: true })
  })

  it('readMany with offset works', async () => {
    const t = pgTable(tn('off'), {
      id: serial('id').primaryKey(),
      name: text('name'),
    })
    await t.create(pg.sql)

    for (const n of ['a', 'b', 'c']) await t.insert(pg.sql, { name: n })

    const { data: rows } = await t.readMany(pg.sql, undefined, { offset: 1, orderBy: { id: 'asc' } })
    assert.equal(rows.length, 2)

    await t.drop(pg.sql, { cascade: true })
  })

  it('BoundTable readMany with opts works', async () => {
    const t = pg.table(tn('bnd_find'), {
      id: serial('id').primaryKey(),
      label: text('label'),
    })
    await t.create()

    await t.insert({ label: 'z' })
    await t.insert({ label: 'a' })
    await t.insert({ label: 'm' })

    const { data: rows } = await t.readMany(undefined, { orderBy: { label: 'desc' } })
    assert.equal(rows.length, 3)
    assert.equal(rows[0].label, 'z')
    assert.equal(rows[2].label, 'a')

    await t.drop({ cascade: true })
  })

  // --- New CRUD features ---

  it('insertMany inserts multiple rows', async () => {
    const t = pgTable(tn('ins_many'), {
      id: serial('id').primaryKey(),
      name: text('name'),
    })
    await t.create(pg.sql)

    const rows = await t.insertMany(pg.sql, [
      { name: 'A' },
      { name: 'B' },
      { name: 'C' },
    ])
    assert.equal(rows.length, 3)
    assert.ok(rows.every(r => typeof r.id === 'number'))

    await t.drop(pg.sql, { cascade: true })
  })

  it('insertMany on BoundTable works', async () => {
    const t = pg.table(tn('ins_many_bt'), {
      id: serial('id').primaryKey(),
      name: text('name'),
    })
    await t.create()

    const rows = await t.insertMany([{ name: 'X' }, { name: 'Y' }])
    assert.equal(rows.length, 2)

    await t.drop({ cascade: true })
  })

  it('read with select returns subset of columns', async () => {
    const t = pgTable(tn('rd_sel'), {
      id: serial('id').primaryKey(),
      name: text('name'),
      email: text('email'),
    })
    await t.create(pg.sql)

    const inserted = await t.insert(pg.sql, { name: 'Alice', email: 'a@b.com' })
    const found = await t.read(pg.sql, inserted.id, { select: ['id', 'name'] })
    assert.ok(found)
    assert.equal(found.name, 'Alice')
    assert.equal(found.email, undefined)

    await t.drop(pg.sql, { cascade: true })
  })

  it('readMany with select returns subset of columns', async () => {
    const t = pgTable(tn('rdm_sel'), {
      id: serial('id').primaryKey(),
      name: text('name'),
      email: text('email'),
    })
    await t.create(pg.sql)

    await t.insert(pg.sql, { name: 'Bob', email: 'b@c.com' })
    const { data: rows } = await t.readMany(pg.sql, undefined, { select: ['name'] })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].name, 'Bob')
    assert.equal(rows[0].email, undefined)

    await t.drop(pg.sql, { cascade: true })
  })

  it('updateMany with Partial where works', async () => {
    const t = pgTable(tn('upd_many'), {
      id: serial('id').primaryKey(),
      role: text('role'),
      active: bool('active'),
    })
    await t.create(pg.sql)

    await t.insert(pg.sql, { role: 'admin', active: true })
    await t.insert(pg.sql, { role: 'user', active: true })
    await t.insert(pg.sql, { role: 'admin', active: false })

    const count = await t.updateMany(pg.sql, { role: 'admin' }, { active: false })
    assert.equal(count, 2)

    await t.drop(pg.sql, { cascade: true })
  })

  it('updateMany with SQL where works', async () => {
    const t = pgTable(tn('upd_sql'), {
      id: serial('id').primaryKey(),
      role: text('role'),
      score: integer('score'),
    })
    await t.create(pg.sql)

    await t.insert(pg.sql, { role: 'admin', score: 10 })
    await t.insert(pg.sql, { role: 'user', score: 5 })

    const count = await t.updateMany(pg.sql, eq('role', 'admin'), { score: 99 })
    assert.equal(count, 1)

    const { data: rows } = await t.readMany(pg.sql, { role: 'admin' })
    assert.equal(rows[0].score, 99)

    await t.drop(pg.sql, { cascade: true })
  })

  it('deleteMany with Partial where works', async () => {
    const t = pgTable(tn('del_many'), {
      id: serial('id').primaryKey(),
      status: text('status'),
    })
    await t.create(pg.sql)

    await t.insert(pg.sql, { status: 'active' })
    await t.insert(pg.sql, { status: 'archived' })
    await t.insert(pg.sql, { status: 'active' })

    const count = await t.deleteMany(pg.sql, { status: 'archived' })
    assert.equal(count, 1)

    const { data: rows } = await t.readMany(pg.sql)
    assert.equal(rows.length, 2)

    await t.drop(pg.sql, { cascade: true })
  })

  it('deleteMany with SQL where works', async () => {
    const t = pgTable(tn('del_sql'), {
      id: serial('id').primaryKey(),
      status: text('status'),
    })
    await t.create(pg.sql)

    await t.insert(pg.sql, { status: 'active' })
    await t.insert(pg.sql, { status: 'archived' })
    await t.insert(pg.sql, { status: 'active' })

    const count = await t.deleteMany(pg.sql, eq('status', 'archived'))
    assert.equal(count, 1)

    const { data: rows } = await t.readMany(pg.sql)
    assert.equal(rows.length, 2)

    await t.drop(pg.sql, { cascade: true })
  })

  it('upsert inserts new row', async () => {
    const t = pgTable(tn('ups_ins'), {
      id: serial('id').primaryKey(),
      slug: text('slug').unique().notNull(),
      label: text('label'),
    })
    await t.create(pg.sql)

    const row = await t.upsert(pg.sql, { slug: 'hello', label: 'Hello' }, 'slug')
    assert.ok(row)
    assert.equal(row.label, 'Hello')

    await t.drop(pg.sql, { cascade: true })
  })

  it('upsert updates existing row on conflict', async () => {
    const t = pgTable(tn('ups_upd'), {
      id: serial('id').primaryKey(),
      slug: text('slug').unique().notNull(),
      label: text('label'),
    })
    await t.create(pg.sql)

    await t.upsert(pg.sql, { slug: 'foo', label: 'Original' }, 'slug')
    const updated = await t.upsert(pg.sql, { slug: 'foo', label: 'Updated' }, 'slug')
    assert.equal(updated.label, 'Updated')

    await t.drop(pg.sql, { cascade: true })
  })

  it('count returns total rows without conditions', async () => {
    const t = pgTable(tn('cnt_all'), {
      id: serial('id').primaryKey(),
      name: text('name'),
    })
    await t.create(pg.sql)

    await t.insert(pg.sql, { name: 'a' })
    await t.insert(pg.sql, { name: 'b' })

    const total = await t.count(pg.sql)
    assert.equal(total, 2)

    await t.drop(pg.sql, { cascade: true })
  })

  it('count with where returns filtered count', async () => {
    const t = pgTable(tn('cnt_whr'), {
      id: serial('id').primaryKey(),
      role: text('role'),
    })
    await t.create(pg.sql)

    await t.insert(pg.sql, { role: 'admin' })
    await t.insert(pg.sql, { role: 'user' })
    await t.insert(pg.sql, { role: 'admin' })

    const total = await t.count(pg.sql, { role: 'admin' })
    assert.equal(total, 2)

    await t.drop(pg.sql, { cascade: true })
  })

  it('count with SQL where works', async () => {
    const t = pgTable(tn('cnt_sql'), {
      id: serial('id').primaryKey(),
      score: integer('score'),
    })
    await t.create(pg.sql)

    await t.insert(pg.sql, { score: 5 })
    await t.insert(pg.sql, { score: 15 })
    await t.insert(pg.sql, { score: 25 })

    const total = await t.count(pg.sql, gte('score', 10))
    assert.equal(total, 2)

    await t.drop(pg.sql, { cascade: true })
  })

  // --- Timestamps ---

  it('timestamps macro is usable in table definition', async () => {
    const t = pgTable(tn('ts'), {
      id: serial('id').primaryKey(),
      name: text('name'),
      ...timestamps(),
    })
    await t.create(pg.sql)
    assert.ok(true)

    const row = await t.insert(pg.sql, { name: 'test' })
    assert.ok(row.created_at)
    assert.ok(row.updated_at)

    await t.drop(pg.sql, { cascade: true })
  })

  // --- Soft delete ---

  it('delete with deleted_at column soft-deletes', async () => {
    const t = pgTable(tn('sd'), {
      id: serial('id').primaryKey(),
      name: text('name'),
      deleted_at: timestamptz('deleted_at'),
    })
    await t.create(pg.sql)

    const inserted = await t.insert(pg.sql, { name: 'SoftDeleteMe' })
    const deleted = await t.delete(pg.sql, inserted.id)
    assert.ok(deleted)
    assert.ok(deleted.deleted_at)

    // readMany should auto-filter deleted
    const { data: rows } = await t.readMany(pg.sql)
    assert.equal(rows.length, 0)

    // read with withDeleted should include soft-deleted
    const { data: withDeleted } = await t.readMany(pg.sql, undefined, { withDeleted: true })
    assert.equal(withDeleted.length, 1)

    await t.drop(pg.sql, { cascade: true })
  })

  it('hardDelete actually deletes', async () => {
    const t = pgTable(tn('hd'), {
      id: serial('id').primaryKey(),
      name: text('name'),
      deleted_at: timestamptz('deleted_at'),
    })
    await t.create(pg.sql)

    const inserted = await t.insert(pg.sql, { name: 'HardDeleteMe' })
    const deleted = await t.hardDelete(pg.sql, inserted.id)
    assert.ok(deleted)
    assert.ok(!deleted.deleted_at)

    const found = await t.read(pg.sql, inserted.id)
    assert.equal(found, undefined)

    await t.drop(pg.sql, { cascade: true })
  })

  it('deleteMany with deleted_at column soft-deletes', async () => {
    const t = pgTable(tn('sd_many'), {
      id: serial('id').primaryKey(),
      status: text('status'),
      deleted_at: timestamptz('deleted_at'),
    })
    await t.create(pg.sql)

    await t.insert(pg.sql, { status: 'active' })
    await t.insert(pg.sql, { status: 'archived' })

    const count = await t.deleteMany(pg.sql, { status: 'archived' })
    assert.equal(count, 1)

    const { data: rows } = await t.readMany(pg.sql)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].status, 'active')

    await t.drop(pg.sql, { cascade: true })
  })

  it('hardDeleteMany actually deletes', async () => {
    const t = pgTable(tn('hd_many'), {
      id: serial('id').primaryKey(),
      status: text('status'),
      deleted_at: timestamptz('deleted_at'),
    })
    await t.create(pg.sql)

    await t.insert(pg.sql, { status: 'archived' })
    await t.hardDeleteMany(pg.sql, { status: 'archived' })

    const { data: rows } = await t.readMany(pg.sql)
    assert.equal(rows.length, 0)

    await t.drop(pg.sql, { cascade: true })
  })

  it('textArray column type creates TEXT[] column', async () => {
    const t = pgTable(tn('text_array'), {
      id: serial('id').primaryKey(),
      tags: textArray('tags'),
    })
    await t.create(pg.sql)
    await t.insert(pg.sql, { tags: ['a', 'b'] })
    const { data: rows } = await t.readMany(pg.sql)
    assert.deepEqual(rows[0].tags, ['a', 'b'])
    await t.drop(pg.sql, { cascade: true })
  })

  it('partitionBy supports LIST type', async () => {
    const def = partitionBy('list', 'status')
    assert.equal(def.type, 'LIST')
    assert.equal(def.column, 'status')
  })

  it('partitionBy supports HASH type', async () => {
    const def = partitionBy('hash', 'user_id')
    assert.equal(def.type, 'HASH')
    assert.equal(def.column, 'user_id')
  })

  it('default() escapes single quotes in string values', async () => {
    const col = text('name').default("O'Brien")
    const ddl = toDDL(col)
    assert.match(ddl, /DEFAULT 'O''Brien'/)
  })

  it('createIndex supports GIN type', async () => {
    const t = pgTable(tn('gin'), {
      id: serial('id').primaryKey(),
      tags: jsonb('tags'),
    })
    await t.create(pg.sql)
    await t.createIndex(pg.sql, 'tags', { type: 'gin' })
    await t.drop(pg.sql, { cascade: true })
  })

  it('BoundTable upsert works', async () => {
    const t = pg.table(tn('bound_upsert'), {
      id: serial('id').primaryKey(),
      email: text('email').unique(),
    })
    await t.create()
    await t.upsert({ email: 'a@b.com' }, ['email'])
    const { data: rows } = await t.readMany()
    assert.equal(rows[0].email, 'a@b.com')
    await t.drop({ cascade: true })
  })

  it('BoundTable count works', async () => {
    const t = pg.table(tn('bound_count'), {
      id: serial('id').primaryKey(),
    })
    await t.create()
    const c = await t.count()
    assert.equal(typeof c, 'number')
    await t.drop({ cascade: true })
  })

  it('BoundTable withSql creates new instance', async () => {
    const t = pg.table(tn('bound_copy'), {
      id: serial('id').primaryKey(),
    })
    const t2 = t.withSql(pg.sql)
    assert.ok(t2)
    assert.equal(t2.tableName, t.tableName)
    await t.create()
    await t.drop({ cascade: true })
  })

  it('update with empty data returns undefined', async () => {
    const t = pgTable(tn('empty_update'), {
      id: serial('id').primaryKey(),
      val: text('val'),
    })
    await t.create(pg.sql)
    const result = await t.update(pg.sql, { id: 1 }, {} as any)
    assert.equal(result, undefined)
    await t.drop(pg.sql, { cascade: true })
  })

  it('upsert throws on empty data', async () => {
    const t = pgTable(tn('empty_upsert'), {
      id: serial('id').primaryKey(),
    })
    await t.create(pg.sql)
    await assert.rejects(() => t.upsert(pg.sql, {} as any))
    await t.drop(pg.sql, { cascade: true })
  })

  it('references without onDelete argument', async () => {
    const t = pgTable(tn('ref'), {
      id: serial('id').primaryKey(),
      parent_id: integer('parent_id').references('other_table'),
    })
    const ddl = toDDL(t.builders.parent_id)
    assert.match(ddl, /REFERENCES "other_table"\("id"\)/)
  })

  it('count on table with deleted_at filters softly-deleted rows', async () => {
    const t = pgTable(tn('count_soft'), {
      id: serial('id').primaryKey(),
      name: text('name'),
      deleted_at: timestamptz('deleted_at'),
    })
    await t.create(pg.sql)
    await t.insert(pg.sql, { name: 'active', deleted_at: null as any })
    const c = await t.count(pg.sql, {})
    assert.equal(c, 1)
    await t.drop(pg.sql, { cascade: true })
  })
})
