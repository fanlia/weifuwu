import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from '../postgres/index.ts'

describe('postgres', () => {
  const pg = postgres()
  const table = '__test_items'

  before(async () => {
    await pg.sql`CREATE TABLE IF NOT EXISTS __test_items (id SERIAL PRIMARY KEY, name TEXT, email TEXT)`
  })

  after(async () => {
    await pg.sql`DROP TABLE IF EXISTS __test_items`
    await pg.close()
  })

  it('executes raw SQL', async () => {
    const rows = await pg.sql`SELECT 1 AS n`
    assert.equal(rows[0].n, 1)
  })

  it('inserts and selects rows', async () => {
    await pg.sql`INSERT INTO __test_items (name, email) VALUES ('alice', 'alice@test.com')`
    const rows = await pg.sql`SELECT * FROM __test_items WHERE name = 'alice'`
    assert.equal(rows.length, 1)
    assert.equal(rows[0].email, 'alice@test.com')
  })

  it('ctx.sql is injected by middleware', async () => {
    let captured: any
    await pg(new Request('http://localhost/'), {} as any, async (req, ctx: any) => {
      captured = ctx.sql
      return new Response('ok')
    })
    assert.ok(captured)
  })

  it('transaction commits', async () => {
    await pg.sql.begin(async (sql) => {
      await sql`INSERT INTO __test_items (name) VALUES ('tx-commit')`
    })
    const rows = await pg.sql`SELECT * FROM __test_items WHERE name = 'tx-commit'`
    assert.equal(rows.length, 1)
  })

  it('transaction rolls back on error', async () => {
    try {
      await pg.sql.begin(async (sql) => {
        await sql`INSERT INTO __test_items (name) VALUES ('tx-rollback')`
        throw new Error('abort')
      })
    } catch {}
    const rows = await pg.sql`SELECT * FROM __test_items WHERE name = 'tx-rollback'`
    assert.equal(rows.length, 0)
  })
})
