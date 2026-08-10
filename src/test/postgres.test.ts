import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { postgres } from '../postgres/index.ts'
import { HttpError } from '../types.ts'
import { Router } from '../core/router.ts'

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
    await pg.transaction(async (sql) => {
      await sql`INSERT INTO __test_items (name) VALUES ('tx-commit')`
    })
    const rows = await pg.sql`SELECT * FROM __test_items WHERE name = 'tx-commit'`
    assert.equal(rows.length, 1)
  })

  it('transaction rolls back on error', async () => {
    try {
      await pg.transaction(async (sql) => {
        await sql`INSERT INTO __test_items (name) VALUES ('tx-rollback')`
        throw new Error('abort')
      })
    } catch {}
    const rows = await pg.sql`SELECT * FROM __test_items WHERE name = 'tx-rollback'`
    assert.equal(rows.length, 0)
  })
})

describe('postgres ctx.sql nested fragments (agent-platform pattern)', () => {
  const pg2 = postgres()

  before(async () => {
    await pg2.sql`DROP TABLE IF EXISTS wf_cfrag_a`
    await pg2.sql`CREATE TABLE wf_cfrag_a (id int PRIMARY KEY, tenant int, type text)`
    await pg2.sql`INSERT INTO wf_cfrag_a VALUES (1, 10, 'ai'), (2, 10, 'user'), (3, 20, 'ai')`
  })

  after(async () => {
    await pg2.sql`DROP TABLE IF EXISTS wf_cfrag_a`
    await pg2.close()
  })

  it('nested conditional fragment via ctx.sql', async () => {
    const type = 'ai'
    const rows = await pg2.sql`
      SELECT id FROM wf_cfrag_a WHERE tenant = ${10}
      ${type ? pg2.sql`AND type = ${type}` : pg2.sql``}
    `
    assert.deepEqual(rows.map((r: any) => r.id), [1])
  })

  it('empty nested fragment (no filter)', async () => {
    const type = null
    const rows = await pg2.sql`
      SELECT id FROM wf_cfrag_a WHERE tenant = ${20}
      ${type ? pg2.sql`AND type = ${type}` : pg2.sql``}
    `
    assert.deepEqual(rows.map((r: any) => r.id), [3])
  })
})

describe('postgres error mapping to HttpError (ctx.sql)', () => {
  const pg3 = postgres()

  before(async () => {
    await pg3.sql`DROP TABLE IF EXISTS wf_uniq_a`
    await pg3.sql`CREATE TABLE wf_uniq_a (email text PRIMARY KEY)`
  })

  after(async () => {
    await pg3.sql`DROP TABLE IF EXISTS wf_fk_a`
    await pg3.sql`DROP TABLE IF EXISTS wf_uniq_a`
    await pg3.close()
  })

  it('unique violation → HttpError 409', async () => {
    await pg3.sql`INSERT INTO wf_uniq_a VALUES (${'dup@x.com'})`
    await assert.rejects(
      () => pg3.sql`INSERT INTO wf_uniq_a VALUES (${'dup@x.com'})`,
      (e: unknown) => e instanceof HttpError && (e as HttpError).status === 409,
    )
  })

  it('foreign key violation → HttpError 400', async () => {
    await pg3.sql`DROP TABLE IF EXISTS wf_fk_a`
    await pg3.sql`CREATE TABLE wf_fk_a (email text REFERENCES wf_uniq_a(email))`
    await assert.rejects(
      () => pg3.sql`INSERT INTO wf_fk_a VALUES (${'nonexistent@x.com'})`,
      (e: unknown) => e instanceof HttpError && (e as HttpError).status === 400,
    )
  })

  it('non-mapped errors pass through unchanged', async () => {
    await assert.rejects(
      () => pg3.sql`SELECT * FROM wf_no_such_table_xyz`,
      (e: unknown) => e instanceof Error && (e as any).code === '42P01',
    )
  })
})

