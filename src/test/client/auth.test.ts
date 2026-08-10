/**
 * weifuwu/client auth — 认证中间件测试
 */

import { describe, it, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { auth } from '../../ui-dom/middleware/auth.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'

// localStorage mock
let store: Record<string, string> = {}
before(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    const s: Record<string, string> = {}
    ;(globalThis as any).localStorage = {
      getItem: (k: string) => s[k] ?? null,
      setItem: (k: string, v: string) => { s[k] = v },
      removeItem: (k: string) => { delete s[k] },
      clear: () => { Object.keys(s).forEach(k => delete s[k]) },
      get length() { return Object.keys(s).length },
      key: (i: number) => Object.keys(s)[i] ?? null,
    }
  }
})

beforeEach(() => {
  store = {}
  localStorage.clear()
})

function makeAuth(opts?: any) {
  const mw = auth({ tokenKey: 't', userKey: 'u', ...opts })
  const ctx: WfuiContext = {} as any
  return mw(ctx) as any
}

describe('auth', () => {
  it('初始状态: 未登录', () => {
    const res = makeAuth()
    assert.equal(res.auth.token, null)
    assert.equal(res.auth.user, null)
    assert.equal(res.auth.isLoggedIn, false)
  })

  it('login() 设置 token 和 user', () => {
    const res = makeAuth()
    res.auth.login('abc', { name: 'Alice' })
    assert.equal(res.auth.token, 'abc')
    assert.equal(res.auth.user.name, 'Alice')
    assert.equal(res.auth.isLoggedIn, true)
    assert.equal(localStorage.getItem('t'), 'abc')
  })

  it('login() 存储 user 为 JSON', () => {
    const res = makeAuth()
    res.auth.login('x', { name: 'Bob' })
    const stored = localStorage.getItem('u')
    assert.equal(JSON.parse(stored!).name, 'Bob')
  })

  it('logout() 清除 token 和 user', () => {
    const res = makeAuth()
    res.auth.login('abc', { name: 'Alice' })
    assert.ok(res.auth.isLoggedIn)
    res.auth.logout()
    assert.equal(res.auth.token, null)
    assert.equal(res.auth.isLoggedIn, false)
    assert.equal(localStorage.getItem('t'), null)
  })

  it('logout() 清除 refresh token', () => {
    const res = makeAuth({ refreshTokenKey: 'rt' })
    res.auth.login('x', {}, 'refresh-123')
    assert.equal(localStorage.getItem('rt'), 'refresh-123')
    res.auth.logout()
    assert.equal(localStorage.getItem('rt'), null)
  })

  it('setUser() 更新 user', () => {
    const res = makeAuth()
    res.auth.login('t', { name: 'Alice' })
    res.auth.setUser({ name: 'Bob' })
    assert.equal(res.auth.user.name, 'Bob')
    assert.equal(localStorage.getItem('u'), JSON.stringify({ name: 'Bob' }))
  })

  it('从 storage 恢复登录状态', () => {
    localStorage.setItem('t', 'saved-token')
    localStorage.setItem('u', JSON.stringify({ name: 'Bob' }))
    const res = makeAuth()
    assert.equal(res.auth.token, 'saved-token')
    assert.equal(res.auth.user.name, 'Bob')
  })

  it('storage 无 user 时 user 为 null', () => {
    localStorage.setItem('t', 'token-only')
    const res = makeAuth()
    assert.equal(res.auth.token, 'token-only')
    assert.equal(res.auth.user, null)
  })

  it('isLoggedIn 是 getter', () => {
    const res = makeAuth()
    assert.equal(res.auth.isLoggedIn, false)
    res.auth.login('t', {})
    assert.equal(res.auth.isLoggedIn, true)
    res.auth.logout()
    assert.equal(res.auth.isLoggedIn, false)
  })
})
