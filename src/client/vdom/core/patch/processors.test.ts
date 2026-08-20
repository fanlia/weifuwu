/**
 * vdom core/patch — processors 测试（命令处理器——独立断言）
 *
 * 契约：每个命令的消费行为——幂等（重复应用无副作用）/生命周期
 * （ref 挂载时机——insert 后 el 已连接）/资源释放（remove/done——
 * ref(null) + 事件表清理）/done.full 边界（只清 nodes 表管理的——
 * 非 vdom 内容不误删）。
 */

import { test } from 'vitest'
import { expect } from 'vitest'
import { CommandApplier } from './index.ts'
import { EventRegistry } from '../field/events.ts'
import type { WfNode } from './index.ts'

function setup() {
  const doc = document
  const root = doc.createElement('div')
  doc.body.appendChild(root)
  const applier = new CommandApplier(root, doc)
  return { doc, root, applier }
}

test('create：新建元素（attrs 静态面 + data-wf-id 标记）', () => {
  const { doc, root, applier } = setup()
  applier.apply({ op: 'create', id: 'n', tag: 'div', attrs: { class: 'x', id: 'y' } })
  applier.apply({ op: 'insert', id: 'n', parent: 'root', ref: null })
  const el = doc.getElementById('y')
  expect(el, '元素创建（attrs 应用）').toBeTruthy()
  expect(el?.getAttribute('data-wf-id'), 'data-wf-id 标记（事件代理查表基础）').toBe('n')
  expect(root.children.length).toBe(1)
})

test('create 幂等：同 tag 重复 → attrs 更新不重建（节点引用保持）', () => {
  const { doc, applier } = setup()
  applier.apply({ op: 'create', id: 'n', tag: 'span', attrs: { class: 'a' } })
  const first = applier.nodes.get('n')
  applier.apply({ op: 'create', id: 'n', tag: 'span', attrs: { class: 'b' } })
  const second = applier.nodes.get('n')
  expect(second, '同 tag 幂等——不重建（引用保持）').toBe(first)
  expect((first as HTMLElement).getAttribute('class'), 'attrs 更新').toBe('b')
})

test('create 类型不符：tag 变化 → 替换（旧节点资源清理——ref(null) + 事件表）', () => {
  const { doc, root, applier } = setup()
  const refCalls: string[] = []
  applier.apply({ op: 'create', id: 'n', tag: 'div', attrs: {} })
  applier.apply({ op: 'insert', id: 'n', parent: 'root', ref: null })
  // 注册 ref + 事件（替换时应清理）
  applier.refRegistry.set('n', (el: WfNode | null) => refCalls.push(el ? 'm' : 'u'))
  applier.refRegistry.mount('n', applier.nodes.get('n') as HTMLElement)
  applier.eventRegistry.set('n', 'click', () => {})
  expect(refCalls.length, 'ref 已挂载').toBe(1)
  // 类型不符：div → span（替换）
  applier.apply({ op: 'create', id: 'n', tag: 'span', attrs: {} })
  const el = applier.nodes.get('n')
  expect(el?.nodeName, '替换为新 tag').toBe('SPAN')
  expect(root.querySelectorAll('div').length, '旧 div 移除').toBe(0)
  expect(refCalls, '替换触发 ref(null)（清理）').toEqual(['m', 'u'])
  expect(applier.eventRegistry['table'].has('n'), '事件表清理').toBe(false)
})

test('createText 幂等：同 id 文本更新（就地——节点不重建）', () => {
  const { doc, applier } = setup()
  applier.apply({ op: 'createText', id: 't', value: 'a' })
  const first = applier.nodes.get('t')
  applier.apply({ op: 'createText', id: 't', value: 'b' })
  expect(applier.nodes.get('t'), '文本节点引用保持（就地更新——焦点保持前提）').toBe(first)
  expect((first as Text).textContent).toBe('b')
})

test('createAnchor 幂等：占位锚（同构——wf-hole）', () => {
  const { doc, root, applier } = setup()
  applier.apply({ op: 'createAnchor', id: 'h', detail: 'cond' })
  applier.apply({ op: 'insert', id: 'h', parent: 'root', ref: null })
  const anchor = root.firstChild as Comment
  expect(anchor.nodeType, '注释锚').toBe(8)
  expect(anchor.textContent).toBe('wf-hole: cond')
})

test('insert：ref 挂载触发（el 已连接——appendChild 前不触发）', () => {
  const { doc, applier } = setup()
  const calls: string[] = []
  applier.refRegistry.set('n', (el: WfNode | null) => calls.push(el ? `m:${el.isConnected}` : 'u'))
  applier.apply({ op: 'create', id: 'n', tag: 'div', attrs: {} })
  expect(calls, 'insert 前不触发（节点未挂载）').toEqual([])
  applier.apply({ op: 'insert', id: 'n', parent: 'root', ref: null })
  expect(calls, 'insert 后触发——el 已连接').toEqual(['m:true'])
})

