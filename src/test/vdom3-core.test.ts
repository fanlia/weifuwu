/**
 * vdom3 核心测试——vnode + stream（渲染执行 = 事件流）
 *
 * 验证核心不变量：
 *   1. mount：vnode 树 → 事件流（NODE_CREATE/TEXT_CREATE/INSERT/PROP_UPDATE）→ DOM
 *   2. patch：同位置同类型复用——仅变化发事件（TEXT_UPDATE/PROP_UPDATE）
 *   3. 异类型 → REMOVE + CREATE + INSERT（重建事件）
 *   4. 列表 keyed：同 key 复用——增删只操作变化项
 *   5. DOM = fold(事件流)：事件序列可断言（回放基础）
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './client/setup.ts'
import { h, mount, patch, stream } from '../ui-dom/vdom3/index.ts'

before(setupJsdom)

function mkRoot(): HTMLElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return root
}

test('mount：vnode 树 → 事件流（CREATE/INSERT/PROP_UPDATE）→ DOM', () => {
  stream.reset()
  const root = mkRoot()
  const tree = h('div', { id: 'box', class: 'a' }, [
    h('span', {}, 'hello'),
    h('button', { onClick: () => {} }, '点击'),
  ])
  mount(tree, root)

  assert.ok(root.querySelector('#box'), '元素渲染')
  assert.equal(root.querySelector('span')?.textContent, 'hello', '文本渲染')

  const events = stream.events()
  assert.ok(events.some((e) => e.type === 'NODE_CREATE' && (e as any).tag === 'div'), 'NODE_CREATE 事件（div）')
  assert.ok(events.some((e) => e.type === 'NODE_CREATE' && (e as any).tag === 'button'), 'NODE_CREATE 事件（button）')
  assert.ok(events.some((e) => e.type === 'INSERT'), 'INSERT 事件')
  assert.ok(events.some((e) => e.type === 'PROP_UPDATE' && (e as any).key === 'class'), 'PROP_UPDATE 事件（class）')
  document.body.removeChild(root)
})

test('patch：同位置同类型复用——仅文本/属性变化发事件（无重建）', () => {
  stream.reset()
  const root = mkRoot()
  // 直接构造两棵树
  const v1 = h('div', { id: 'box', class: 'a' }, ['旧文本'])
  const v2 = h('div', { id: 'box', class: 'b' }, ['新文本'])
  mount(v1, root)
  const box = root.querySelector('#box')!
  const text = box.firstChild as Text
  stream.reset() // 清掉 mount 事件——只测 patch 事件

  patch(v1, v2, root)

  assert.equal(text.nodeValue, '新文本', '文本更新（同一节点——未重建）')
  assert.equal(box.getAttribute('class'), 'b', '属性更新（同一元素）')
  assert.equal(box.childNodes.length, 1, '无节点增删（复用）')
  assert.equal(root.querySelectorAll('#box').length, 1, '单实例（无重建）')

  const events = stream.events()
  assert.ok(events.some((e) => e.type === 'TEXT_UPDATE'), 'TEXT_UPDATE 事件')
  assert.ok(events.some((e) => e.type === 'PROP_UPDATE' && (e as any).key === 'class' && e.value === 'b'), 'PROP_UPDATE 事件（class a→b）')
  assert.ok(!events.some((e) => e.type === 'NODE_CREATE'), '无 NODE_CREATE（未重建）')
  document.body.removeChild(root)
})

test('异类型/异 key → REMOVE + CREATE + INSERT（重建事件）', () => {
  stream.reset()
  const root = mkRoot()
  const v1 = h('div', {}, [h('span', { id: 'old' }, '旧')])
  const v2 = h('div', {}, [h('p', { id: 'new' }, '新')])
  mount(v1, root)
  stream.reset()

  patch(v1, v2, root)

  assert.ok(!root.querySelector('#old'), '旧元素移除')
  assert.ok(root.querySelector('#new'), '新元素创建')
  const events = stream.events()
  assert.ok(events.some((e) => e.type === 'REMOVE'), 'REMOVE 事件（旧节点）')
  assert.ok(events.some((e) => e.type === 'NODE_CREATE' && (e as any).tag === 'p'), 'NODE_CREATE 事件（新节点）')
  assert.ok(events.some((e) => e.type === 'INSERT'), 'INSERT 事件（新节点）')
  document.body.removeChild(root)
})

test('列表 keyed：同 key 复用——增删只操作变化项（事件断言）', () => {
  stream.reset()
  const root = mkRoot()
  const mk = (items: Array<{ id: string; label: string }>) =>
    h('ul', {}, items.map((it) => h('li', { key: it.id, 'data-id': it.id }, it.label)))
  const v1 = mk([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }])
  mount(v1, root)
  assert.equal(root.querySelectorAll('li').length, 2, '初始 2 项')

  stream.reset()
  const v2 = mk([{ id: 'a', label: 'A' }, { id: 'c', label: 'C' }])
  patch(v1, v2, root)
  assert.equal(root.querySelectorAll('li').length, 2, 'b→c 替换（a 复用）')
  assert.ok(root.querySelector('[data-id="a"]'), 'a 保留（复用）')
  assert.ok(root.querySelector('[data-id="c"]'), 'c 新增')
  assert.ok(!root.querySelector('[data-id="b"]'), 'b 移除')

  const events = stream.events()
  const creates = events.filter((e) => e.type === 'NODE_CREATE')
  assert.equal(creates.length, 1, '仅 c 创建（a/b 复用——无全量重建）')
  document.body.removeChild(root)
})

test('事件流可断言：DOM = fold(事件流)——事件序列精确描述渲染', () => {
  stream.reset()
  const root = mkRoot()
  const v1 = h('div', { id: 'box' }, ['初始'])
  mount(v1, root)
  const mountEvents = stream.events()
  // 事件序列：NODE_CREATE(div) → ... → TEXT_CREATE → INSERT
  const first = mountEvents[0]
  assert.equal(first.type, 'NODE_CREATE', '事件流第一条 = 根节点创建')
  const hasTextCreate = mountEvents.some((e) => e.type === 'TEXT_CREATE' && e.value === '初始')
  assert.ok(hasTextCreate, 'TEXT_CREATE 事件携带文本内容')
  const hasInsert = mountEvents.some((e) => e.type === 'INSERT')
  assert.ok(hasInsert, 'INSERT 事件（根入 root）')
  document.body.removeChild(root)
})
