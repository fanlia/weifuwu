import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from '../postgres/index.ts'
import type { PostgresClient } from '../postgres/types.ts'
import { pgTable, serial, uuid, text, integer, boolean as bool, timestamptz, jsonb, vector, sql } from '../postgres/schema/index.ts'

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
})
