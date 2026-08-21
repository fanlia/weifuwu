/**
 * diff 契约——diffStream 增量命令流（旧树 vs 新树 → 就地 patch 命令）
 *
 * 核心不变量（设计规则 §6.3 三层一致）：
 * - 同类型元素 → setProp/setText 就地更新（不重建）
 * - 组件同类型复用（工厂不重跑——renderFn 重新调用）
 * - 异类型/空洞 ↔ 真实 → transform 让位（childNodes 同构——长度恒定）
 * - keyed 重排 → move 命令（身份跟随）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h, type VNode } from '../../client/vdom/core/vnode.ts'
import { createPortal } from '../../client/vdom/core/node/portal.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'
import { diffStream } from '../../client/vdom/core/diff/index.ts'
import { renderToStream } from '../../client/vdom/core/build.ts'
import { createComponentRegistry, type ComponentRegistry } from '../../client/vdom/core/node/component.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'
import type { UIContext } from '../../client/vdom/context/UIContext.ts'

/** 收集 diff 命令流（纯数据——零 DOM） */
async function diff(
  oldTree: VNode,
  newTree: VNode,
  registry: ComponentRegistry = createComponentRegistry(),
): Promise<Command[]> {
  const cmds: Command[] = []
  const reader = diffStream(oldTree, newTree, {} as UIContext, registry).getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    cmds.push(value)
  }
  return cmds
}

const ops = (cmds: Command[]) => cmds.map((c) => c.op)

test('同类型元素：属性变化 → setProp（只发变化的键——未变零命令）', async () => {
  const cmds = await diff(
    h('div', { class: 'old', id: 'x' }, 't'),
    h('div', { class: 'new', id: 'x' }, 't'),
  )
  assert.deepEqual(cmds, [{ op: 'setProp', id: 'root.0', key: 'class', value: 'new' }, { op: 'done' }],
    '只发 class 变化——id 未变不发——就地 patch 不重建')
})

test('文本变化 → setText 就地更新（不重建节点——焦点保持前提）', async () => {
  const cmds = await diff(
    h('div', {}, 'v1'),
    h('div', {}, 'v2'),
  )
  assert.deepEqual(cmds, [{ op: 'setText', id: 'root.0.0', value: 'v2' }, { op: 'done' }],
    '文本节点 setText——create/insert 零命令')
})

test('组件同类型复用：工厂不重跑（renderFn 重新调用——命令流生成时消费）', async () => {
  let mounts = 0
  const Counter = (_i: Record<string, never>) => { mounts++; return () => h('span', { class: 'c' }, 'x') }
  const reg = createComponentRegistry()
  // 先渲染旧树（工厂执行）→ diff 新树（复用 rec——工厂不重跑）
  const drain = async (s: ReadableStream) => { const r = s.getReader(); while (true) { const { done } = await r.read(); if (done) break } }
  await drain(renderToStream(h(Counter, { value: 1 }), {} as UIContext, reg))
  assert.equal(mounts, 1, '首帧工厂执行一次')
  const cmds = await diff(h(Counter, { value: 1 }), h(Counter, { value: 2 }), reg)
  assert.equal(mounts, 1, 'diff 后工厂不重跑——实例复用')
  assert.equal(ops(cmds).includes('create'), false, '无 create——组件复用不重建')
})

test('异类型：element → 组件（transform 让位——旧侧 remove + 新侧 create）', async () => {
  const Comp = (_i: Record<string, never>) => () => h('span', {}, 'c')
  const cmds = await diff(
    h('div', { class: 'old' }, 'x'),
    h(Comp, {}),
  )
  assert.ok(ops(cmds).includes('remove'), '旧侧移除')
  assert.ok(ops(cmds).includes('create'), '新侧创建')
})

test('数组缩短：末项 remove（同构 1:1——就地）', async () => {
  const cmds = await diff(
    h('div', {}, [h('span', { class: 'a' }, 'a'), h('b', {}, 'bold')]),
    h('div', {}, [h('span', { class: 'a' }, 'a')]),
  )
  assert.ok(cmds.some((c) => c.op === 'remove' && (c as { id: string }).id === 'root.0.1'), '末项移除')
  assert.ok(!cmds.some((c) => c.op === 'create'), '首项保留——无重建')
})

