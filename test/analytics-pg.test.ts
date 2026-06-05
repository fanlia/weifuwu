import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from '../postgres/index.ts'
import { analytics } from '../analytics.ts'
import type { Context } from '../types.ts'

describe('analytics with PostgreSQL', { skip: !process.env.DATABASE_URL && true }, () => {
  let pg: ReturnType<typeof postgres>
  let cleanup: () => void

  before(async () => {
    pg = postgres()
    cleanup = () => pg.close()
    // ensure table exists before all tests
    const a = analytics({ pg })
    await a.migrate()
  })

  beforeEach(async () => {
    // clear data between tests, keep table structure
    await pg.sql`TRUNCATE __analytics`
  })

  after(() => cleanup?.())

  it('migrate is idempotent', async () => {
    const a = analytics({ pg })
    // calling migrate again should not throw
    await a.migrate()
    const res = await pg.sql`
      SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '__analytics') as exists
    ` as any[]
    assert.equal(res[0].exists, true)
  })

  it('records and queries page views', async () => {
    const a = analytics({ pg })
    const ctx = { params: {}, query: {} } as Context
    const m = a.middleware()

    for (let i = 0; i < 3; i++) {
      await m(new Request('http://localhost/tools/uppercase'), ctx, async () => new Response('ok'))
    }
    await m(new Request('http://localhost/tools/json-formatter'), ctx, async () => new Response('ok'))

    const r = a.router()
    const dataRes = await r.handler()(new Request('http://localhost/__analytics/data?days=7'), ctx)
    const data = await dataRes.json() as any
    assert.equal(data.total_pv, 4)
    assert.equal(data.top_pages[0].path, '/tools/uppercase')
    assert.equal(data.top_pages[0].pv, 3)
    assert.equal(data.top_pages[1].path, '/tools/json-formatter')
    assert.equal(data.top_pages[1].pv, 1)
    assert.equal(data.daily.length, 1)
    assert.equal(data.daily[0].pv, 4)
  })

  it('survives restart (persistent data)', async () => {
    const a1 = analytics({ pg })
    const ctx = { params: {}, query: {} } as Context
    await a1.middleware()(new Request('http://localhost/page-a'), ctx, async () => new Response('ok'))

    const a2 = analytics({ pg })
    const r = a2.router()
    const dataRes = await r.handler()(new Request('http://localhost/__analytics/data?days=7'), ctx)
    const data = await dataRes.json() as any
    assert.ok(data.total_pv >= 1)
    assert.ok(data.top_pages.some((p: any) => p.path === '/page-a'))
  })

  it('dashboard page returns HTML', async () => {
    const a = analytics({ pg })
    await a.middleware()(new Request('http://localhost/test'), { params: {}, query: {} } as Context, async () => new Response('ok'))

    const r = a.router()
    const res = await r.handler()(new Request('http://localhost/analytics'), { params: {}, query: {} } as Context)
    assert.equal(res.status, 200)
    const html = await res.text()
    assert.match(html, /<title>Analytics/)
    assert.match(html, /Page Views/)
  })
})
