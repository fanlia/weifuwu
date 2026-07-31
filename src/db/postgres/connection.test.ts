import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { PgConnection } from './connection.ts'
import { ConnectionError } from '../errors.ts'

// CS-04: 必须连 docker-compose 真实 postgres（localhost:5432，DATABASE_URL）
const DB_URL = process.env.DATABASE_URL ?? 'postgres://root:123456@localhost:5432/demo'

interface DbConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

function parseDbUrl(url: string): DbConfig {
  const u = new URL(url)
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  }
}

describe('postgres connection (real database)', () => {
  const cfg = parseDbUrl(DB_URL)
  let conn: PgConnection

  before(async () => {
    conn = new PgConnection(cfg)
    await conn.connect()
  })

  after(async () => {
    await conn.close()
  })

  it('connects and authenticates (SCRAM/MD5)', () => {
    assert.equal(conn.connected, true)
  })

  it('simple query SELECT 1', async () => {
    const rows = await conn.query('SELECT 1 AS one')
    assert.deepEqual(rows, [{ one: '1' }])
  })

  it('query returns multiple rows and columns', async () => {
    const rows = await conn.query('SELECT 1 AS a, 2 AS b UNION ALL SELECT 3, 4')
    assert.deepEqual(rows, [
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ])
  })

  it('query with zero rows returns empty array', async () => {
    const rows = await conn.query('SELECT * FROM (SELECT 1 AS x) t WHERE 1 = 0')
    assert.deepEqual(rows, [])
  })

  it('query on real table (create/insert/select/cleanup)', async () => {
    const tbl = `wf_pg_${process.pid}`
    await conn.query(`CREATE TABLE ${tbl} (id serial PRIMARY KEY, title text)`)
    await conn.query(`INSERT INTO ${tbl} (title) VALUES ('a'), ('b')`)
    const rows = await conn.query(`SELECT id, title FROM ${tbl} ORDER BY id`)
    assert.equal(rows.length, 2)
    assert.equal(rows[0].title, 'a')
    assert.equal(rows[1].title, 'b')
    await conn.query(`DROP TABLE ${tbl}`)
  })

  it('query with text literal containing quotes', async () => {
    const rows = await conn.query(`SELECT 'it''s' AS s`)
    assert.equal(rows[0].s, "it's")
  })

  it('rejects with SQL error for bad query', async () => {
    await assert.rejects(() => conn.query('SELECT * FROM nonexistent_table_xyz'), (e: unknown) => {
      return e instanceof Error && (e as any).code === '42P01'
    })
  })

  it('rejects with ConnectionError on bad credentials', async () => {
    const bad = new PgConnection({ ...cfg, password: 'wrong-password' })
    await assert.rejects(() => bad.connect(), (e: unknown) => e instanceof ConnectionError)
  })

  it('terminates cleanly on close', async () => {
    const c2 = new PgConnection(cfg)
    await c2.connect()
    await c2.close()
    assert.equal(c2.connected, false)
  })
})