describe('postgres middleware option passthrough (real database)', () => {
  it('statementTimeoutMs kills slow query via ctx.sql', async () => {
    const pg = postgres({ connection: process.env.DATABASE_URL, max: 1, statementTimeoutMs: 200 })
    const { sql } = pg
    try {
      await assert.rejects(
        sql`SELECT pg_sleep(2)`,
        (e) => (e as { code?: string }).code === '57014', // query_canceled
      )
      // 超时后连接仍可用
      const ok = await sql`SELECT 1 AS ok`
      assert.equal(ok[0].ok, 1)
    } finally {
      await sql.close()
    }
  })

  it('onQuery hook receives query telemetry', async () => {
    const calls: string[] = []
    const pg = postgres({
      connection: process.env.DATABASE_URL,
      max: 1,
      onQuery: (q, dur, rows) => calls.push(`${q.slice(0, 12)}|${dur >= 0}|${rows}`),
    })
    const { sql } = pg
    try {
      await sql`SELECT 1 AS ok`
      assert.ok(calls.length >= 1)
      assert.match(calls[0], /SELECT 1|ok/)
    } finally {
      await sql.close()
    }
  })

  it('acquireTimeoutMs rejects when pool exhausted', async () => {
    const pg = postgres({ connection: process.env.DATABASE_URL, max: 1, acquireTimeoutMs: 300 })
    const { sql } = pg
    try {
      // 事务占用唯一连接
      const tx = pg.transaction(async (sql) => {
        await sql`SELECT pg_sleep(1)`
      })
      await new Promise((r) => setTimeout(r, 50))
      await assert.rejects(sql`SELECT 1`)
      await tx
    } finally {
      await sql.close()
    }
  })
})

describe('postgres traceId propagation (x-trace-id → ALS → onQuery)', () => {
  function startServer(app: Router): Promise<any> {
    return new Promise((resolve) => {
      const server = createServer((req, res) => {
        app
          .handler()(new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers as any }), { params: {}, query: {} })
          .then((r: any) => {
            res.writeHead(r.status, { 'content-type': 'application/json' })
            res.end(JSON.stringify(r.body ?? ''))
          })
          .catch(() => {
            res.writeHead(500)
            res.end()
          })
      })
      server.listen(0, () => resolve(server))
    })
  }

  it('onQuery 第 4 参数收到请求级 traceId（x-trace-id 头）', async () => {
    const calls: (string | undefined)[] = []
    const pg = postgres({
      connection: process.env.DATABASE_URL,
      max: 1,
      onQuery: (_q, _d, _r, tid) => calls.push(tid),
    })
    const app = new Router()
    app.use(pg)
    app.get('/trace', async (_req, ctx) => {
      await ctx.sql`SELECT 1 AS ok`
      return new Response('ok')
    })
    const server = await startServer(app)
    const port = (server.address() as any).port
    try {
      await fetch(`http://localhost:${port}/trace`, { headers: { 'x-trace-id': 'trace-aaa' } })
      await fetch(`http://localhost:${port}/trace`, { headers: { 'x-trace-id': 'trace-bbb' } })
      const last2 = calls.slice(-2)
      assert.deepEqual(last2, ['trace-aaa', 'trace-bbb'])
    } finally {
      server.close()
      await pg.close()
    }
  })

  it('无 x-trace-id 头 → onQuery 第 4 参数为 undefined（不注入空串）', async () => {
    const calls: (string | undefined)[] = []
    const pg = postgres({
      connection: process.env.DATABASE_URL,
      max: 1,
      onQuery: (_q, _d, _r, tid) => calls.push(tid),
    })
    const app = new Router()
    app.use(pg)
    app.get('/plain', async (_req, ctx) => {
      await ctx.sql`SELECT 1 AS ok`
      return new Response('ok')
    })
    const server = await startServer(app)
    const port = (server.address() as any).port
    try {
      await fetch(`http://localhost:${port}/plain`)
      assert.equal(calls.at(-1), undefined)
    } finally {
      server.close()
      await pg.close()
    }
  })
})
