import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { PgConnection } from './connection.ts'
import { ConnectionError } from '../errors.ts'

// 内存 Postgres 服务器（进程内——零外部依赖；真实 PG v3 线协议交互保留）
import { MemoryPostgresServer } from '../postgres-server.ts'
const pgServer = new MemoryPostgresServer()
await pgServer.start()
const DB_URL = pgServer.url

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

describe('postgres connection (memory server)', () => {
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
    // 带密码的独立服务器——认证失败路径（客户端 SCRAM/MD5 握手被拒）
    const secure = new MemoryPostgresServer({ port: 0, password: 'secret' })
    await secure.start()
    try {
      const bad = new PgConnection({ ...parseDbUrl(secure.url), password: 'wrong-password' })
      await assert.rejects(() => bad.connect(), (e: unknown) => e instanceof ConnectionError)
    } finally {
      await secure.close()
    }
  })

  it('terminates cleanly on close', async () => {
    const c2 = new PgConnection(cfg)
    await c2.connect()
    await c2.close()
    assert.equal(c2.connected, false)
  })
})

describe('postgres parameterized queries (real database)', () => {
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

describe('postgres type mapping (real database)', () => {
  const cfg = parseDbUrl(DB_URL)
  let conn: PgConnection

  before(async () => {
    conn = new PgConnection(cfg)
    await conn.connect()
  })

  after(async () => {
    await conn.close()
  })

  it('jsonb column returns JS object (auto-parsed)', async () => {
    const rows = await conn.query(`SELECT '{"a": 1, "b": [2, 3]}'::jsonb AS j`)
    assert.deepEqual(rows[0].j, { a: 1, b: [2, 3] })
  })

  it('jsonb via parameterized round-trip', async () => {
    const tbl = `wf_typ_${process.pid}`
    await conn.query(`CREATE TABLE ${tbl} (id int, data jsonb)`)
    await conn.query(`INSERT INTO ${tbl} VALUES ($1, $2)`, [1, { title: 'Deck', slides: [1, 2] }])
    const rows = await conn.query(`SELECT data FROM ${tbl} WHERE id = $1`, [1])
    assert.deepEqual(rows[0].data, { title: 'Deck', slides: [1, 2] })
    await conn.query(`DROP TABLE ${tbl}`)
  })

  it('int columns return JS number', async () => {
    const rows = await conn.query('SELECT 42::int AS n, 7::bigint AS b')
    assert.equal(rows[0].n, 42)
    assert.equal(rows[0].b, 7)
  })

  it('boolean columns return JS boolean', async () => {
    const rows = await conn.query('SELECT true::boolean AS t, false::boolean AS f')
    assert.equal(rows[0].t, true)
    assert.equal(rows[0].f, false)
  })

  it('text/varchar stay as string', async () => {
    const rows = await conn.query("SELECT 'hello'::text AS s, 'x'::varchar AS v")
    assert.equal(rows[0].s, 'hello')
    assert.equal(rows[0].v, 'x')
  })

  it('float/numeric return number', async () => {
    const rows = await conn.query('SELECT 3.14::float8 AS f, 1.5::numeric AS n')
    assert.equal(rows[0].f, 3.14)
    assert.equal(Number(rows[0].n), 1.5)
  })

  it('null stays null', async () => {
    const rows = await conn.query('SELECT NULL::text AS x')
    assert.equal(rows[0].x, null)
  })

  it('uuid returns string', async () => {
    const rows = await conn.query(`SELECT '550e8400-e29b-41d4-a716-446655440000'::uuid AS u`)
    assert.equal(rows[0].u, '550e8400-e29b-41d4-a716-446655440000')
  })
})

describe('postgres transactions (real database)', () => {
  const cfg = parseDbUrl(DB_URL)
  let conn: PgConnection

  before(async () => {
    conn = new PgConnection(cfg)
    await conn.connect()
  })

  after(async () => {
    await conn.close()
  })

  it('commits on success', async () => {
    const tbl = `wf_tx1_${process.pid}`
    await conn.query(`CREATE TABLE ${tbl} (id int PRIMARY KEY, v text)`)
    await conn.transaction(async (tx) => {
      await tx.query(`INSERT INTO ${tbl} VALUES ($1, $2)`, [1, 'committed'])
    })
    const rows = await conn.query(`SELECT v FROM ${tbl} WHERE id = 1`)
    assert.equal(rows[0].v, 'committed')
    await conn.query(`DROP TABLE ${tbl}`)
  })

  it('rolls back on error', async () => {
    const tbl = `wf_tx2_${process.pid}`
    await conn.query(`CREATE TABLE ${tbl} (id int PRIMARY KEY, v text)`)
    await assert.rejects(
      () =>
        conn.transaction(async (tx) => {
          await tx.query(`INSERT INTO ${tbl} VALUES ($1, $2)`, [1, 'will-rollback'])
          throw new Error('boom')
        }),
      /boom/,
    )
    const rows = await conn.query(`SELECT count(*)::int AS n FROM ${tbl}`)
    assert.equal(rows[0].n, 0) // 回滚后无数据
    await conn.query(`DROP TABLE ${tbl}`)
  })

  it('sees own writes inside transaction', async () => {
    const tbl = `wf_tx3_${process.pid}`
    await conn.query(`CREATE TABLE ${tbl} (id int PRIMARY KEY, v text)`)
    await conn.transaction(async (tx) => {
      await tx.query(`INSERT INTO ${tbl} VALUES ($1, $2)`, [1, 'a'])
      const rows = await tx.query(`SELECT v FROM ${tbl} WHERE id = 1`)
      assert.equal(rows[0].v, 'a') // 事务内可见
    })
    await conn.query(`DROP TABLE ${tbl}`)
  })

  it('runs consecutive transactions', async () => {
    const tbl = `wf_tx4_${process.pid}`
    await conn.query(`CREATE TABLE ${tbl} (id int PRIMARY KEY, v text)`)
    for (let i = 0; i < 3; i++) {
      await conn.transaction(async (tx) => {
        await tx.query(`INSERT INTO ${tbl} VALUES ($1, $2)`, [i, `v${i}`])
      })
    }
    const rows = await conn.query(`SELECT count(*)::int AS n FROM ${tbl}`)
    assert.equal(rows[0].n, 3)
    await conn.query(`DROP TABLE ${tbl}`)
  })
})

describe('postgres precision boundaries (real database)', () => {
  const cfg = parseDbUrl(DB_URL)
  let conn: PgConnection

  before(async () => {
    conn = new PgConnection(cfg)
    await conn.connect()
  })

  after(async () => {
    await conn.close()
  })

  it('bigint within safe range returns number', async () => {
    const rows = await conn.query('SELECT 42::bigint AS n, 9007199254740991::bigint AS maxsafe')
    assert.equal(rows[0].n, 42)
    assert.equal(rows[0].maxsafe, 9007199254740991) // MAX_SAFE_INTEGER 仍 number
  })

  it('bigint beyond safe range returns string (no silent precision loss)', async () => {
    const rows = await conn.query('SELECT 9007199254740993::bigint AS big')
    assert.equal(rows[0].big, '9007199254740993') // string，不丢精度
  })

  it('negative bigint beyond safe range returns string', async () => {
    const rows = await conn.query('SELECT (-9007199254740993)::bigint AS n')
    assert.equal(rows[0].n, '-9007199254740993')
  })

  it('int4 always number (safe by construction)', async () => {
    const rows = await conn.query('SELECT 2147483647::int AS n')
    assert.equal(rows[0].n, 2147483647)
  })
})

describe('postgres statement_timeout (real database)', { skip: process.env.REAL_DB ? false : '真库引擎特性——内存服务器诚实裁剪（REAL_DB=1 连真库）' }, () => {
  it('kills slow queries after timeout', async () => {
    const cfg2 = parseDbUrl(DB_URL)
    const conn = new PgConnection({ ...cfg2, statementTimeoutMs: 200 })
    await conn.connect()
    const t0 = Date.now()
    await assert.rejects(
      () => conn.query('SELECT pg_sleep(2)'),
      (e: unknown) => {
        return e instanceof Error && (e as any).code === '57014' // query_canceled
      },
    )
    assert.ok(Date.now() - t0 < 1500, `应在 ~200ms 超时, 实际 ${Date.now() - t0}ms`)
    await conn.close()
  })

  it('fast queries unaffected', async () => {
    const cfg2 = parseDbUrl(DB_URL)
    const conn = new PgConnection({ ...cfg2, statementTimeoutMs: 200 })
    await conn.connect()
    const rows = await conn.query('SELECT 1::int AS one')
    assert.equal(rows[0].one, 1)
    await conn.close()
  })

  it('connection usable after timeout kill', async () => {
    const cfg2 = parseDbUrl(DB_URL)
    const conn = new PgConnection({ ...cfg2, statementTimeoutMs: 200 })
    await conn.connect()
    await assert.rejects(() => conn.query('SELECT pg_sleep(2)'))
    const rows = await conn.query('SELECT 2::int AS two') // 超时后连接仍可用
    assert.equal(rows[0].two, 2)
    await conn.close()
  })
})

describe('postgres prepare cache DDL recovery (real database)', { skip: process.env.REAL_DB ? false : '真库引擎特性——内存服务器诚实裁剪（REAL_DB=1 连真库）' }, () => {
  const cfg = parseDbUrl(DB_URL)
  let conn: PgConnection

  before(async () => {
    conn = new PgConnection(cfg)
    await conn.connect()
  })

  after(async () => {
    await conn.close()
  })

  it('re-prepares after DROP + CREATE (cached statement invalidation)', async () => {
    const tbl = `wf_prep_${process.pid}`
    await conn.query(`CREATE TABLE ${tbl} (id int, v text)`)
    // 首次执行 → prepare 缓存
    const r1 = await conn.query(`SELECT v FROM ${tbl} WHERE id = $1`, [1])
    assert.deepEqual(r1, [])
    // DROP + CREATE（statement 服务器端失效）
    await conn.query(`DROP TABLE ${tbl}`)
    await conn.query(`CREATE TABLE ${tbl} (id int, v text)`)
    await conn.query(`INSERT INTO ${tbl} VALUES (1, 'ok')`)
    // 同 SQL 再执行——应自动重准备（而非报 cached plan 错误）
    const r2 = await conn.query(`SELECT v FROM ${tbl} WHERE id = $1`, [1])
    assert.equal(r2[0].v, 'ok')
    await conn.query(`DROP TABLE ${tbl}`)
  })

  it('DDL 类型失效恢复：DROP TYPE 后重 Parse（cached plan / type cache 错误自愈）', async () => {
    const tbl = `wf_t_${process.pid}`
    const typ = `wf_e_${process.pid}`
    // 建 enum + 表 → prepare 缓存（结果列引用 enum OID）
    await conn.query(`DROP TABLE IF EXISTS ${tbl} CASCADE`)
    await conn.query(`DROP TYPE IF EXISTS ${typ} CASCADE`)
    await conn.query(`CREATE TYPE ${typ} AS ENUM ('a','b')`)
    await conn.query(`CREATE TABLE ${tbl} (id int, v ${typ})`)
    await conn.query(`INSERT INTO ${tbl} VALUES (1, 'a')`)
    const r1 = await conn.query(`SELECT id, v FROM ${tbl} WHERE id = $1`, [1])
    assert.equal(r1[0].v, 'a')

    // DROP 表 + 类型（服务器缓存语句引用已删 OID → 硬错误 cached plan/type cache）
    await conn.query(`DROP TABLE ${tbl} CASCADE`)
    await conn.query(`DROP TYPE ${typ} CASCADE`)
    // 重建（新 enum 获得新 OID——结果类型变化触发服务器拒绝缓存语句）
    await conn.query(`CREATE TYPE ${typ} AS ENUM ('a','b')`)
    await conn.query(`CREATE TABLE ${tbl} (id int, v ${typ})`)
    await conn.query(`INSERT INTO ${tbl} VALUES (1, 'b')`)

    // 同 SQL 再执行——客户端应自愈（清缓存 + 新语句名重 Parse）而非报错
    const r2 = await conn.query(`SELECT id, v FROM ${tbl} WHERE id = $1`, [1])
    assert.equal(r2[0].v, 'b')
    // 连接仍可用（状态机未卡死）
    const r3 = await conn.query(`SELECT 1::int AS one`)
    assert.equal(r3[0].one, 1)

    await conn.query(`DROP TABLE IF EXISTS ${tbl} CASCADE`)
    await conn.query(`DROP TYPE IF EXISTS ${typ} CASCADE`)
  })
})

describe('postgres statement lifecycle + affectedRows (real database)', { skip: process.env.REAL_DB ? false : '真库引擎特性——内存服务器诚实裁剪（REAL_DB=1 连真库）' }, () => {
  const cfg = parseDbUrl(DB_URL)
  let conn: PgConnection

  before(async () => {
    conn = new PgConnection(cfg)
    await conn.connect()
  })

  after(async () => {
    await conn.close()
  })

  it('LRU 淘汰的 prepared statement 服务端同步释放（DEALLOCATE，无泄漏）', async () => {
    // PREPARED_MAX=128——执行 130 个不同 SQL，服务端命名 statement 应 ≤ 128
    for (let i = 0; i < 130; i++) {
      await conn.query(`SELECT $1::int AS v WHERE $1 = ${i}`, [i])
    }
    const r = await conn.query(
      `SELECT count(*)::int AS n FROM pg_prepared_statements WHERE name LIKE 'wf_s%'`,
    )
    assert.ok(Number(r[0].n) <= 128, `服务端命名 statement 泄漏: ${r[0].n} 个（应 ≤ 128）`)
  })

  it('affectedRows: INSERT 返回插入行数', async () => {
    const tbl = `wf_aff_${process.pid}`
    await conn.query(`CREATE TABLE ${tbl} (id int PRIMARY KEY, v text)`)
    try {
      const rows = await conn.query(`INSERT INTO ${tbl} VALUES ($1, $2)`, [1, 'a'])
      assert.equal(rows.affectedRows, 1)
      await conn.query(`INSERT INTO ${tbl} VALUES ($1, $2), ($3, $4)`, [2, 'b', 3, 'c'])
      const r2 = await conn.query(`SELECT count(*)::int AS n FROM ${tbl}`)
      assert.equal(r2[0].n, 3)
    } finally {
      await conn.query(`DROP TABLE ${tbl}`)
    }
  })

  it('affectedRows: UPDATE 返回实际修改行数', async () => {
    const tbl = `wf_affu_${process.pid}`
    await conn.query(`CREATE TABLE ${tbl} (id int PRIMARY KEY, v text)`)
    try {
      await conn.query(`INSERT INTO ${tbl} VALUES (1, 'a'), (2, 'b'), (3, 'c')`)
      const rows = await conn.query(`UPDATE ${tbl} SET v = $1 WHERE id >= $2`, ['x', 2])
      assert.equal(rows.affectedRows, 2)
      // 无匹配行 → 0
      const zero = await conn.query(`UPDATE ${tbl} SET v = $1 WHERE id = $2`, ['y', 999])
      assert.equal(zero.affectedRows, 0)
    } finally {
      await conn.query(`DROP TABLE ${tbl}`)
    }
  })

  it('affectedRows: DELETE 返回删除行数；SELECT 无 affectedRows', async () => {
    const tbl = `wf_affd_${process.pid}`
    await conn.query(`CREATE TABLE ${tbl} (id int PRIMARY KEY)`)
    try {
      await conn.query(`INSERT INTO ${tbl} VALUES (1), (2), (3)`)
      const del = await conn.query(`DELETE FROM ${tbl} WHERE id < $1`, [3])
      assert.equal(del.affectedRows, 2)
      const sel = await conn.query(`SELECT * FROM ${tbl}`)
      assert.equal(sel.affectedRows, undefined) // SELECT 不产生行数 tag
    } finally {
      await conn.query(`DROP TABLE ${tbl}`)
    }
  })
})

describe('postgres timestamp mapping (real database)', { skip: process.env.REAL_DB ? false : '真库引擎特性——内存服务器诚实裁剪（REAL_DB=1 连真库）' }, () => {
  const cfg = parseDbUrl(DB_URL)
  let conn: PgConnection

  before(async () => {
    conn = new PgConnection(cfg)
    await conn.connect()
  })

  after(async () => {
    await conn.close()
  })

  it('timestamptz → Date（带时区语义安全：ISO 解析无本地时区魔法）', async () => {
    const rows = await conn.query(
      `SELECT '2024-06-01 10:30:00+00'::timestamptz AS t`,
    )
    assert.ok(rows[0].t instanceof Date, `期望 Date，实际 ${typeof rows[0].t}`)
    assert.equal(rows[0].t.toISOString(), '2024-06-01T10:30:00.000Z')
  })

  it('timestamptz NOW() → Date', async () => {
    const rows = await conn.query(`SELECT NOW() AS now`)
    assert.ok(rows[0].now instanceof Date)
    // 与当前时间接近（±5s）
    const diff = Math.abs(Date.now() - rows[0].now.getTime())
    assert.ok(diff < 5000, `NOW() 与本地时钟偏差 ${diff}ms`)
  })

  it('timestamp（无时区）→ 保持字符串（转 Date 按本地时区解析 = 时区魔法）', async () => {
    const rows = await conn.query(`SELECT '2024-06-01 10:30:00'::timestamp AS t`)
    assert.equal(typeof rows[0].t, 'string')
    assert.equal(rows[0].t, '2024-06-01 10:30:00')
  })

  it('date → 保持字符串（避免午夜/UTC 边界魔法）', async () => {
    const rows = await conn.query(`SELECT '2024-06-01'::date AS d`)
    assert.equal(typeof rows[0].d, 'string')
  })

  it('timestamptz NULL → null', async () => {
    const rows = await conn.query(`SELECT NULL::timestamptz AS t`)
    assert.equal(rows[0].t, null)
  })

  it('timestamptz 参数化写入后再读出（round-trip 保真）', async () => {
    const tbl = `wf_ts_${process.pid}`
    await conn.query(`CREATE TABLE ${tbl} (id int, created_at timestamptz)`)
    try {
      const d = new Date('2024-06-01T10:30:00.000Z')
      await conn.query(`INSERT INTO ${tbl} VALUES ($1, $2)`, [1, d.toISOString()])
      const rows = await conn.query(`SELECT created_at FROM ${tbl} WHERE id = $1`, [1])
      assert.ok(rows[0].created_at instanceof Date)
      assert.equal(rows[0].created_at.toISOString(), '2024-06-01T10:30:00.000Z')
    } finally {
      await conn.query(`DROP TABLE ${tbl}`)
    }
  })
})

after(async () => {
  await pgServer.close()
})
