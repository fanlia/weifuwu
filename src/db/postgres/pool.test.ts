import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { PgPool } from './pool.ts'

// CS-04: 真实 postgres
const DB_URL = process.env.DATABASE_URL ?? 'postgres://root:123456@localhost:5432/demo'

function parseDbUrl(url: string) {
  const u = new URL(url)
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  }
}

describe('postgres pool (real database)', () => {
  const cfg = parseDbUrl(DB_URL)
  const tbl = `wf_pool_${process.pid}`
  let pool: PgPool

  before(async () => {
    pool = await PgPool.create({ ...cfg, poolSize: 3 })
    await pool.query(`CREATE TABLE IF NOT EXISTS ${tbl} (id int PRIMARY KEY, v text)`)
  })

  after(async () => {
    await pool.query(`DROP TABLE IF EXISTS ${tbl}`)
    await pool.close()
  })

  it('routes queries across connections', async () => {
    await pool.query(`INSERT INTO ${tbl} VALUES (1, 'a') ON CONFLICT (id) DO NOTHING`)
    const rows = await pool.query(`SELECT v FROM ${tbl} WHERE id = 1`)
    assert.equal(rows[0].v, 'a')
  })

  it('handles concurrent queries without cross-talk', async () => {
    const writes = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        pool.query(`INSERT INTO ${tbl} VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET v = $2`, [i, `v${i}`]),
      ),
    )
    assert.equal(writes.length, 10)
    const reads = await Promise.all(
      Array.from({ length: 10 }, (_, i) => pool.query(`SELECT v FROM ${tbl} WHERE id = $1`, [i])),
    )
    reads.forEach((r, i) => assert.equal(r[0].v, `v${i}`))
  })

  it('transaction stays on one connection', async () => {
    await pool.transaction(async (tx) => {
      await tx.query(`INSERT INTO ${tbl} VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET v = $2`, [99, 'tx'])
      const rows = await tx.query(`SELECT v FROM ${tbl} WHERE id = 99`)
      assert.equal(rows[0].v, 'tx')
    })
    const rows = await pool.query(`SELECT v FROM ${tbl} WHERE id = 99`)
    assert.equal(rows[0].v, 'tx')
  })

  it('transaction rolls back on error', async () => {
    await assert.rejects(
      () =>
        pool.transaction(async (tx) => {
          await tx.query(`INSERT INTO ${tbl} VALUES ($1, $2)`, [98, 'rollback'])
          throw new Error('boom')
        }),
      /boom/,
    )
    const rows = await pool.query(`SELECT count(*)::int AS n FROM ${tbl} WHERE id = 98`)
    assert.equal(rows[0].n, 0)
  })

  it('rejects when pool is closed', async () => {
    const p = await PgPool.create({ ...cfg, poolSize: 2 })
    await p.close()
    await assert.rejects(() => p.query('SELECT 1'))
  })
})
