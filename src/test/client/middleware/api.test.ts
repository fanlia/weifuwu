/**
 * api middleware 测试
 */

import { describe, it, before, mock } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

// ── 浏览器全局环境设置 ───────────────────────────────────────

before(() => {
  if (typeof document !== 'undefined') return

  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
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

// ── 导入被测模块 ────────────────────────────────────────────

const { api, ApiClient, ApiError, setTokenGetter, getToken } = await import('../../../client/middleware/api.ts')
import type { WfuiContext, AppMiddleware } from '../../../client/types.ts'

const baseCtx: WfuiContext = {
  route: { path: '/', params: {}, query: {}, hash: '', component: null, data: {}, loading: false },
  app: { navigate: () => {} },
  user: null, token: null, isAuthenticated: false,
  login: async () => {}, logout: () => {}, register: async () => {},
  api: null as any, ws: null as any,
  provide: () => {}, inject: () => null,
}

// ═════════════════════════════════════════════════════════════
// ApiClient
// ═════════════════════════════════════════════════════════════

describe('ApiClient', () => {
  let originalFetch: typeof global.fetch

  before(() => {
    originalFetch = global.fetch
  })

  it('GET 请求调用 fetch', async () => {
    const mockResponse = new Response(JSON.stringify({ id: 1, name: 'test' }), {
      headers: { 'Content-Type': 'application/json' },
    })
    global.fetch = mock.fn(() => Promise.resolve(mockResponse)) as any

    const client = new ApiClient('/api')
    const data = await client.get('/users/1')

    assert.deepEqual(data, { id: 1, name: 'test' })
    assert.equal((global.fetch as any).mock.calls.length, 1)

    const [url] = (global.fetch as any).mock.calls[0].arguments
    assert.equal(url, '/api/users/1')

    global.fetch = originalFetch
  })

  it('POST 请求发送 JSON body', async () => {
    const mockResponse = new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
    global.fetch = mock.fn(() => Promise.resolve(mockResponse)) as any

    const client = new ApiClient()
    const data = await client.post('/items', { name: 'new' })

    assert.deepEqual(data, { ok: true })

    const [, options] = (global.fetch as any).mock.calls[0].arguments
    assert.equal(options.method, 'POST')
    assert.equal(options.headers['Content-Type'], 'application/json')
    assert.equal(options.body, JSON.stringify({ name: 'new' }))

    global.fetch = originalFetch
  })

  it('非 2xx 响应抛出 ApiError', async () => {
    const mockResponse = new Response('Not Found', { status: 404 })
    global.fetch = mock.fn(() => Promise.resolve(mockResponse)) as any

    const client = new ApiClient()

    try {
      await client.get('/nonexistent')
      assert.fail('应抛出异常')
    } catch (e: any) {
      assert.ok(e instanceof ApiError)
      assert.equal(e.status, 404)
      assert.equal(e.message, '[404] Not Found')
    }

    global.fetch = originalFetch
  })

  it('204 响应返回 undefined', async () => {
    const mockResponse = new Response(null, { status: 204 })
    global.fetch = mock.fn(() => Promise.resolve(mockResponse)) as any

    const client = new ApiClient()
    const data = await client.delete('/items/1')
    assert.equal(data, undefined)

    global.fetch = originalFetch
  })

  it('PUT 和 PATCH 方法正确', async () => {
    const calls: Array<{ method: string; url: string }> = []
    const mockFetch = async (url: string, opts?: any) => {
      calls.push({ method: opts?.method || 'GET', url })
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    global.fetch = mockFetch as any

    const client = new ApiClient()
    await client.put('/items/1', { update: true })
    await client.patch('/items/1', { patch: true })

    assert.equal(calls.length, 2)
    assert.equal(calls[0].method, 'PUT')
    assert.equal(calls[1].method, 'PATCH')

    global.fetch = originalFetch
  })
})

// ═════════════════════════════════════════════════════════════
// api() 中间件
// ═════════════════════════════════════════════════════════════

describe('api 中间件', () => {
  it('注入 ctx.api', () => {
    const mw = api()
    const result = mw({ ...baseCtx })

    assert.ok(result.api)
    assert.equal(typeof result.api.get, 'function')
    assert.equal(typeof result.api.post, 'function')
    assert.equal(typeof result.api.put, 'function')
    assert.equal(typeof result.api.patch, 'function')
    assert.equal(typeof result.api.delete, 'function')
  })

  it('自定义 baseUrl', () => {
    const mw = api({ baseUrl: 'http://test:3000' })
    const result = mw({ ...baseCtx })
    assert.ok(result.api)
  })

  it('不影响 ctx 其他字段', () => {
    const mw = api()
    const result = mw({ ...baseCtx })
    assert.equal(result.route.path, '/')
  })
})

// ═════════════════════════════════════════════════════════════
// setTokenGetter / getToken
// ═════════════════════════════════════════════════════════════

describe('token getter', () => {
  it('设置和读取 token', () => {
    setTokenGetter(() => 'test-token')
    assert.equal(getToken(), 'test-token')
  })

  it('未设置时返回 null', () => {
    setTokenGetter(() => null)
    assert.equal(getToken(), null)
  })
})
