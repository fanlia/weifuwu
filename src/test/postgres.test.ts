import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from '../postgres/index.ts'
import type { PostgresClient } from '../postgres/types.ts'

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgres://root:123456@localhost:5432/demo'

describe('postgres', { skip: !DATABASE_URL }, () => {
  let pg: PostgresClient

  before(async () => {
    pg = postgres({ connection: DATABASE_URL })
    await pg.sql`CREATE TABLE IF NOT EXISTS __test_items (id SERIAL PRIMARY KEY, name TEXT, email TEXT)`
  })

  after(async () => {
    await pg.sql`DROP TABLE IF EXISTS __test_items`
    await pg.close()
  })

  it('executes raw SQL queries', async () => {
    const [result] = await pg.sql`SELECT 1 as n`
    assert.equal(result.n, 1)
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

  it('inserts and selects rows', async () => {
    const [row] =
      await pg.sql`INSERT INTO __test_items (name, email) VALUES (${'Alice'}, ${'alice@test.com'}) RETURNING *`
    assert.ok(row)
    assert.equal(row.name, 'Alice')
    assert.equal(row.email, 'alice@test.com')
    assert.ok(typeof row.id === 'number')

    const [found] = await pg.sql`SELECT * FROM __test_items WHERE id = ${row.id}`
    assert.ok(found)
    assert.equal(found.name, 'Alice')
  })

  it('transaction commits successfully', async () => {
    const result = await pg.transaction(async (tx: any) => {
      const [row] =
        await tx`INSERT INTO __test_items (name, email) VALUES (${'tx'}, ${'tx@test.com'}) RETURNING *`
      const [found] = await tx`SELECT * FROM __test_items WHERE id = ${row.id}`
      return found.name as string
    })
    assert.equal(result, 'tx')
  })

  it('transaction rolls back on error', async () => {
    const beforeCount = (await pg.sql`SELECT count(*) as c FROM __test_items`)[0].c

    await assert.rejects(
      pg.transaction(async (tx: any) => {
        await tx`INSERT INTO __test_items (name, email) VALUES (${'rollback'}, ${'rb@test.com'}) RETURNING *`
        throw new Error('force rollback')
      }),
    )

    const afterCount = (await pg.sql`SELECT count(*) as c FROM __test_items`)[0].c
    assert.equal(afterCount, beforeCount)
  })

  it('migrate is a no-op', async () => {
    await pg.migrate()
  })

  it('close is callable', async () => {
    const p2 = postgres({ connection: DATABASE_URL })
    await p2.close()
  })
})
