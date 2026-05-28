import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from '../postgres/index.ts'
import type { PostgresClient } from '../postgres/types.ts'
import { z } from 'zod'

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

describe('postgres', { skip: !DATABASE_URL }, () => {
  let pg: PostgresClient

  before(async () => {
    pg = postgres({ connection: DATABASE_URL })
    pg.table('__test_users', {
      id: z.number().optional(),
      name: z.string().min(1),
      email: z.string().email(),
      age: z.number().optional(),
    })
    await pg.migrate()
  })

  after(async () => {
    await pg.sql`DROP TABLE IF EXISTS "__test_users"`
    await pg.close()
  })

  it('get returns undefined for missing row', async () => {
    const User = pg.table('__test_users_get_missing', {
      id: z.number().optional(),
      name: z.string(),
    })
    await pg.migrate()
    const user = await User.get(999)
    assert.equal(user, undefined)
    await pg.sql`DROP TABLE "__test_users_get_missing"`
  })

  it('create inserts and returns the row', async () => {
    const User = pg.table('__test_users_c', {
      id: z.number().optional(),
      name: z.string(),
      email: z.string(),
    })
    await pg.migrate()

    const user = await User.create({ name: 'Alice', email: 'alice@test.com' })
    assert.ok(user)
    assert.equal(user.name, 'Alice')
    assert.equal(user.email, 'alice@test.com')
    assert.ok(typeof user.id === 'number')

    await pg.sql`DROP TABLE "__test_users_c"`
  })

  it('get returns the row by primary key', async () => {
    const User = pg.table('__test_users_g', {
      id: z.number().optional(),
      name: z.string(),
      email: z.string(),
    })
    await pg.migrate()

    const created = await User.create({ name: 'Bob', email: 'bob@test.com' })
    const found = await User.get(created.id!)
    assert.ok(found)
    assert.equal(found.name, 'Bob')
    assert.equal(found.email, 'bob@test.com')

    await pg.sql`DROP TABLE "__test_users_g"`
  })

  it('list returns rows and count', async () => {
    const User = pg.table('__test_users_l', {
      id: z.number().optional(),
      name: z.string(),
      email: z.string(),
    })
    await pg.migrate()

    await User.create({ name: 'A', email: 'a@test.com' })
    await User.create({ name: 'B', email: 'b@test.com' })
    await User.create({ name: 'C', email: 'c@test.com' })

    const result = await User.list()
    assert.equal(result.count, 3)
    assert.equal(result.rows.length, 3)

    await pg.sql`DROP TABLE "__test_users_l"`
  })

  it('list with filter returns matching rows', async () => {
    const User = pg.table('__test_users_lf', {
      id: z.number().optional(),
      name: z.string(),
      email: z.string(),
    })
    await pg.migrate()

    await User.create({ name: 'X', email: 'x@test.com' })
    await User.create({ name: 'Y', email: 'y@test.com' })
    await User.create({ name: 'X', email: 'x2@test.com' })

    const result = await User.list({ name: 'X' })
    assert.equal(result.count, 2)
    assert.equal(result.rows.length, 2)
    result.rows.forEach((row: any) => assert.equal(row.name, 'X'))

    await pg.sql`DROP TABLE "__test_users_lf"`
  })

  it('list with limit and offset works', async () => {
    const User = pg.table('__test_users_lo', {
      id: z.number().optional(),
      name: z.string(),
    })
    await pg.migrate()

    await User.create({ name: 'a' })
    await User.create({ name: 'b' })
    await User.create({ name: 'c' })
    await User.create({ name: 'd' })

    const page1 = await User.list({}, { limit: 2, offset: 0 })
    assert.equal(page1.rows.length, 2)
    assert.equal(page1.count, 4)

    const page2 = await User.list({}, { limit: 2, offset: 2 })
    assert.equal(page2.rows.length, 2)
    assert.equal(page2.count, 4)

    const names = page1.rows.map((r: any) => r.name).concat(page2.rows.map((r: any) => r.name))
    assert.deepEqual(names.sort(), ['a', 'b', 'c', 'd'])

    await pg.sql`DROP TABLE "__test_users_lo"`
  })

  it('list with sort works', async () => {
    const User = pg.table('__test_users_ls', {
      id: z.number().optional(),
      name: z.string(),
    })
    await pg.migrate()

    await User.create({ name: 'c' })
    await User.create({ name: 'a' })
    await User.create({ name: 'b' })

    const result = await User.list({}, { sort: { name: 'asc' } })
    assert.equal(result.rows.length, 3)
    assert.equal(result.rows[0].name, 'a')
    assert.equal(result.rows[1].name, 'b')
    assert.equal(result.rows[2].name, 'c')

    await pg.sql`DROP TABLE "__test_users_ls"`
  })

  it('patch updates and returns updated row', async () => {
    const User = pg.table('__test_users_p', {
      id: z.number().optional(),
      name: z.string(),
      email: z.string(),
    })
    await pg.migrate()

    const created = await User.create({ name: 'Old', email: 'old@test.com' })
    const updated = await User.patch(created.id!, { name: 'New' })
    assert.ok(updated)
    assert.equal(updated.name, 'New')
    assert.equal(updated.email, 'old@test.com')

    await pg.sql`DROP TABLE "__test_users_p"`
  })

  it('patch returns undefined for non-existent id', async () => {
    const User = pg.table('__test_users_px', {
      id: z.number().optional(),
      name: z.string(),
    })
    await pg.migrate()

    const result = await User.patch(999, { name: 'Nope' })
    assert.equal(result, undefined)

    await pg.sql`DROP TABLE "__test_users_px"`
  })

  it('remove deletes and returns true', async () => {
    const User = pg.table('__test_users_r', {
      id: z.number().optional(),
      name: z.string(),
    })
    await pg.migrate()

    const created = await User.create({ name: 'DeleteMe' })
    const deleted = await User.remove(created.id!)
    assert.equal(deleted, true)

    const found = await User.get(created.id!)
    assert.equal(found, undefined)

    await pg.sql`DROP TABLE "__test_users_r"`
  })

  it('remove returns false for non-existent id', async () => {
    const User = pg.table('__test_users_rx', {
      id: z.number().optional(),
      name: z.string(),
    })
    await pg.migrate()

    const deleted = await User.remove(999)
    assert.equal(deleted, false)

    await pg.sql`DROP TABLE "__test_users_rx"`
  })

  it('ctx.sql is injected by middleware', async () => {
    let capturedSql: any = null
    const handler = pg as unknown as (req: Request, ctx: any, next: any) => any
    await handler(
      new Request('http://localhost/'),
      { params: {}, query: {} } as any,
      (_req: any, ctx: any) => {
        capturedSql = ctx.sql
        return new Response('ok')
      },
    )
    assert.ok(capturedSql)
    const [result] = await capturedSql`SELECT 1 as n`
    assert.equal(result.n, 1)
  })

  it('migrate is idempotent', async () => {
    await pg.migrate()
  })

  it('create validates input with zod', async () => {
    const User = pg.table('__test_users_v', {
      id: z.number().optional(),
      name: z.string().min(1),
      email: z.string().email(),
    })
    await pg.migrate()

    await assert.rejects(
      () => User.create({ name: '', email: 'bad' }),
      (err: any) => {
        assert.ok(err instanceof z.ZodError || err.issues)
        return true
      },
    )

    await pg.sql`DROP TABLE "__test_users_v"`
  })

  it('supports TEXT primary key', async () => {
    const Tag = pg.table('__test_tags', {
      id: z.string(),
      label: z.string(),
    })
    await pg.migrate()

    const created = await Tag.create({ id: 'tag-1', label: 'My Tag' })
    assert.equal(created.id, 'tag-1')

    const found = await Tag.get('tag-1')
    assert.ok(found)
    assert.equal(found.label, 'My Tag')

    await pg.sql`DROP TABLE "__test_tags"`
  })

  it('supports UUID primary key', async () => {
    await pg.sql`DROP TABLE IF EXISTS "__test_uuids"`
    const Item = pg.table('__test_uuids', {
      id: z.string().uuid().optional(),
      name: z.string(),
    })
    await pg.migrate()

    const created = await Item.create({ name: 'UUID Item' })
    assert.ok(created.id)
    assert.equal(created.name, 'UUID Item')

    const found = await Item.get(created.id!)
    assert.ok(found)

    await pg.sql`DROP TABLE "__test_uuids"`
  })

  it('create rejects invalid data', async () => {
    const User = pg.table('__test_users_err', {
      id: z.number().optional(),
      name: z.string().min(1),
    })
    await pg.migrate()

    await assert.rejects(
      () => User.create({ name: '' }),
      z.ZodError,
    )

    await pg.sql`DROP TABLE "__test_users_err"`
  })
})
