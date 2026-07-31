import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { PgPool } from './pool.ts'
import { ValidationError } from '../errors.ts'

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

describe('postgres schema + type layer (real database)', () => {
  const cfg = parseDbUrl(DB_URL)
  let pool: PgPool

  before(async () => {
    pool = await PgPool.create({ ...cfg, poolSize: 2 })
    await pool.query('DROP TABLE IF EXISTS wf_schema_a')
    await pool.query(
      `CREATE TABLE wf_schema_a (id int PRIMARY KEY, title text, status text, meta jsonb)`,
    )
  })

  after(async () => {
    await pool.query('DROP TABLE IF EXISTS wf_schema_a')
    await pool.close()
  })

  it('query<T> returns typed rows', async () => {
    interface Deck {
      id: number
      title: string
      meta: { slides: number }
    }
    await pool.query(`INSERT INTO wf_schema_a (id, title, status, meta) VALUES (1, 'a', 'ready', $1)`, [
      { slides: 3 },
    ])
    const rows = await pool.query<Deck>(`SELECT id, title, meta FROM wf_schema_a WHERE id = 1`)
    assert.equal(rows[0].id, 1) // 编译期类型 Deck
    assert.deepEqual(rows[0].meta, { slides: 3 })
  })

  it('schema.register enables validated insert', async () => {
    pool.register('wf_schema_a', {
      id: { type: 'int' },
      title: { type: 'text', required: true },
      status: { type: 'enum', values: ['outline', 'ready'] },
      meta: { type: 'jsonb' },
    })
    await pool.insert('wf_schema_a', { id: 2, title: 'ok', status: 'ready', meta: { a: 1 } })
    const rows = await pool.query(`SELECT title, status FROM wf_schema_a WHERE id = 2`)
    assert.equal(rows[0].title, 'ok')
    assert.equal(rows[0].status, 'ready')
  })

  it('schema.insert rejects invalid enum value', async () => {
    await assert.rejects(
      () => pool.insert('wf_schema_a', { id: 3, title: 'x', status: 'INVALID' }),
      (e: unknown) => e instanceof ValidationError,
    )
  })

  it('schema.insert rejects missing required field', async () => {
    await assert.rejects(
      () => pool.insert('wf_schema_a', { id: 4, status: 'ready' }),
      (e: unknown) => e instanceof ValidationError,
    )
  })

  it('schema.insert rejects wrong jsonb type (string instead of object)', async () => {
    await assert.rejects(
      () => pool.insert('wf_schema_a', { id: 5, title: 'x', status: 'ready', meta: 'not-an-object' }),
      (e: unknown) => e instanceof ValidationError,
    )
  })

  it('onQuery observes queries', async () => {
    const calls: string[] = []
    const p2 = await PgPool.create({ ...cfg, poolSize: 1, onQuery: (sql, ms, count) => calls.push(`${sql}|${count}`) })
    await p2.query('SELECT 1')
    await p2.close()
    assert.ok(calls.length >= 1)
    assert.ok(calls[0].includes('SELECT 1'))
  })
})
