/**
 * auth 中间件契约——纯逻辑（token 状态管理——storage 注入——非网络层）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auth } from '../../client/vdom/middlewares/auth-i18n.ts'

test('setToken/getToken：存储往返（默认 key）', () => {
  const store = new Map<string, string>()
  const client = auth({ storage: { get: (k) => store.get(k) ?? null, set: (k, v) => { store.set(k, v) } } })
  client.setToken('abc123')
  assert.equal(client.getToken(), 'abc123')
  assert.equal(store.get('wf-auth-token'), 'abc123', '默认 key')
})

test('setToken(null) → 空字符串归一 null（logout 语义）', () => {
  const store = new Map<string, string>([['wf-auth-token', 'abc']])
  const client = auth({ storage: { get: (k) => store.get(k) ?? null, set: (k, v) => { store.set(k, v) } } })
  client.setToken(null)
  assert.equal(client.getToken(), null, '空字符串 → null（不返回空串）')
})

test('headers：有 token → Bearer scheme；无 token → 空对象', () => {
  const store = new Map<string, string>()
  const client = auth({ storage: { get: (k) => store.get(k) ?? null, set: (k, v) => { store.set(k, v) } } })
  assert.deepEqual(client.headers(), {}, '未登录——无 authorization 头')
  client.setToken('tok')
  assert.deepEqual(client.headers(), { authorization: 'Bearer tok' }, '默认 Bearer scheme')
})

test('自定义 scheme/key：headers 与存储键遵循配置', () => {
  const store = new Map<string, string>()
  const client = auth({
    key: 'custom-token', scheme: 'Basic',
    storage: { get: (k) => store.get(k) ?? null, set: (k, v) => { store.set(k, v) } },
  })
  client.setToken('xyz')
  assert.equal(store.get('custom-token'), 'xyz', '自定义 key')
  assert.deepEqual(client.headers(), { authorization: 'Basic xyz' }, '自定义 scheme')
})

test('logout：清空 token（空字符串）', () => {
  const store = new Map<string, string>([['wf-auth-token', 'abc']])
  const client = auth({ storage: { get: (k) => store.get(k) ?? null, set: (k, v) => { store.set(k, v) } } })
  client.logout()
  assert.equal(client.getToken(), null)
  assert.equal(store.get('wf-auth-token'), '', 'logout 写空串')
})
