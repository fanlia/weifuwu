/**
 * weifuwu/client api middleware — HTTP 客户端测试
 */

import { describe, it, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

before(() => {
  if (typeof document !== 'undefined') return
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost',
    pretendToBeVisual: true,
  })
  const win = dom.window as any
  const g = globalThis as any
  for (const key of Object.getOwnPropertyNames(win)) {
    if (key === 'Object' || key === 'Array' || key === 'Function' ||
        key === 'String' || key === 'Number' || key === 'Boolean' ||
        key === 'Symbol' || key === 'Map' || key === 'Set' ||
        key === 'RegExp' || key === 'Promise' || key === 'Error' ||
        key === 'Date' || key === 'Math' || key === 'JSON' ||
        key === 'parseInt' || key === 'parseFloat' ||
        key === 'isNaN' || key === 'isFinite' ||
        key === 'undefined' || key === 'NaN' || key === 'Infinity') continue
    if (typeof g[key] === 'undefined') {
      try { g[key] = win[key] } catch { /* read-only, skip */ }
    }
  }
})

const { api, ApiError } = await import('../../client/middleware/api.ts')
import type { ApiClient } from '../../client/middleware/api.ts'

// ── fetch mock ──────────────────────────────────────────────

let fetchCalls: Array<{ url: string; init: RequestInit }> = []
let mockResponse: (url: string, init: RequestInit) => Response = () => new Response('{}', {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
})

beforeEach(() => {
  fetchCalls = []
  globalThis.fetch = ((url: string, init: RequestInit) => {
    fetchCalls.push({ url, init })
    return Promise.resolve(mockResponse(url, init))
  }) as typeof globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = undefined as any
})

function createClient(opts?: Parameters<typeof api>[0]): ApiClient {
  const ctx = api(opts)({ route: {} as any, app: { navigate() {} }, provide() {}, inject() { return null }, ws: null as any })
  return (ctx as any).api
}

describe('api', () => {
  it('injects ctx.api', () => {
    const ctx = { route: {} as any, app: { navigate() {} }, provide() {}, inject() { return null }, ws: null as any }
    const result = api()(ctx) as any
    assert.ok(result.api)
    assert.equal(typeof result.api.get, 'function')
    assert.equal(typeof result.api.post, 'function')
    assert.equal(typeof result.api.put, 'function')
    assert.equal(typeof result.api.delete, 'function')
  })

  it('GET 请求', async () => {
    mockResponse = () => new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
    const client = createClient()
    const result = await client.get('/users')
    assert.deepEqual(result, { ok: true })
  })

  it('GET 拼接 baseURL', async () => {
    const client = createClient({ baseURL: '/api' })
    await client.get('/users')
    assert.equal(fetchCalls[0].url, '/api/users')
  })

  it('POST 序列化 body 为 JSON', async () => {
    const client = createClient()
    await client.post('/items', { name: 'test' })
    assert.equal(fetchCalls[0].init.method, 'POST')
    assert.equal(fetchCalls[0].init.body, JSON.stringify({ name: 'test' }))
    assert.equal((fetchCalls[0].init.headers as any)['Content-Type'], 'application/json')
  })

  it('PUT / PATCH / DELETE', async () => {
    const client = createClient()
    await client.put('/items/1', { val: 1 })
    assert.equal(fetchCalls[0].init.method, 'PUT')
    await client.patch('/items/1', { val: 2 })
    assert.equal(fetchCalls[1].init.method, 'PATCH')
    await client.delete('/items/1')
    assert.equal(fetchCalls[2].init.method, 'DELETE')
  })

  it('非 200 响应抛出 ApiError', async () => {
    mockResponse = () => new Response('not found', { status: 404 })
    const client = createClient()
    try {
      await client.get('/missing')
      assert.fail('should throw')
    } catch (e) {
      assert.ok(e instanceof ApiError)
      assert.equal((e as ApiError).status, 404)
      assert.ok((e as ApiError).body.includes('not found'))
    }
  })

  it('204 No Content 返回 undefined', async () => {
    mockResponse = () => new Response(null, { status: 204 })
    const client = createClient()
    const result = await client.delete('/item')
    assert.equal(result, undefined)
  })

  it('自定义 headers', async () => {
    const client = createClient({ headers: { Authorization: 'Bearer token' } })
    await client.get('/me')
    assert.equal((fetchCalls[0].init.headers as any)['Authorization'], 'Bearer token')
  })

  it('请求级 headers 合并', async () => {
    const client = createClient({ headers: { 'X-App': 'test' } })
    await client.get('/data', { headers: { 'X-Page': '2' } })
    const h = fetchCalls[0].init.headers as any
    assert.equal(h['X-App'], 'test')
    assert.equal(h['X-Page'], '2')
  })

  it('请求拦截器 onRequest', async () => {
    const client = createClient({
      onRequest: (req) => ({ url: req.url + '?v=1', init: req.init }),
    })
    await client.get('/items')
    assert.ok(fetchCalls[0].url.includes('?v=1'))
  })

  it('响应拦截器 onResponse', async () => {
    mockResponse = () => new Response('raw text', { status: 200 })
    const client = createClient({
      onResponse: (res) => res.text() as any,
    })
    const result = await client.get('/text')
    assert.equal(result, 'raw text')
  })
})