test('空洞 → 真实元素（占位互换——不塌缩 childNodes）', async () => {
  const cmds = await diff(
    h('div', {}, [h('span', {}, 'a'), false, h('button', {}, 'b')]),
    h('div', {}, [h('span', {}, 'a'), h('div', { class: 'alert' }, 'err'), h('button', {}, 'b')]),
  )
  assert.ok(ops(cmds).includes('create'), '空洞槽位创建真实元素')
  assert.ok(!cmds.some((c) => c.op === 'remove' && (c as { id: string }).id.endsWith('.2')), '兄弟 button 不误删（§6.3 占位事故）')
})

test('keyed 顺移：remove + move 命令（节点复用——remap-only）', async () => {
  const make = (keys: string[]) => h('div', {}, keys.map((k) => h('span', { key: k, class: k }, k)))
  const cmds = await diff(make(['a', 'b', 'c']), make(['b', 'c']))
  const ids = cmds.map((c) => (c as { id: string }).id)
  assert.ok(ids.includes('root.0.0') && cmds.some((c) => c.op === 'remove'), '移除 a（旧索引 0）')
  assert.ok(cmds.some((c) => c.op === 'move'), `remap-only——b/c 节点 move 复用（实际: ${JSON.stringify(ids)}）`)
  assert.ok(!cmds.some((c) => c.op === 'create'), '无重建——节点复用')
})

test('keyed 循环移位：冲突重建（DOM 重建）但组件实例复用（工厂不重跑——状态保持）', async () => {
  let mounts = 0
  const Item = (_i: Record<string, never>, props: { name: string }) => { mounts++; return () => h('span', { class: 'item' }, props.name) }
  const mkC = (keys: string[]) => h('div', {}, keys.map((k) => h(Item, { key: k, name: k })))
  const reg = createComponentRegistry()
  const drain = async (s: ReadableStream) => { const r = s.getReader(); while (true) { const { done } = await r.read(); if (done) break } }
  await drain(renderToStream(mkC(['a', 'b', 'c']), {} as UIContext, reg))
  assert.equal(mounts, 3, '首帧 3 个组件实例')
  const cmds = await diff(mkC(['a', 'b', 'c']), mkC(['c', 'a', 'b']), reg)
  assert.equal(mounts, 3, '循环移位——.k{key} 实例复用（工厂不重跑——状态保持）')
  assert.ok(cmds.every((c) => c.op === 'remove' || c.op === 'create' || c.op === 'insert' || c.op === 'close' || c.op === 'done' || c.op === 'mount' || c.op === 'unmount'),
    'move id 空间重叠根治——整块重建（设计决策）')
})

test('keyed 增删：移除消失项 + 新增项插入（身份映射）', async () => {
  const make = (keys: string[]) => h('div', {}, keys.map((k) => h('span', { key: k, class: k }, k)))
  const cmds = await diff(make(['a', 'b', 'c']), make(['a', 'c', 'd']))
  assert.ok(cmds.some((c) => c.op === 'remove' && (c as { id: string }).id.endsWith('.1')), 'b 移除（keyed 映射）')
  assert.ok(ops(cmds).includes('create'), 'd 新增')
})

test('keyed 数组移除 portal vnode → removePortal 命令（Menubar 面板残留回归）', async () => {
  // build 树：keyed 项（trigger）+ portal（key=popover）→ diff 新树（仅 trigger）
  const v0 = h('div', {}, [
    h('button', { key: 'file' }, '文件'),
    h('button', { key: 'edit' }, '编辑'),
    createPortal(h('div', { class: 'panel' }, '面板'), 'popover'),
  ])
  const v1 = h('div', {}, [
    h('button', { key: 'file' }, '文件'),
    h('button', { key: 'edit' }, '编辑'),
  ])
  // diff 树（旧含 portal → 新无——keyed 移除路径）
  const cmds1 = await diff(v0, v1)
  console.log('[dbg-keyed-portal]', JSON.stringify(cmds1.map((c) => c.op + (c.key ? ':' + c.key : '') + (c.id ? ':' + c.id : ''))))
  const hasRemovePortal = cmds1.some((c) => c.op === 'removePortal' && c.key === 'popover')
  assert.equal(hasRemovePortal, true, 'keyed 移除 portal → removePortal 命令')
  const hasRemove = cmds1.some((c) => c.op === 'remove')
  assert.equal(hasRemove, true, 'remove 命令')
})
