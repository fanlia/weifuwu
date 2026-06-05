import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '../types.ts'
import { analytics } from '../analytics.ts'

describe('analytics', () => {
  it('records page views in memory', async () => {
    const r = analytics()
    const ctx = { params: {}, query: {} } as Context

    // Simulate multiple visits
    for (let i = 0; i < 3; i++) {
      await r.handler()(
        new Request('http://localhost/tools/uppercase'),
        ctx,
        async () => new Response('ok'),
      )
    }
    await r.handler()(
      new Request('http://localhost/tools/json-formatter'),
      ctx,
      async () => new Response('ok'),
    )

    // Query data
    const dataRes = await r.handler()(
      new Request('http://localhost/__analytics/data?days=7'),
      ctx,
    )
    const data = await dataRes.json() as any

    assert.equal(data.total_pv, 4)
    assert.equal(data.top_pages.length, 2)
    assert.equal(data.top_pages[0].path, '/tools/uppercase')
    assert.equal(data.top_pages[0].pv, 3)
    assert.equal(data.top_pages[1].path, '/tools/json-formatter')
    assert.equal(data.top_pages[1].pv, 1)
  })

  it('excludes internal paths', async () => {
    const r = analytics()
    const ctx = { params: {}, query: {} } as Context

    await r.handler()(
      new Request('http://localhost/__analytics/data'),
      ctx,
      async () => new Response('ok'),
    )
    await r.handler()(
      new Request('http://localhost/__wfw/style.css'),
      ctx,
      async () => new Response('ok'),
    )

    const dataRes = await r.handler()(
      new Request('http://localhost/__analytics/data?days=7'),
      ctx,
    )
    const data = await dataRes.json() as any
    assert.equal(data.total_pv, 0)
  })

  it('records referrer domain', async () => {
    const r = analytics()
    const ctx = { params: {}, query: {} } as Context

    await r.handler()(
      new Request('http://localhost/tools/a', { headers: { Referer: 'https://google.com/search?q=test' } }),
      ctx,
      async () => new Response('ok'),
    )

    const dataRes = await r.handler()(
      new Request('http://localhost/__analytics/data?days=7'),
      ctx,
    )
    const data = await dataRes.json() as any
    assert.equal(data.referrers.length, 1)
    assert.equal(data.referrers[0].domain, 'google.com')
    assert.equal(data.referrers[0].count, 1)
  })

  it('detects mobile user-agent', async () => {
    const r = analytics()
    const ctx = { params: {}, query: {} } as Context

    await r.handler()(
      new Request('http://localhost/page', { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)' } }),
      ctx,
      async () => new Response('ok'),
    )

    const dataRes = await r.handler()(
      new Request('http://localhost/__analytics/data?days=7'),
      ctx,
    )
    const data = await dataRes.json() as any
    assert.equal(data.devices.mobile, 100)
    assert.equal(data.devices.desktop, 0)
  })

  it('dashboard page returns HTML', async () => {
    const r = analytics()
    const ctx = { params: {}, query: {} } as Context

    await r.handler()(
      new Request('http://localhost/test'),
      ctx,
      async () => new Response('ok'),
    )

    const res = await r.handler()(
      new Request('http://localhost/analytics'),
      ctx,
    )
    assert.equal(res.status, 200)
    const html = await res.text()
    assert.match(html, /<title>Analytics/)
    assert.match(html, /Page Views/)
  })

  it('returns 404 for unknown routes', async () => {
    const r = analytics()
    const ctx = { params: {}, query: {} } as Context
    const res = await r.handler()(
      new Request('http://localhost/unknown'),
      ctx,
    )
    assert.equal(res.status, 404)
  })
})
