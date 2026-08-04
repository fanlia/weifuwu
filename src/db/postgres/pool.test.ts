import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { PgPool } from './pool.ts'
import { TimeoutError } from '../errors.ts'

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
    await pool.query(`DROP TABLE IF EXISTS ${tbl}`)
    await pool.query(`CREATE TABLE ${tbl} (id int PRIMARY KEY, v text)`)
  })

  after(async () => {
    await pool.query(`DROP TABLE IF EXISTS wf_tag_a`)
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

describe('postgres tagged template + unsafe (real database)', () => {
  const cfg = parseDbUrl(DB_URL)
  const tbl = `wf_tag_${process.pid}`
  let pool: PgPool

  before(async () => {
    pool = await PgPool.create({ ...cfg, poolSize: 2 })
    await pool.query('DROP TABLE IF EXISTS wf_tag_a')
    await pool.query(`CREATE TABLE wf_tag_a (id int PRIMARY KEY, title text, meta jsonb)`)
  })

  after(async () => {
    await pool.query(`DROP TABLE IF EXISTS wf_tag_a`)
    await pool.close()
  })

  it('tagged template with interpolated values becomes parameterized', async () => {
    await pool.tag`INSERT INTO wf_tag_a (id, title) VALUES (${1}, ${'hello'})`
    const rows = await pool.tag`SELECT title FROM wf_tag_a WHERE id = ${1}`
    assert.equal(rows[0].title, 'hello')
  })

  it('tagged template with object → jsonb (no double-encoding)', async () => {
    await pool.tag`INSERT INTO wf_tag_a (id, title, meta) VALUES (${2}, ${'x'}, ${{ a: 1, b: [2] }})`
    const rows = await pool.tag`SELECT meta FROM wf_tag_a WHERE id = ${2}`
    assert.deepEqual(rows[0].meta, { a: 1, b: [2] }) // 对象进出——双重编码根除
  })

  it('256KB jsonb param round-trips (large Bind path)', async () => {
    const big = { payload: 'x'.repeat(256 * 1024) }
    await pool.tag`INSERT INTO wf_tag_a (id, title, meta) VALUES (${99}, ${'big'}, ${big})`
    const rows = await pool.tag`SELECT length(meta::text) AS len FROM wf_tag_a WHERE id = ${99}`
    // JSON.stringify 后长度 = 原串 + 固定包围（{"payload":""} = 15 字符）
    assert.equal(rows[0].len, 256 * 1024 + 15)
  })

  it('tagged template is injection-safe', async () => {
    const evil = "'; DROP TABLE wf_tag_a; --"
    await pool.tag`INSERT INTO wf_tag_a (id, title) VALUES (${3}, ${evil})`
    const rows = await pool.tag`SELECT title FROM wf_tag_a WHERE id = ${3}`
    assert.equal(rows[0].title, evil) // 原样存储，未注入
  })

  it('unsafe runs raw SQL with $1 params', async () => {
    await pool.unsafe(`INSERT INTO wf_tag_a (id, title) VALUES ($1, $2)`, [4, 'raw'])
    const rows = await pool.unsafe(`SELECT title FROM wf_tag_a WHERE id = $1`, [4])
    assert.equal(rows[0].title, 'raw')
  })

  it('unsafe without params', async () => {
    const rows = await pool.unsafe('SELECT 1::int AS one')
    assert.equal(rows[0].one, 1)
  })
})

describe('postgres begin (postgres.js compatible tx API)', () => {
  const cfg = parseDbUrl(DB_URL)
  let pool: PgPool

  before(async () => {
    pool = await PgPool.create({ ...cfg, poolSize: 2 })
    await pool.query('DROP TABLE IF EXISTS wf_begin_a')
    await pool.query('CREATE TABLE wf_begin_a (id int PRIMARY KEY, v text)')
  })

  after(async () => {
    await pool.query('DROP TABLE IF EXISTS wf_begin_a')
    await pool.close()
  })

  it('begin commits on success (inner sql is tagged)', async () => {
    await pool.begin(async (tx) => {
      await tx`INSERT INTO wf_begin_a VALUES (${1}, ${'ok'})`
    })
    const rows = await pool.query('SELECT v FROM wf_begin_a WHERE id = 1')
    assert.equal(rows[0].v, 'ok')
  })

  it('begin rolls back on error', async () => {
    await assert.rejects(
      () =>
        pool.begin(async (tx) => {
          await tx`INSERT INTO wf_begin_a VALUES (${2}, ${'rb'})`
          throw new Error('abort')
        }),
      /abort/,
    )
    const rows = await pool.query('SELECT count(*)::int AS n FROM wf_begin_a WHERE id = 2')
    assert.equal(rows[0].n, 0)
  })
})

describe('postgres nested fragments (agent-platform pattern)', () => {
  const cfg = parseDbUrl(DB_URL)
  let pool: PgPool

  before(async () => {
    pool = await PgPool.create({ ...cfg, poolSize: 2 })
    await pool.query('DROP TABLE IF EXISTS wf_frag_a')
    await pool.query(`CREATE TABLE wf_frag_a (id int PRIMARY KEY, tenant int, type text)`)
    await pool.query(`INSERT INTO wf_frag_a VALUES (1, 10, 'ai'), (2, 10, 'user'), (3, 20, 'ai')`)
  })

  after(async () => {
    await pool.query('DROP TABLE IF EXISTS wf_frag_a')
    await pool.close()
  })

  it('conditional fragment inlining (sql`AND type = ${x}` as interpolation)', async () => {
    const type = 'ai'
    const rows = await pool.tag`
      SELECT id FROM wf_frag_a WHERE tenant = ${10}
      ${type ? pool.frag`AND type = ${type}` : pool.frag``}
    `
    assert.deepEqual(rows.map((r) => r.id), [1]) // tenant=10 AND type=ai → 只有 id=1
  })

  it('empty fragment inlines nothing', async () => {
    const type = null
    const rows = await pool.tag`
      SELECT id FROM wf_frag_a WHERE tenant = ${20}
      ${type ? pool.frag`AND type = ${type}` : pool.frag``}
    `
    assert.deepEqual(rows.map((r) => r.id), [3]) // 无类型过滤
  })

  it('fragment with multiple params renumbers correctly', async () => {
    const rows = await pool.tag`
      SELECT id FROM wf_frag_a WHERE tenant = ${10}
      ${pool.frag`AND type = ${'user'} AND id > ${0}`}
      ORDER BY id
    `
    assert.deepEqual(rows.map((r) => r.id), [2])
  })
})

describe('postgres pool acquire timeout (anti-starvation)', () => {
  const cfg = parseDbUrl(DB_URL)
  let pool: PgPool

  before(async () => {
    pool = await PgPool.create({ ...cfg, poolSize: 1, acquireTimeoutMs: 500 })
  })

  after(async () => {
    await pool.close()
  })

  it('rejects with TimeoutError when pool is exhausted', async () => {
    // 占用唯一连接（事务内 sleep）
    const busy = pool.transaction(async (tx) => {
      await tx.query('SELECT pg_sleep(2)')
      return 'done'
    })
    await new Promise((r) => setTimeout(r, 100)) // 确保连接被占用
    const t0 = Date.now()
    await assert.rejects(
      () => pool.query('SELECT 1'),
      (e: unknown) => e instanceof TimeoutError,
    )
    assert.ok(Date.now() - t0 < 1500, `应在 ~500ms 超时, 实际 ${Date.now() - t0}ms`)
    await busy // 等事务完成，干净关闭
  })
})

describe('postgres pool connection recovery (real database)', () => {
  const cfg = parseDbUrl(DB_URL)

  it('kills its own connection mid-transaction and recovers', async () => {
    const pool = await PgPool.create({ ...cfg, poolSize: 1 })
    try {
      // 事务固定唯一连接——事务内杀自己，后续查询 reject
      await assert.rejects(
        pool.transaction(async (tx) => {
          const r = await tx.query('SELECT pg_backend_pid() AS pid')
          await tx.query('SELECT pg_terminate_backend($1)', [r[0].pid])
          await tx.query('SELECT 1') // 连接已断——应 reject
        }),
      )
      // 池应剔除坏连接、重建，并恢复服务
      const ok = await pool.query('SELECT 1 AS ok')
      assert.equal(ok[0].ok, 1)
    } finally {
      await pool.close()
    }
  })

  it('kills a pooled connection while another query is in flight', async () => {
    const pool = await PgPool.create({ ...cfg, poolSize: 2 })
    try {
      // 拿连接 A 的 pid，占用连接 B（事务），再杀 A
      const killer = await pool.query('SELECT pg_backend_pid() AS pid')
      const killedPid = killer[0].pid
      // 事务占用另一连接，事务内杀 A
      await pool
        .transaction(async (tx) => {
          const r = await tx.query('SELECT pg_backend_pid() AS pid')
          if (r[0].pid !== killedPid) {
            await tx.query('SELECT pg_terminate_backend($1)', [killedPid])
          }
          await tx.query('SELECT 1')
        })
        .catch(() => {})
      // 恢复服务
      const ok = await pool.query('SELECT 1 AS ok')
      assert.equal(ok[0].ok, 1)
    } finally {
      await pool.close()
    }
  })
})
