/**
 * auth middleware 测试
 */

import { describe, it, before, mock } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

// ── 浏览器全局环境设置 ───────────────────────────────────────

before(() => {
  if (typeof document !== 'undefined') return
  if (typeof globalThis.localStorage !== 'undefined') return

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

  // localStorage polyfill
  if (typeof g.localStorage === 'undefined') {
    const store = new Map<string, string>()
    g.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      get length() { return store.size },
      key: (i: number) => [...store.keys()][i] ?? null,
    }
  }
})

// ── 导入被测模块 ────────────────────────────────────────────

const { auth } = await import('../../../client/middleware/auth.ts')
const { setTokenGetter } = await import('../../../client/middleware/api.ts')
import type { WfuiContext } from '../../../client/types.ts'

const baseCtx: WfuiContext = {
  route: { path: '/', params: {}, query: {}, hash: '', component: null, data: {}, loading: false },
  app: { navigate: () => {} },
  user: null, token: null, isAuthenticated: false,
  login: async () => {}, logout: () => {}, register: async () => {},
  api: null as any, ws: null as any,
  provide: () => {}, inject: () => null,
}

// ═════════════════════════════════════════════════════════════
// auth middleware
// ═════════════════════════════════════════════════════════════

describe('auth middleware', () => {
  let originalFetch: typeof global.fetch

  before(() => {
    originalFetch = global.fetch
    localStorage.clear()
  })

  it('注入 user / login / logout / register', async () => {
    // token 验证 API 返回 401，走未登录流程
    const mockResponse = new Response('Unauthorized', { status: 401 })
    global.fetch = mock.fn(() => Promise.resolve(mockResponse)) as any

    const mw = auth()
    const ctx = await mw({ ...baseCtx })

    assert.equal(ctx.user, null)
    assert.equal(ctx.token, null)
    assert.equal(ctx.isAuthenticated, false)
    assert.equal(typeof ctx.login, 'function')
    assert.equal(typeof ctx.logout, 'function')
    assert.equal(typeof ctx.register, 'function')

    global.fetch = originalFetch
  })

  it('从 localStorage 恢复登录状态', async () => {
    // 先存一个 session 到 localStorage
    const savedUser = { id: '1', email: 'test@test.com', name: 'Test', role: 'user' }
    localStorage.setItem('wefu:auth', JSON.stringify({ user: savedUser, token: 'saved-token' }))

    // mock /api/me 返回用户信息（token 有效）
    const meResponse = new Response(JSON.stringify(savedUser), {
      headers: { 'Content-Type': 'application/json' },
    })
    global.fetch = mock.fn(() => Promise.resolve(meResponse)) as any

    const mw = auth()
    const ctx = await mw({ ...baseCtx })

    assert.deepEqual(ctx.user, savedUser)
    assert.equal(ctx.token, 'saved-token')
    assert.equal(ctx.isAuthenticated, true)

    localStorage.clear()
    global.fetch = originalFetch
  })

  it('token 过期时清除登录状态', async () => {
    localStorage.setItem('wefu:auth', JSON.stringify({
      user: { id: '1', email: 'old@test.com', name: 'Old', role: 'user' },
      token: 'expired-token',
    }))

    // mock /api/me 返回 401（token 过期）
    const meResponse = new Response('Unauthorized', { status: 401 })
    global.fetch = mock.fn(() => Promise.resolve(meResponse)) as any

    const mw = auth()
    const ctx = await mw({ ...baseCtx })

    // token 过期后清除状态
    assert.equal(ctx.user, null)
    assert.equal(ctx.token, null)
    assert.equal(ctx.isAuthenticated, false)

    localStorage.clear()
    global.fetch = originalFetch
  })

  it('login 成功后更新 ctx 和 localStorage', async () => {
    const userData = { id: '2', email: 'new@test.com', name: 'New', role: 'user' }
    const loginResponse = new Response(JSON.stringify({ user: userData, token: 'new-token' }), {
      headers: { 'Content-Type': 'application/json' },
    })
    global.fetch = mock.fn(() => Promise.resolve(loginResponse)) as any

    const meResponse = new Response('Unauthorized', { status: 401 })
    mock.fn(() => Promise.resolve(meResponse))

    const mw = auth()
    const ctx = await mw({ ...baseCtx })

    // 登录
    await ctx.login('new@test.com', 'password')

    // ctx 更新
    assert.deepEqual(ctx.user, userData)
    assert.equal(ctx.token, 'new-token')
    assert.equal(ctx.isAuthenticated, true)

    // localStorage 持久化
    const saved = JSON.parse(localStorage.getItem('wefu:auth')!)
    assert.deepEqual(saved.user, userData)
    assert.equal(saved.token, 'new-token')

    localStorage.clear()
    global.fetch = originalFetch
  })

  it('logout 清除状态', async () => {
    // mock /api/me 返回 401（走未登录路径）
    const meResponse = new Response('Unauthorized', { status: 401 })
    global.fetch = mock.fn(() => Promise.resolve(meResponse)) as any

    const mw = auth()
    const ctx = await mw({ ...baseCtx })

    // 手动设置 token getter
    setTokenGetter(() => null)

    assert.equal(ctx.user, null)
    assert.equal(ctx.token, null)
    assert.equal(ctx.isAuthenticated, false)

    global.fetch = originalFetch
  })

  it('register 成功后更新 ctx', async () => {
    const userData = { id: '3', email: 'reg@test.com', name: 'Reg', role: 'user' }
    const loginResponse = new Response(JSON.stringify({ user: userData, token: 'reg-token' }), {
      headers: { 'Content-Type': 'application/json' },
    })
    global.fetch = mock.fn(() => Promise.resolve(loginResponse)) as any

    const meResponse = new Response('Unauthorized', { status: 401 })
    mock.fn(() => Promise.resolve(meResponse))

    const mw = auth()
    const ctx = await mw({ ...baseCtx })

    await ctx.register({ email: 'reg@test.com', name: 'Reg', password: 'pass' })

    assert.deepEqual(ctx.user, userData)
    assert.equal(ctx.token, 'reg-token')
    assert.equal(ctx.isAuthenticated, true)

    localStorage.clear()
    global.fetch = originalFetch
  })
})
