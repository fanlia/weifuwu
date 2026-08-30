/**
 * auth 中间件契约——纯逻辑（token 状态管理——storage 注入——非网络层）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auth, i18n } from '../../client/vdom/middlewares/auth-i18n.ts'

test('refresh：未配置 onRefresh → false + dev warn（机制化——静默失效消除）', () => {
  const warns: string[] = []
  const orig = console.warn
  console.warn = (m: string) => { warns.push(String(m)) }
  try {
    const c = auth({ storage: { get: () => null, set: () => {} } })
    // refresh 异步——await
    const ok = (c as any).refresh()
    assert.ok(typeof ok.then === 'function')
    return ok.then((v: boolean) => {
      assert.equal(v, false, '未接线 → false（不静默成功）')
      assert.ok(warns.some((w) => w.includes('onRefresh')), '应有引导 warn')
    })
  } finally {
    console.warn = orig
  }
})

test('refresh：onRefresh 已接线 → 成功 true + onAuth 回执', async () => {
  let onAuthCalls = 0
  const c = auth({
    storage: { get: () => 'tok', set: () => {} },
    onRefresh: async () => true,
    onAuth: () => { onAuthCalls++ },
  })
  assert.equal(await (c as any).refresh(), true)
  assert.equal(onAuthCalls, 1, 'refresh 成功 → onAuth 通知')
})

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

test('token$：登录态值流（login/setToken/logout 事件源——订阅即收当前值）', () => {
  const store = new Map<string, string>()
  const client = auth({ storage: { get: (k) => store.get(k) ?? null, set: (k, v) => { store.set(k, v) } } })
  const got: Array<string | null> = []
  client.token$.subscribe({ next: (t) => got.push(t) })
  client.login('tok1', { name: 'u' })
  client.setToken('tok2')
  client.logout()
  assert.deepEqual(got, [null, 'tok1', 'tok2', null], '初始态回放 + login/setToken/logout 全程事件（BehaviorSubject 语义）')
})

test('token$：订阅即回放当前态（BehaviorSubject 语义）', () => {
  const store = new Map<string, string>([['wf-auth-token', 'abc']])
  const client = auth({ storage: { get: (k) => store.get(k) ?? null, set: (k, v) => { store.set(k, v) } } })
  const got: Array<string | null> = []
  client.token$.subscribe({ next: (t) => got.push(t) })
  assert.deepEqual(got, ['abc'], '订阅即收当前 token')
})

test('i18n：locale$ 值流（setLocale 事件源——无自动渲染——订阅方决定时机）', () => {
  const i18nState = i18n({ locale: 'en', messages: { en: { hi: 'Hi' }, zh: { hi: '你好' } } })
  const got: string[] = []
  i18nState.locale$.subscribe({ next: (l) => got.push(l) })
  i18nState.setLocale('zh')
  i18nState.setLocale('en')
  assert.deepEqual(got, ['zh', 'en'], 'setLocale 事件序列')
  assert.equal(i18nState.t('hi'), 'Hi', 'locale 切换后 t 读最新')
})

test('i18n：locale$ 退订后零事件', () => {
  const i18nState = i18n({ locale: 'en' })
  const got: string[] = []
  const sub = i18nState.locale$.subscribe({ next: (l) => got.push(l) })
  i18nState.setLocale('zh')
  sub.unsubscribe()
  i18nState.setLocale('en')
  assert.deepEqual(got, ['zh'])
})