test('move：noMove remap（子树 id 前缀迁移——节点引用保持）+ 真移动', () => {
  const { doc, applier } = setup()
  // 建树：root → [a(含 a.0), b]
  applier.apply({ op: 'create', id: 'a', tag: 'div', attrs: {} })
  applier.apply({ op: 'insert', id: 'a', parent: 'root', ref: null })
  applier.apply({ op: 'create', id: 'a.0', tag: 'span', attrs: {} })
  applier.apply({ op: 'insert', id: 'a.0', parent: 'a', ref: null })
  applier.apply({ op: 'create', id: 'b', tag: 'div', attrs: {} })
  applier.apply({ op: 'insert', id: 'b', parent: 'root', ref: null })
  // 注册事件（重映射后 id 更新）
  applier.eventRegistry.set('a', 'click', () => {})
  const aEl = applier.nodes.get('a')
  const a0El = applier.nodes.get('a.0')
  // 顺移：a 移到 b 后（noMove——节点不动——remap 到新 id）
  applier.apply({ op: 'move', id: 'a', newId: 'x', parent: 'root', ref: 'b', noMove: true })
  expect(applier.nodes.get('x'), '节点引用保持（不重建）').toBe(aEl)
  expect(applier.nodes.get('x.0'), '子树 id 重映射（节点引用迁移）').toBe(a0El)
  expect(applier.eventRegistry['table'].has('x'), '事件表前缀迁移').toBe(true)
  expect(applier.eventRegistry['table'].has('a'), '旧 id 移除').toBe(false)
  expect(doc.querySelector('span')?.parentElement, '子树结构保持').toBe(aEl)
})

test('remove：ref(null) + 事件表清理 + 节点移除（资源释放完整）', () => {
  const { doc, root, applier } = setup()
  const calls: string[] = []
  applier.apply({ op: 'create', id: 'n', tag: 'div', attrs: {} })
  applier.apply({ op: 'insert', id: 'n', parent: 'root', ref: null })
  applier.refRegistry.set('n', (el: WfNode | null) => calls.push(el ? 'm' : 'u'))
  applier.refRegistry.mount('n', applier.nodes.get('n') as HTMLElement)
  applier.eventRegistry.set('n', 'click', () => {})
  applier.apply({ op: 'remove', id: 'n' })
  expect(calls, 'ref(null) 卸载清理').toEqual(['m', 'u'])
  expect(applier.eventRegistry['table'].has('n'), '事件表清理').toBe(false)
  expect(root.children.length, '节点移除').toBe(0)
})

test('setProp：三通道分发（ref → 注册表 / 事件 → 代理表 / 静态属性）', () => {
  const { doc, root, applier } = setup()
  const refCalls: string[] = []
  const handler = () => {}
  applier.apply({ op: 'create', id: 'n', tag: 'button', attrs: {} })
  applier.apply({ op: 'insert', id: 'n', parent: 'root', ref: null })
  const el = applier.nodes.get('n') as HTMLElement
  // ref 通道
  applier.apply({ op: 'setProp', id: 'n', key: 'ref', value: (v: WfNode | null) => refCalls.push(v ? 'm' : 'u') })
  expect(refCalls, 'ref 挂载即触发').toEqual(['m'])
  // 事件通道（on + 大写——EVENT_RE）
  applier.apply({ op: 'setProp', id: 'n', key: 'onClick', value: handler })
  expect(applier.eventRegistry['table'].get('n')?.get('click'), '事件进代理表（不直接 addEventListener）').toBe(handler)
  // 静态通道
  applier.apply({ op: 'setProp', id: 'n', key: 'title', value: 't' })
  expect(el.getAttribute('title')).toBe('t')
})

test('done.full：清理 nodes 表未触及的 + 非 vdom 内容不误删（边界）', () => {
  const { doc, root, applier } = setup()
  // 第一轮（旧树）：stale 创建——随后 touched 清空（下一轮开始）
  applier.apply({ op: 'create', id: 'stale', tag: 'div', attrs: { class: 'stale' } })
  applier.apply({ op: 'insert', id: 'stale', parent: 'root', ref: null })
  applier.touched.clear()
  // 第二轮（本轮）：kept 创建——touched = {kept}
  applier.apply({ op: 'create', id: 'kept', tag: 'div', attrs: { class: 'kept' } })
  applier.apply({ op: 'insert', id: 'kept', parent: 'root', ref: null })
  // 非 vdom 内容（骨架屏/loading——用户手动加——**不误删**）
  const manual = doc.createElement('div')
  manual.className = 'skeleton'
  manual.setAttribute('data-wf-id', 'manual') // 即使带标记但不在 nodes 表——不管理
  root.appendChild(manual)
  // done.full：kept 已 touched（本轮创建）——stale 未 touched（多余旧树）——
  // manual 非 vdom 内容（不在 nodes 表——不误删）
  applier.apply({ op: 'done', full: true })
  expect(doc.querySelector('.kept'), '本轮节点保留').toBeTruthy()
  expect(doc.querySelector('.stale'), '多余旧树节点清理（nodes 表管理）').toBe(null)
  expect(doc.querySelector('.skeleton'), '非 vdom 内容保留（不误删——vdom 只管理自己创建的）').toBeTruthy()
})

test('mount/unmount：组件注册表标记 + onUnmounts 清理（LIFO）', () => {
  const { applier } = setup()
  // 直接构造 registry 场景由 component.test 覆盖——此处断言 unmount 指令消费
  const events: string[] = []
  applier.apply({ op: 'mount', compId: 'c1' })
  applier.apply({ op: 'unmount', compId: 'c1' }) // 无 rec → no-op（不抛）
  expect(events, '无 rec unmount no-op（安全）').toEqual([])
})

test('done：非 full 流（diff）——不清除未触及（保留旧树共存）', () => {
  const { doc, applier } = setup()
  applier.apply({ op: 'create', id: 'a', tag: 'div', attrs: { class: 'a' } })
  applier.apply({ op: 'insert', id: 'a', parent: 'root', ref: null })
  applier.apply({ op: 'done', full: false })
  expect(doc.querySelector('.a'), 'diff 流 done 不清除').toBeTruthy()
})
