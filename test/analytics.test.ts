import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '../types.ts'
import { analytics } from '../analytics.ts'

describe('analytics', () => {
  const ctx = { params: {}, query: {} } as Context

  it('records page views in memory', async () => {
    const a = analytics()
    const m = a.middleware()

    for (let i = 0; i < 3; i++) {
      await m(new Request('http://localhost/tools/uppercase'), ctx, async () => new Response('ok'))
    }
    await m(new Request('http://localhost/tools/json-formatter'), ctx, async () => new Response('ok'))

    const dataRes = await a.handler()(new Request('http://localhost/__analytics/data?days=7'), ctx)
    const data = await dataRes.json() as any
    assert.equal(data.total_pv, 4)
    assert.equal(data.top_pages[0].path, '/tools/uppercase')
    assert.equal(data.top_pages[0].pv, 3)
    assert.equal(data.top_pages[1].path, '/tools/json-formatter')
    assert.equal(data.top_pages[1].pv, 1)
  })

  it('excludes internal paths', async () => {
    const a = analytics()
    const m = a.middleware()
    await m(new Request('http://localhost/__analytics/data'), ctx, async () => new Response('ok'))
    await m(new Request('http://localhost/__wfw/style.a1b2c3.css'), ctx, async () => new Response('ok'))
    await m(new Request('http://localhost/static/foo.js'), ctx, async () => new Response('ok'))

    const data = await a.handler()(new Request('http://localhost/__analytics/data?days=7'), ctx).then(r2 => r2.json()) as any
    assert.equal(data.total_pv, 0)
  })

  it('records referrer domain', async () => {
    const a = analytics()
    const m = a.middleware()
    await m(new Request('http://localhost/tools/a', { headers: { Referer: 'https://google.com/search?q=test' } }), ctx, async () => new Response('ok'))

    const data = await a.handler()(new Request('http://localhost/__analytics/data?days=7'), ctx).then(r2 => r2.json()) as any
    assert.equal(data.referrers.length, 1)
    assert.equal(data.referrers[0].domain, 'google.com')
    assert.equal(data.referrers[0].count, 1)
  })

  it('detects mobile user-agent', async () => {
    const a = analytics()
    const m = a.middleware()
    await m(new Request('http://localhost/page', { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)' } }), ctx, async () => new Response('ok'))

    const data = await a.handler()(new Request('http://localhost/__analytics/data?days=7'), ctx).then(r2 => r2.json()) as any
    assert.equal(data.devices.mobile, 100)
    assert.equal(data.devices.desktop, 0)
  })

  it('dashboard page returns HTML', async () => {
    const a = analytics()
    const m = a.middleware()
    await m(new Request('http://localhost/test'), ctx, async () => new Response('ok'))

    const res = await a.handler()(new Request('http://localhost/__analytics'), ctx)
    assert.equal(res.status, 200)
    const html = await res.text()
    assert.match(html, /<title>Analytics/)
    assert.match(html, /Page Views/)
  })

  it('uses custom excluded paths', async () => {
    const a = analytics({ excluded: ['/private'] })
    const m = a.middleware()
    await m(new Request('http://localhost/private'), ctx, async () => new Response('ok'))
    await m(new Request('http://localhost/public'), ctx, async () => new Response('ok'))

    const data = await a.handler()(new Request('http://localhost/__analytics/data?days=7'), ctx).then(r => r.json()) as any
    assert.equal(data.total_pv, 1)
    assert.equal(data.top_pages[0].path, '/public')
  })

  it('strips www. from referrer domain', async () => {
    const a = analytics()
    const m = a.middleware()
    await m(new Request('http://localhost/page', { headers: { Referer: 'https://www.example.com/page' } }), ctx, async () => new Response('ok'))

    const data = await a.handler()(new Request('http://localhost/__analytics/data?days=7'), ctx).then(r => r.json()) as any
    assert.equal(data.referrers[0].domain, 'example.com')
  })

  it('clamps days parameter below 1', async () => {
    const a = analytics()
    const m = a.middleware()
    await m(new Request('http://localhost/page'), ctx, async () => new Response('ok'))

    const data = await a.handler()(new Request('http://localhost/__analytics/data?days=0'), ctx).then(r => r.json()) as any
    assert.equal(data.total_pv, 1)
  })

  it('clamps days parameter above 365', async () => {
    const a = analytics()
    const m = a.middleware()
    await m(new Request('http://localhost/page'), ctx, async () => new Response('ok'))

    const data = await a.handler()(new Request('http://localhost/__analytics/data?days=999'), ctx).then(r => r.json()) as any
    assert.equal(data.total_pv, 1)
  })

  it('falls back to 7 days for non-numeric days', async () => {
    const a = analytics()
    const m = a.middleware()
    await m(new Request('http://localhost/page'), ctx, async () => new Response('ok'))

    const data = await a.handler()(new Request('http://localhost/__analytics/data?days=abc'), ctx).then(r => r.json()) as any
    assert.equal(data.total_pv, 1)
  })

  it('returns analytics without referrers section when empty', async () => {
    const a = analytics()
    const m = a.middleware()
    await m(new Request('http://localhost/page'), ctx, async () => new Response('ok'))

    const data = await a.handler()(new Request('http://localhost/__analytics/data?days=7'), ctx).then(r => r.json()) as any
    assert.equal(data.referrers.length, 0)
  })

  it('close() is callable', async () => {
    const a = analytics()
    const m = a.middleware()
    await m(new Request('http://localhost/page'), ctx, async () => new Response('ok'))
    await a.close()
  })
})
