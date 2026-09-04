import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { PgConnection } from './connection.ts'
import { ConnectionError } from '../errors.ts'

// W3b：wire 内存服务器（MemoryPostgresServer）消亡——PgConnection 协议契约改
// 真库 gate（RUN_DOCKER_TESTS=1——对齐 sandbox 专项口径；DATABASE_URL 直连）
const DB_URL = process.env.TEST_PG_URL ?? process.env.DATABASE_URL ?? ''
const SKIP = process.env.RUN_DOCKER_TESTS !== '1'
if (SKIP) console.log('[connection-test] 跳过（RUN_DOCKER_TESTS 未设——wire 服务器消亡后需真库 gate）')

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

describe('postgres connection (real database)', { skip: SKIP }, () => {
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
    assert.deepEqual(rows, [{ one: 1 }])
  })

  it('query returns multiple rows and columns', async () => {
    const rows = await conn.query('SELECT 1 AS a, 2 AS b UNION ALL SELECT 3, 4')
    assert.deepEqual(rows, [
      { a: 1, b: 2 },
      { a: 3, b: 4 },
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
    // 真库认证失败路径（客户端 SCRAM/MD5 握手被拒）——根因防线（原内存服务器
    // 密码注入；真库时用 DATABASE_URL 带错密码验证）
    const u = new URL(DB_URL)
    const bad = new PgConnection({ host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password: 'wrong-password', database: u.pathname.replace(/^\//, '') })
    await assert.rejects(() => bad.connect(), (e: unknown) => e instanceof ConnectionError)
  })

  it('terminates cleanly on close', async () => {
    const c2 = new PgConnection(cfg)
    await c2.connect()
    await c2.close()
    assert.equal(c2.connected, false)
  })
})

describe('postgres parameterized queries (real database)', { skip: SKIP }, () => {
  const cfg = parseDbUrl(DB_URL)
  let conn: PgConnection

  before(async () => {
    conn = new PgConnection(cfg)
    await conn.connect()
  })

  after(async () => {
    await conn.close()
  })

  it('parameterized SELECT with $1', async () => {
    const rows = await conn.query('SELECT $1::int AS v', [42])
    assert.deepEqual(rows, [{ v: 42 }])
  })

  it('multiple parameters', async () => {
    const rows = await conn.query('SELECT $1::int + $2::int AS sum', [2, 3])
    assert.equal(rows[0].sum, 5)
  })

  it('text parameter with quotes is safe (no injection)', async () => {
    const rows = await conn.query("SELECT $1 AS v", ["it's a 'quoted' value; DROP TABLE x"])
    assert.equal(rows[0].v, "it's a 'quoted' value; DROP TABLE x")
  })

  it('null parameter', async () => {
    const rows = await conn.query('SELECT $1::text AS v', [null])
    assert.equal(rows[0].v, null)
  })

  it('object parameter serializes to JSON (jsonb)', async () => {
    const rows = await conn.query('SELECT $1::jsonb AS j', [{ a: 1, b: [2, 3] }])
    assert.deepEqual(rows[0].j, { a: 1, b: [2, 3] })
  })

  it('parameterized INSERT/UPDATE on real table', async () => {
    const tbl = `wf_pgp_${process.pid}`
    await conn.query(`CREATE TABLE ${tbl} (id int PRIMARY KEY, title text)`)
    await conn.query(`INSERT INTO ${tbl} (id, title) VALUES ($1, $2)`, [1, 'hello'])
    await conn.query(`UPDATE ${tbl} SET title = $1 WHERE id = $2`, ['world', 1])
    const rows = await conn.query(`SELECT title FROM ${tbl} WHERE id = $1`, [1])
    assert.equal(rows[0].title, 'world')
    await conn.query(`DROP TABLE ${tbl}`)
  })

  it('parameter count mismatch rejects', async () => {
    // SQL 用 $2 但只传 1 个参数 → Bind 阶段协议错误 08P01
    await assert.rejects(
      () => conn.query('SELECT $1::int, $2::int', [1]),
      (e: unknown) => e instanceof Error && (e as any).code === '08P01',
    )
  })
})

