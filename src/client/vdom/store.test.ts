/**
 * vdom store — createStore 测试（共享状态原语）
 *
 * 契约（AGENTS §4.5）：state 普通对象（getter 最新——非 Proxy）；
 * set 合并写 + notify；update 可变写 + notify；notify 手动；subscribe 退订。
 */

import { test } from 'vitest'
import { expect } from 'vitest'
import { createStore } from './store.ts'

test('state：getter 读最新（set 替换后引用更新）', () => {
  const store = createStore({ count: 0 })
  expect(store.state.count).toBe(0)
  store.set({ count: 1 })
  expect(store.state.count, 'set 后 state 最新（非快照）').toBe(1)
  const old = store.state
  store.set({ count: 2 })
  expect(store.state, 'set 替换对象（不可变合并）').not.toBe(old)
})

test('set：合并写（partial → {...state, ...partial}）+ notify', () => {
  const store = createStore({ a: 1, b: 2 })
  let notified = 0
  store.subscribe(() => { notified++ })
  store.set({ b: 3 })
  expect(store.state, '合并写——未传键保持').toEqual({ a: 1, b: 3 })
  expect(notified, 'notify 触发').toBe(1)
  store.set({ c: 4 })
  expect(store.state, '新增键').toEqual({ a: 1, b: 3, c: 4 })
  expect(notified).toBe(2)
})

test('update：可变写（fn 原地改）+ notify', () => {
  const store = createStore({ items: [1] })
  let notified = 0
  store.subscribe(() => { notified++ })
  store.update((s) => { s.items.push(2) })
  expect(store.state.items, '原地改').toEqual([1, 2])
  expect(notified).toBe(1)
})

test('subscribe：退订后不再通知', () => {
  const store = createStore({ n: 0 })
  let calls = 0
  const unsub = store.subscribe(() => { calls++ })
  store.set({ n: 1 })
  expect(calls).toBe(1)
  unsub()
  store.set({ n: 2 })
  expect(calls, '退订后不通知').toBe(1)
})

test('notify：手动通知（高频场景写者控制频率）', () => {
  const store = createStore({ n: 0 })
  let calls = 0
  store.subscribe(() => { calls++ })
  store.notify()
  store.notify()
  expect(calls, '手动 notify').toBe(2)
})

test('多订阅者：全部通知（useExternal 多组件场景）', () => {
  const store = createStore({ v: 'x' })
  let a = 0
  let b = 0
  store.subscribe(() => { a++ })
  store.subscribe(() => { b++ })
  store.set({ v: 'y' })
  expect(a).toBe(1)
  expect(b).toBe(1)
})
