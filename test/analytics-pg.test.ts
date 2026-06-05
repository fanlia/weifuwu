import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from '../postgres/index.ts'
import { analytics } from '../analytics.ts'
import type { Context } from '../types.ts'

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://root:123456@localhost:5432/demo'

describe('analytics with PostgreSQL', { skip: !process.env.DATABASE_URL && true }, () => {
  let pg: ReturnType<typeof postgres>
  let cleanup: () => void

  before(async () => {
    pg = postgres({ connectionString: DATABASE_URL })
    cleanup = () => pg.close()
  })

  after(() => cleanup?.())

  it('migrate creates the table', async () => {
    const a = analytics({ pg })
    await a.migrate!()

    // Verify table exists
    const res = await pg.sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = '__analytics'
      ) as exists
    ` as any[]
    assert.equal(res[0].exists, true)
  })

  it('records and queries page views', async () => {
    const a = analytics({ pg })
    const ctx = { params: {}, query: {} } as Context

    for (let i = 0; i < 3; i++) {
      await a.middleware(
        new Request('http://localhost/tools/uppercase'),
        ctx,
        async () => new Response('ok'),
      )
    }
    await a.middleware(
      new Request('http://localhost/tools/json-formatter'),
      ctx,
      async () => new Response('ok'),
    )

    const dataRes = await a.handler(new Request('http://localhost/__analytics/data?days=7'))
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

    await a1.middleware(
      new Request('http://localhost/page-a'),
      ctx,
      async () => new Response('ok'),
    )

    // Create a new analytics instance with same pg — data should persist
    const a2 = analytics({ pg })
    const dataRes = await a2.handler(new Request('http://localhost/__analytics/data?days=7'))
    const data = await dataRes.json() as any
    assert.ok(data.total_pv >= 1)
    assert.ok(data.top_pages.some((p: any) => p.path === '/page-a'))
  })

  it('dashboard page returns HTML', async () => {
    const a = analytics({ pg })
    const res = await a.handler(new Request('http://localhost/analytics'))
    assert.equal(res.status, 200)
    const html = await res.text()
    assert.match(html, /<title>Analytics/)
    assert.match(html, /Page Views/)
  })
})
