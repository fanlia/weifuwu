import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from '../postgres/index.ts'
import type { PostgresClient } from '../postgres/types.ts'
import { pgTable, BoundTable, serial, uuid, text, integer, boolean as bool, timestamptz, jsonb, vector, sql } from '../postgres/schema/index.ts'

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

describe('schema', { skip: !DATABASE_URL }, () => {
  let pg: PostgresClient

  before(async () => {
    pg = postgres({ connection: DATABASE_URL })
  })

  after(async () => {
    await pg.close()
  })

  it('creates a table with various column types', async () => {
    const t = pgTable('__schema_test_types', {
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
    const t = pgTable('__schema_test_uuid', {
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
    const parent = pgTable('__schema_test_parent', {
      id: serial('id').primaryKey(),
      name: text('name'),
    })
    const child = pgTable('__schema_test_child', {
      id: serial('id').primaryKey(),
      parent_id: integer('parent_id').notNull().references('__schema_test_parent', 'id', 'cascade'),
    })

    await parent.create(pg.sql)
    await child.create(pg.sql)

    await parent.drop(pg.sql, { cascade: true })
  })

  it('creates basic index', async () => {
    const t = pgTable('__schema_test_idx', {
      id: serial('id').primaryKey(),
      email: text('email'),
    })
    await t.create(pg.sql)
    await t.createIndex(pg.sql, 'email')

    await t.drop(pg.sql, { cascade: true })
  })

  it('creates unique index', async () => {
    const t = pgTable('__schema_test_uidx', {
      id: serial('id').primaryKey(),
      slug: text('slug'),
    })
    await t.create(pg.sql)
    await t.createUniqueIndex(pg.sql, 'slug')

    await t.drop(pg.sql, { cascade: true })
  })

  it('creates multi-column index', async () => {
    const t = pgTable('__schema_test_mcol', {
      id: serial('id').primaryKey(),
      a: integer('a'),
      b: integer('b'),
    })
    await t.create(pg.sql)
    await t.createIndex(pg.sql, ['a', 'b'])

    await t.drop(pg.sql, { cascade: true })
  })

  it('creates descending index', async () => {
    const t = pgTable('__schema_test_desc', {
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

    const t = pgTable('__schema_test_hnsw', {
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
    const t = pgTable('__schema_test_idem', {
      id: serial('id').primaryKey(),
      name: text('name'),
    })
    await t.create(pg.sql)
    await t.create(pg.sql)
    await t.drop(pg.sql, { cascade: true })
  })

  it('string default value', async () => {
    const t = pgTable('__schema_test_strdef', {
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
    const t = pgTable('__schema_test_null', {
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
    const t = pgTable('__schema_test_insert', {
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
    const t = pgTable('__schema_test_insert_auto', {
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
    const t = pgTable('__schema_test_fbid', {
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
    const t = pgTable('__schema_test_fbid_miss', {
      id: serial('id').primaryKey(),
      name: text('name'),
    })
    await t.create(pg.sql)

    const found = await t.read(pg.sql, 99999)
    assert.equal(found, undefined)

    await t.drop(pg.sql, { cascade: true })
  })

  it('find with empty where returns all rows', async () => {
    const t = pgTable('__schema_test_find_all', {
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
    const t = pgTable('__schema_test_find_whr', {
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
    const t = pgTable('__schema_test_upd', {
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
    const t = pgTable('__schema_test_upd_none', {
      id: serial('id').primaryKey(),
      name: text('name'),
    })
    await t.create(pg.sql)

    const result = await t.update(pg.sql, 99999, { name: 'Nope' })
    assert.equal(result, undefined)

    await t.drop(pg.sql, { cascade: true })
  })

  it('delete returns deleted row', async () => {
    const t = pgTable('__schema_test_del', {
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
    const t = pgTable('__schema_test_del_none', {
      id: serial('id').primaryKey(),
      name: text('name'),
    })
    await t.create(pg.sql)

    const deleted = await t.delete(pg.sql, 99999)
    assert.equal(deleted, undefined)

    await t.drop(pg.sql, { cascade: true })
  })

  it('BoundTable via pg.table() works', async () => {
    const t = pg.table('__schema_test_bound', {
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
    const t = pgTable('__schema_test_ord', {
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
    const t = pgTable('__schema_test_lim', {
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
    const t = pgTable('__schema_test_off', {
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
    const t = pg.table('__schema_test_bnd_find', {
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
})
