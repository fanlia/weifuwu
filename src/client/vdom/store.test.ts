/**
 * vdom store — createStore 测试（共享状态原语）
 *
 * 契约（AGENTS §4.5）：state 普通对象（getter 最新——非 Proxy）；
 * set 合并写 + notify；update 可变写 + notify；notify 手动；subscribe 退订。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStore } from './store.ts'

test('state：getter 读最新（set 替换后引用更新）', () => {
  const store = createStore({ count: 0 })
  assert.equal(store.state.count, 0)
  store.set({ count: 1 })
  assert.equal(store.state.count, 1, 'set 后 state 最新（非快照）')
  const old = store.state
  store.set({ count: 2 })
  assert.notEqual(store.state, old, 'set 替换对象（不可变合并）')
})

test('set：合并写（partial → {...state, ...partial}）+ notify', () => {
  const store = createStore({ a: 1, b: 2 })
  let notified = 0
  store.subscribe(() => { notified++ })
  store.set({ b: 3 })
  assert.deepEqual(store.state, { a: 1, b: 3 }, '合并写——未传键保持')
  assert.equal(notified, 1, 'notify 触发')
  store.set({ c: 4 })
  assert.deepEqual(store.state, { a: 1, b: 3, c: 4 }, '新增键')
  assert.equal(notified, 2)
})

test('update：可变写（fn 原地改）+ notify', () => {
  const store = createStore({ items: [1] })
  let notified = 0
  store.subscribe(() => { notified++ })
  store.update((s) => { s.items.push(2) })
  assert.deepEqual(store.state.items, [1, 2], '原地改')
  assert.equal(notified, 1)
})

test('subscribe：退订后不再通知', () => {
  const store = createStore({ n: 0 })
  let calls = 0
  const unsub = store.subscribe(() => { calls++ })
  store.set({ n: 1 })
  assert.equal(calls, 1)
  unsub()
  store.set({ n: 2 })
  assert.equal(calls, 1, '退订后不通知')
})

test('notify：手动通知（高频场景写者控制频率）', () => {
  const store = createStore({ n: 0 })
  let calls = 0
  store.subscribe(() => { calls++ })
  store.notify()
  store.notify()
  assert.equal(calls, 2, '手动 notify')
})

test('多订阅者：全部通知（useExternal 多组件场景）', () => {
  const store = createStore({ v: 'x' })
  let a = 0
  let b = 0
  store.subscribe(() => { a++ })
  store.subscribe(() => { b++ })
  store.set({ v: 'y' })
  assert.equal(a, 1)
  assert.equal(b, 1)
})
