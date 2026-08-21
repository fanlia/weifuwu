/**
 * build 契约——renderToStream 命令流（首帧全量构建——create/insert 序列）
 *
 * 命令流是纯数据（Command[]——只有 apply 需要 DOM）——node 直跑断言：
 * id 分配 / 顺序 / 组件展开一次 / 空洞锚 / Fragment 展开 / portal。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h, type VNode } from '../../client/vdom/core/vnode.ts'
import { renderToStream } from '../../client/vdom/core/build.ts'
import { createComponentRegistry, type ComponentRegistry } from '../../client/vdom/core/node/component.ts'
import { createPortal } from '../../client/vdom/core/node/portal.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'
import type { UIContext } from '../../client/vdom/context/UIContext.ts'

/** 收集命令流 → Command[]（纯数据——零 DOM） */
async function collect(vnode: VNode, registry: ComponentRegistry = createComponentRegistry()): Promise<Command[]> {
  const cmds: Command[] = []
  const reader = renderToStream(vnode, {} as UIContext, registry).getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    cmds.push(value)
  }
  return cmds
}

const ops = (cmds: Command[]) => cmds.map((c) => c.op)

test('首帧：create → insert → close → done.full（id 层级路径）', async () => {
  const cmds = await collect(h('div', { class: 'a' }, 'hello'))
  assert.deepEqual(ops(cmds), ['create', 'insert', 'createText', 'insert', 'close', 'done'])
  const create = cmds[0] as { id: string; tag: string }
  assert.equal(create.id, 'root.0', 'root 子节点 id = root.0')
  assert.equal((cmds[2] as { id: string }).id, 'root.0.0', '文本 id = 子路径')
  assert.deepEqual(cmds[3], { op: 'insert', id: 'root.0.0', parent: 'root.0', ref: null }, '文本插入 div 下')
  assert.deepEqual(cmds[4], { op: 'close', id: 'root.0' }, '树构建结束标记')
  assert.deepEqual(cmds[5], { op: 'done', full: true }, '首帧 done.full（整树标记）')
})

test('create 命令：attrs 携带属性面（attribute/style——事件不在此）', async () => {
  const cmds = await collect(h('button', { class: 'btn', disabled: true, onClick: () => {}, style: { color: 'red' } }, 'x'))
  const create = cmds[0] as { attrs: Record<string, unknown> }
  assert.deepEqual(create.attrs, { class: 'btn', disabled: true, style: { color: 'red' } },
    'attrs = 属性面（attribute + style）——事件走事件表（不在 create）')
})

test('组件：工厂执行一次——输出挂组件 id（mount 命令）', async () => {
  let mounts = 0
  const Counter = (_i: Record<string, never>) => { mounts++; return () => h('span', { class: 'c' }, 'x') }
  const cmds = await collect(h(Counter, {}))
  assert.equal(mounts, 1, '工厂执行一次')
  const create = cmds[0] as { id: string; tag: string }
  assert.equal(create.id, 'root.0', '组件输出节点直接挂组件 id（组件 = 输出节点）')
  assert.equal(create.tag, 'span')
  const mount = cmds.find((c) => c.op === 'mount') as { compId: string }
  assert.equal(mount?.compId, 'root.0', 'mount 命令登记组件实例')
})

test('组件输出数组：多根平铺（root.0/root.1——组件 id 不占位）', async () => {
  const Multi = (_i: Record<string, never>) => () => [h('span', {}, 'a'), h('span', {}, 'b')]
  const cmds = await collect(h(Multi, {}))
  const creates = cmds.filter((c) => c.op === 'create').map((c) => (c as { id: string }).id)
  assert.deepEqual(creates, ['root.0', 'root.1'], '多根平铺——组件输出数组 = 隐式 Fragment')
})

test('空洞：false/null 建占位锚（CreateAnchor——DOM 同构前提）', async () => {
  const cmds = await collect(h('div', {}, [h('span', {}, 'a'), false, null, h('b', {}, 'x')]))
  const anchors = cmds.filter((c) => c.op === 'createAnchor').map((c) => (c as { id: string }).id)
  assert.deepEqual(anchors, ['root.0.1', 'root.0.2'], '每空洞槽位一个锚（槽位 1/2）——childNodes 长度恒定')
})

test('Fragment/数组：展开为父级子节点（无中间层——槽位连续）', async () => {
  const cmds = await collect(h('div', {}, [h('span', { class: 'a' }, 'a'), [h('i', {}, 'i1'), h('i', {}, 'i2')], h('span', { class: 'b' }, 'b')]))
  const creates = cmds.filter((c) => c.op === 'create').map((c) => (c as { id: string; tag?: string }).tag)
  assert.deepEqual(creates, ['div', 'span', 'i', 'i', 'span'], '数组项展开（隐式 Fragment）——槽位平铺')
})

test('portal：槽位建锚 + 内容渲染进 portal 容器（portal:key 命名空间）', async () => {
  const cmds = await collect(h('div', {}, [createPortal(h('div', { class: 'p' }, '弹层'), 'my-portal')]))
  const anchor = cmds.find((c) => c.op === 'createAnchor') as { id: string }
  assert.equal(anchor?.id, 'root.0.0', 'portal 槽位 = 锚（位置持有）')
  const portalCreate = cmds.find((c) => c.op === 'create' && (c as { id: string }).id === 'portal:my-portal.0') as { id: string; tag: string }
  assert.equal(portalCreate?.tag, 'div', 'portal 内容渲染进 portal:my-portal 容器')
  const portalInsert = cmds.find((c) => c.op === 'insert' && (c as { id: string }).id === 'portal:my-portal.0') as { parent: string }
  assert.equal(portalInsert?.parent, 'portal:my-portal', 'parent = portal 容器（独立命名空间）')
})
