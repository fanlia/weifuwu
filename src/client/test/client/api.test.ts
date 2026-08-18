/**
 * weifuwu/ui-dom api middleware — HTTP 客户端测试
 */

import { describe, it, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createClientBrowser } from '../../ui-dom/browser.ts'
import { setupJsdom } from './setup.ts'

before(setupJsdom)

const { api, ApiError } = await import('../../ui-dom/middleware/api.ts')
import type { ApiClient } from '../../ui-dom/middleware/api.ts'
const browser = createClientBrowser()

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

  it('401 → 触发 onUnauthorized（token 过期/无效——清理 + 跳转）；仍抛 ApiError', async () => {
    mockResponse = () => new Response('{"error":"invalid token"}', { status: 401, headers: { 'Content-Type': 'application/json' } })
    let called = 0
    const client = createClient({ onUnauthorized: () => { called++ } })
    try {
      await client.get('/api/stats')
      assert.fail('should throw')
    } catch (e) {
      assert.ok(e instanceof ApiError)
      assert.equal((e as ApiError).status, 401)
      assert.equal(called, 1, 'onUnauthorized 触发一次')
    }
  })

  it('403/404 不触发 onUnauthorized（权限不足非认证问题）', async () => {
    mockResponse = () => new Response('forbidden', { status: 403 })
    let called = 0
    const client = createClient({ onUnauthorized: () => { called++ } })
    try { await client.get('/x') } catch { /* 403 抛错但回调不触发 */ }
    assert.equal(called, 0, '403 不触发 onUnauthorized')
  })

  it('401 → onUnauthorized 返回 true → 重试原请求一次（刷新凭证后恢复）', async () => {
    let calls = 0
    mockResponse = (url, init) => {
      calls++
      // 第一次 401（token 过期）；重试（带新 token）200
      return calls === 1 ? new Response('{"error":"expired"}', { status: 401 })
        : new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    let unauthCalls = 0
    const client = createClient({ onUnauthorized: () => { unauthCalls++; return true } })
    const data = await client.get('/api/stats')
    assert.equal(calls, 2, '重试一次')
    assert.equal(unauthCalls, 1, 'onUnauthorized 只调一次（重试后 200 不再触发）')
    assert.deepEqual(data, { ok: true })
  })

  it('401 → onUnauthorized 返回 true 但重试仍 401 → 不再无限递归（_retried 守卫）', async () => {
    mockResponse = () => new Response('{"error":"still 401"}', { status: 401 })
    let calls = 0
    const client = createClient({ onUnauthorized: () => { calls++; return true } })
    try {
      await client.get('/x')
      assert.fail('should throw')
    } catch (e) {
      assert.ok(e instanceof ApiError)
      assert.equal((e as ApiError).status, 401)
    }
    assert.equal(calls, 2, 'onUnauthorized 最多调 2 次（原 401 + 重试 401）——不无限递归')
  })
