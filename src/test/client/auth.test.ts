/**
 * weifuwu/client auth middleware — 认证状态管理测试
 */

import { describe, it, before } from 'node:test'
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

const { auth } = await import('../../client/middleware/auth.ts')
import type { AuthClient } from '../../client/middleware/auth.ts'

// ── 模拟 Storage ────────────────────────────────────────────

class MockStorage implements Storage {
  private store = new Map<string, string>()
  get length() { return this.store.size }
  clear() { this.store.clear() }
  getItem(k: string) { return this.store.get(k) ?? null }
  key(i: number) { return [...this.store.keys()][i] ?? null }
  removeItem(k: string) { this.store.delete(k) }
  setItem(k: string, v: string) { this.store.set(k, v) }
}

function createAuth(storage?: Storage, opts?: Record<string, string>): AuthClient {
  const options: any = { storage: storage ?? new MockStorage() }
  if (opts?.tokenKey) options.tokenKey = opts.tokenKey
  if (opts?.userKey) options.userKey = opts.userKey
  const ctx = auth(options)({
    route: {} as any,
    app: { navigate() {} },
    provide() {},
    inject() { return null },
    ws: null as any,
  })
  return (ctx as any).auth
}

describe('auth', () => {
  it('初始状态: 未登录', () => {
    const a = createAuth()
    assert.equal(a.token.value, null)
    assert.equal(a.user.value, null)
    assert.equal(a.isLoggedIn.value, false)
    assert.equal(a.authorizationHeader.value, null)
  })

  it('login() 设置 token 和 user', () => {
    const a = createAuth()
    a.login('jwt-123', { id: 1, name: 'Alice', email: 'alice@test.com' })
    assert.equal(a.token.value, 'jwt-123')
    assert.equal(a.user.value?.name, 'Alice')
    assert.equal(a.isLoggedIn.value, true)
    assert.equal(a.authorizationHeader.value, 'Bearer jwt-123')
  })

  it('login() 持久化到 storage', () => {
    const storage = new MockStorage()
    const a = createAuth(storage)
    a.login('tok', { id: 1, name: 'Bob' })
    assert.equal(storage.getItem('weifuwu_token'), 'tok')
    assert.ok(storage.getItem('weifuwu_user')?.includes('"name":"Bob"'))
  })

  it('logout() 清除 token 和 user', () => {
    const storage = new MockStorage()
    const a = createAuth(storage)
    a.login('tok', { id: 1, name: 'Bob' })
    a.logout()
    assert.equal(a.token.value, null)
    assert.equal(a.user.value, null)
    assert.equal(a.isLoggedIn.value, false)
    assert.equal(storage.getItem('weifuwu_token'), null)
  })

  it('setUser() 更新 user 信号和 storage', () => {
    const storage = new MockStorage()
    const a = createAuth(storage)
    a.login('tok', { id: 1, name: 'Old' })
    a.setUser({ id: 1, name: 'New' })
    assert.equal(a.user.value?.name, 'New')
    assert.ok(storage.getItem('weifuwu_user')?.includes('"name":"New"'))
  })

  it('从 storage 恢复登录状态', () => {
    const storage = new MockStorage()
    storage.setItem('weifuwu_token', 'saved-token')
    storage.setItem('weifuwu_user', JSON.stringify({ id: 2, name: 'Restored' }))

    const a = createAuth(storage)
    assert.equal(a.token.value, 'saved-token')
    assert.equal(a.user.value?.name, 'Restored')
    assert.equal(a.isLoggedIn.value, true)
  })

  it('自定义 tokenKey / userKey', () => {
    const storage = new MockStorage()
    storage.setItem('my_token', 't')
    storage.setItem('my_user', JSON.stringify({ id: 3, name: 'Custom' }))

    const a = createAuth(storage as any, { tokenKey: 'my_token', userKey: 'my_user' })
    assert.equal(a.token.value, 't')
    assert.equal(a.user.value?.name, 'Custom')
  })

  it('computed: isLoggedIn = token !== null', () => {
    const a = createAuth()
    assert.equal(a.isLoggedIn.value, false)
    a.login('x', { id: 1, name: 'X' })
    assert.equal(a.isLoggedIn.value, true)
    a.logout()
    assert.equal(a.isLoggedIn.value, false)
  })

  it('computed: authorizationHeader = Bearer token', () => {
    const a = createAuth()
    assert.equal(a.authorizationHeader.value, null)
    a.login('abc', { id: 1, name: 'X' })
    assert.equal(a.authorizationHeader.value, 'Bearer abc')
    a.logout()
    assert.equal(a.authorizationHeader.value, null)
  })
})
