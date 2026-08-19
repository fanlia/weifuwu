/**
 * vdom middlewares — api/auth/i18n/ws 测试
 *
 * 覆盖：api 请求封装（JSON/错误/超时——mock fetch）；auth token 管理；
 * i18n t 插值/locale 切换；ws 消息订阅（mock WebSocket）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { api, ApiError } from './api.ts'
import { auth, i18n } from './auth-i18n.ts'
import { ws } from './ws.ts'

function mockFetch(handler: (url: string, init?: { method?: string; body?: string }) => unknown) {
  const orig = (globalThis as any).fetch
  ;(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
    const result = handler(url, init)
    if (result instanceof Error) throw result
    return { ok: true, status: 200, text: async () => (result === undefined ? '' : JSON.stringify(result)) }
  }
  return () => { (globalThis as any).fetch = orig }
}

test('api：get/post 请求封装（JSON 序列化/解析——method/body 正确）', async () => {
  const calls: Array<{ url: string; init: { method?: string; body?: string } }> = []
  const restore = mockFetch((url, init = {}) => {
    calls.push({ url, init })
    return { id: 1 }
  })
  try {
    const client = api({ baseUrl: '/api' })
    const got = await client.get<{ id: number }>('/users/1')
    assert.deepEqual(got, { id: 1 })
    assert.equal(calls[0].url, '/api/users/1', 'baseUrl 拼接')
    const posted = await client.post('/users', { name: 'x' })
    assert.deepEqual(posted, { id: 1 })
    assert.equal(calls[1].init.method, 'POST')
    assert.equal(calls[1].init.body, JSON.stringify({ name: 'x' }), 'body JSON 序列化')
  } finally {
    restore()
  }
})

test('api：非 2xx → ApiError（status）——onError 钩子', async () => {
  const orig = (globalThis as any).fetch
  ;(globalThis as any).fetch = async () => ({ ok: false, status: 404, text: async () => '' })
  const errors: ApiError[] = []
  try {
    const client = api({ onError: (e) => errors.push(e) })
    await assert.rejects(() => client.get('/missing'), ApiError)
    assert.equal(errors.length, 1, 'onError 钩子')
    assert.equal(errors[0].status, 404)
  } finally {
    ;(globalThis as any).fetch = orig
  }
})

test('auth：token 管理（set/get/headers/logout——storage 注入）', () => {
  const store = new Map<string, string>()
  const client = auth({ storage: { get: (k) => store.get(k) ?? null, set: (k, v) => store.set(k, v) } })
  assert.equal(client.getToken(), null)
  client.setToken('abc')
  assert.deepEqual(client.headers(), { authorization: 'Bearer abc' })
  client.logout()
  assert.equal(client.getToken(), null)
})

test('i18n：t 插值 + locale 切换（缺失 key 返回 key——不静默）', () => {
  const i = i18n({ locale: 'zh', messages: { zh: { hello: '你好，{name}' }, en: { hello: 'Hello, {name}' } } })
  assert.equal(i.t('hello', { name: '世界' }), '你好，世界')
  assert.equal(i.t('missing'), 'missing', '缺失 key 返回 key')
  i.setLocale('en')
  assert.equal(i.t('hello', { name: 'World' }), 'Hello, World')
})

test('ws：消息订阅（mock WebSocket——JSON 解析——退订）', () => {
  let sock: { onmessage: ((e: { data: unknown }) => void) | null } | null = null
  const mockWs = class {
    onmessage: ((e: { data: unknown }) => void) | null = null
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onerror: ((e: unknown) => void) | null = null
    sent: string[] = []
    constructor(_url: string) { sock = this }
    send(d: string) { this.sent.push(d) }
    close() {}
  }
  const client = ws({ WebSocketCtor: mockWs as never })
  const got: unknown[] = []
  const unsub = client.onMessage((d) => got.push(d))
  client.connect('ws://x')
  sock?.onmessage?.({ data: '{"k":1}' })
  assert.deepEqual(got, [{ k: 1 }], '消息 JSON 解析 + 订阅')
  client.send({ a: 2 })
  assert.equal((sock as unknown as { sent: string[] }).sent[0], JSON.stringify({ a: 2 }))
  unsub()
  sock?.onmessage?.({ data: '{"k":2}' })
  assert.equal(got.length, 1, '退订后不再接收')
})
