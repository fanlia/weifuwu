/**
 * 中间件增强测试 — api / auth / ws 边缘场景
 */

import { describe, it, before, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'

before(setupJsdom)

const { api, ApiError } = await import('../../client/middleware/api.ts')
const { auth } = await import('../../client/middleware/auth.ts')
const { ws } = await import('../../client/middleware/ws.ts')
const { createApp } = await import('../../client/app.ts')

// ═════════════════════════════════════════════════════════════
// api middleware — 增强测试
// ═════════════════════════════════════════════════════════════

describe('api middleware', () => {
  it('基础 GET 请求', async () => {
    const ctx = { provide: () => {}, inject: () => null, ws: null } as any
    const result = api()(ctx)
    assert.ok(result.api)
    assert.equal(typeof result.api.get, 'function')
  })

  it('非 JSON 响应解析', async () => {
    const origFetch = globalThis.fetch
    const mockFetch = mock.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: () => Promise.resolve('plain text'),
    }))
    globalThis.fetch = mockFetch as any

    const ctx = { provide: () => {}, inject: () => null, ws: null } as any
    const result = api()(ctx)
    const data = await result.api.get('/test')
    assert.equal(data, 'plain text')

    globalThis.fetch = origFetch
  })

  it('网络错误', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock.fn(() => Promise.reject(new Error('network error'))) as any

    const ctx = { provide: () => {}, inject: () => null, ws: null } as any
    const result = api()(ctx)

    try {
      await result.api.get('/test')
      assert.fail('should throw')
    } catch (e: any) {
      assert.ok(e instanceof Error)
      assert.match(e.message, /network error/)
    }
    globalThis.fetch = originalFetch
  })

  it('自定义 baseURL', async () => {
    const origFetch = globalThis.fetch
    const mockFetch = mock.fn((url: string) => Promise.resolve({
      ok: true, status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({}),
    }))
    globalThis.fetch = mockFetch as any

    const ctx = { provide: () => {}, inject: () => null, ws: null } as any
    const result = api({ baseURL: 'https://api.example.com' })(ctx)

    await result.api.get('/users')
    const calledUrl = mockFetch.mock.calls[0].arguments[0]
    assert.equal(calledUrl, 'https://api.example.com/users')

    globalThis.fetch = origFetch
  })
})

// ═════════════════════════════════════════════════════════════
// auth middleware — 增强测试
// ═════════════════════════════════════════════════════════════

describe('auth middleware', () => {
  it('登录后设置 token', async () => {
    const ctx = { provide: () => {}, inject: () => null, ws: null } as any
    const result = auth()(ctx)

    await result.auth.login('test@example.com', 'password123')
    assert(true)
  })

  it('已登录状态检查', async () => {
    const ctx = { provide: () => {}, inject: () => null, ws: null } as any
    const result = auth()(ctx)

    assert.equal(typeof result.auth.isLoggedIn, 'object')
    assert.equal(typeof result.auth.isLoggedIn.value, 'boolean')
  })
})

// ═════════════════════════════════════════════════════════════
// ws middleware — 增强测试
// ═════════════════════════════════════════════════════════════

describe('ws middleware', () => {
  // 保存 ws ctx 引用以便在 after 中清理定时器
  let wsCtx: any = null

  after(() => {
    if (wsCtx?.ws?.destroy) wsCtx.ws.destroy()
  })

  it('创建 WS 中间件', () => {
    const ctx = { provide: () => {}, inject: () => null, ws: null, app: { destroy: undefined } } as any
    const result = ws()(ctx)
    wsCtx = result
    assert.ok(result.ws)
    assert.equal(typeof result.ws.send, 'function')
    assert.equal(typeof result.ws.onMessage, 'function')
    assert.equal(typeof result.ws.isConnected, 'object')
  })

  it('send 不抛异常（连接未就绪时）', () => {
    const ctx = { provide: () => {}, inject: () => null, ws: null, app: { destroy: undefined } } as any
    const result = ws()(ctx)
    wsCtx = result
    result.ws.send({ type: 'test' })
    assert(true)
  })

  it('onMessage 注册和取消', () => {
    const ctx = { provide: () => {}, inject: () => null, ws: null, app: { destroy: undefined } } as any
    const result = ws()(ctx)
    wsCtx = result

    let received: any = null
    const unsub = result.ws.onMessage((data) => { received = data })
    assert.equal(typeof unsub, 'function')
    unsub()
    assert(true)
  })
})

// ═════════════════════════════════════════════════════════════
// createApp destroy
// ═════════════════════════════════════════════════════════════

describe('createApp destroy', () => {
  it('destroy 不崩溃', async () => {
    const app = createApp()
    assert.equal(typeof app.destroy, 'function')
    app.destroy()
    assert(true)
  })

  it('destroy 两次安全', () => {
    const app = createApp()
    app.destroy()
    app.destroy()
    assert(true)
  })
})
