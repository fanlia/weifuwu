/**
 * weifuwu/ui-dom auth — 认证中间件测试
 */

import { describe, it, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createClientBrowser } from './browser.ts'
import { auth } from './middleware/auth.ts'
import type { WfuiContext } from './types.ts'
const browser = createClientBrowser()

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

  it('refresh 竞态：响应时 token 已变（登录已发生）→ 不 logout 不清新 token', async () => {
    // refresh 发起时 token=T_old、refreshToken=rt；期间 login(T_new)；refresh 失败到达
    localStorage.setItem('t', 'T_old')
    localStorage.setItem('r', 'rt')
    // 延迟 resolve——模拟 refresh 请求期间发生 login
    globalThis.fetch = (async () => {
      await new Promise((r) => setTimeout(r, 20))
      return new Response('{"error":"invalid refresh token"}', { status: 401 })
    }) as typeof globalThis.fetch
    const res = makeAuth({ refreshTokenKey: 'r', refreshEndpoint: '/refresh' })
    // refresh 在注入时异步发起（savedToken 需过期才触发——这里手动调用验证竞态路径）
    const p = res.auth.refresh()
    await new Promise((r) => setTimeout(r, 5))
    res.auth.login('T_new', { name: 'New' }) // 登录发生在 refresh 失败响应前
    await p
    assert.equal(localStorage.getItem('t'), 'T_new', '新 token 不被 logout 清掉（竞态防护）')
    assert.equal(res.auth.token, 'T_new')
  })

  it('refresh 失败且 token 未变 → 正常 logout', async () => {
    localStorage.setItem('t', 'T_old')
    localStorage.setItem('r', 'rt')
    globalThis.fetch = (async () => new Response('{"error":"bad"}', { status: 401 })) as typeof globalThis.fetch
    const res = makeAuth({ refreshTokenKey: 'r', refreshEndpoint: '/refresh' })
    await res.auth.refresh()
    assert.equal(localStorage.getItem('t'), null, '无竞态时 refresh 失败正常清理')
    assert.equal(res.auth.token, null)
  })

  it('refresh in-flight 合并：并发调用共享同一请求（rt 轮换单次使用不双发）', async () => {
    localStorage.setItem('t', 'T_old')
    localStorage.setItem('r', 'rt')
    let refreshCalls = 0
    globalThis.fetch = (async () => {
      refreshCalls++
      await new Promise((r) => setTimeout(r, 15))
      return new Response(JSON.stringify({ token: 'T_new', refreshToken: 'rt2' }), { status: 200 })
    }) as typeof globalThis.fetch
    const res = makeAuth({ refreshTokenKey: 'r', refreshEndpoint: '/refresh' })
    const [a, b] = await Promise.all([res.auth.refresh(), res.auth.refresh()])
    assert.equal(a, true)
    assert.equal(b, true)
    assert.equal(refreshCalls, 1, '并发 refresh 合并为一次请求')
    assert.equal(localStorage.getItem('t'), 'T_new')
  })
