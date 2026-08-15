/**
 * vdom3 最小闭环测试——状态驱动渲染 + 事件流
 *
 * 验证核心不变量：
 *   1. signal 变化 → 只更新绑定点（无整树 diff）
 *   2. Show 条件结构 → 局部插入/移除指令
 *   3. For 列表结构 → keyed 局部更新
 *   4. 事件流记录全部 DOM 指令（可断言）
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './client/setup.ts'
import { signal, effect, h, bind, Show, For, renderNode } from '../ui-dom/vdom3/index.ts'
import { stream } from '../ui-dom/vdom3/events.ts'

before(setupJsdom)

function mkRoot(): HTMLElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return root
}

test('signal 变化 → 只更新绑定文本（无整树 diff——事件流记录 DOM_UPDATE）', () => {
  stream.reset()
  const root = mkRoot()
  const count = signal(0, 'count')
  renderNode(h('div', { id: 'box' }, bind(() => count())), root)

  const box = root.querySelector('#box')!
  const text = box.firstChild as Text
  assert.equal(text.nodeValue, '0', '初始渲染 0')

  count.set(1)
  assert.equal(text.nodeValue, '1', 'signal 变化 → 文本更新（同节点——未重建）')
  assert.equal(box.childNodes.length, 1, '无节点增删（无 diff 重建）')

  // 事件流：记录 SIGNAL_SET + DOM_UPDATE
  const events = stream.events()
  assert.ok(events.some((e) => e.type === 'SIGNAL_SET' && (e as any).signal === 'count' && e.value === 1), 'SIGNAL_SET 事件')
  assert.ok(events.some((e) => e.type === 'DOM_UPDATE' && (e as any).key === 'text'), 'DOM_UPDATE 事件（文本更新）')
  document.body.removeChild(root)
})

test('Show 条件结构：when 变化 → 局部插入/移除（指令化）', () => {
  stream.reset()
  const root = mkRoot()
  const show = signal(false, 'show')
  const node = Show({
    when: () => show(),
    render: () => h('p', { id: 'shown' }, '内容'),
  })
  renderNode(node, root)
  assert.ok(!root.querySelector('#shown'), '初始隐藏')

  show.set(true)
  assert.ok(root.querySelector('#shown'), '条件为真 → 插入')
  assert.equal(root.querySelectorAll('#shown').length, 1, '单实例（非全量重建）')

  show.set(false)
  assert.ok(!root.querySelector('#shown'), '条件为假 → 移除')
  document.body.removeChild(root)
})

test('For 列表结构：keyed 局部更新（增/删只操作变化项）', () => {
  stream.reset()
  const root = mkRoot()
  const items = signal<Array<{ id: string; label: string }>>([{ id: 'a', label: 'A' }], 'items')
  const node = For({
    each: () => items(),
    key: (it: any) => it.id,
    render: (it: any) => h('div', { 'data-id': it.id }, bind(() => it.label)),
  })
  renderNode(node, root)
  assert.equal(root.querySelectorAll('[data-id]').length, 1, '初始 1 项')

  items.set([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }])
  assert.equal(root.querySelectorAll('[data-id]').length, 2, '新增 b（a 复用——无重建）')

  items.set([{ id: 'b', label: 'B' }])
  assert.equal(root.querySelectorAll('[data-id]').length, 1, '移除 a（仅移除指令）')
  assert.ok(root.querySelector('[data-id="b"]'), 'b 保留')
  document.body.removeChild(root)
})

test('effect：signal 变化自动重跑（依赖追踪）', () => {
  stream.reset()
  const root = mkRoot()
  const a = signal(1, 'a')
  const b = signal(10, 'b')
  let runs = 0
  let sum = 0
  effect(() => { sum = a() + b(); runs++ })
  assert.equal(sum, 11, '初始计算')

  a.set(2)
  assert.equal(sum, 12, 'a 变化 → 重跑')
  assert.equal(runs, 2, '重跑 1 次（a 变化）')

  // b 未变化——不重跑
  const before = runs
  a.set(2) // 值相同不触发
  assert.equal(runs, before, '值相同不触发')
  document.body.removeChild(root)
})
