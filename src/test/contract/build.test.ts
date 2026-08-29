/**
 * build 契约——renderToStream 命令流（首帧全量构建——create/insert 序列）
 *
 * 命令流是纯数据（Command[]——只有 apply 需要 DOM）——node 直跑断言：
 * id 分配 / 顺序 / 组件展开一次 / 空洞锚 / Fragment 展开。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h, type VNode } from '../../client/vdom/core/vnode.ts'
import { renderToStream } from '../../client/vdom/core/build.ts'
import { createComponentRegistry, type ComponentRegistry } from '../../client/vdom/core/node/component.ts'
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

test('组件输出数组：compId 子空间（C2——root.0.0/root.0.1——与兄弟槽位隔离）', async () => {
  const Multi = (_i: Record<string, never>) => () => [h('span', {}, 'a'), h('span', {}, 'b')]
  const cmds = await collect(h(Multi, {}))
  const creates = cmds.filter((c) => c.op === 'create').map((c) => (c as { id: string }).id)
  // **C2 修正**：数组输出挂组件 compId 子空间（root.0.0/root.0.1）——
  // 与兄弟槽位隔离（[span, b] 的 b 与后续兄弟同 id——create 幂等顶替/
  // removeVNodeTree 误删——组件树 fuzz 实证——父级平铺是投影冲突）
  assert.deepEqual(creates, ['root.0.0', 'root.0.1'], '多根输出——compId 子空间（组件 id 占 root.0——输出在 .0/.1）')
})

test('组件输出组件（嵌套 async——Ava→Avatar）：命令流 ref=组件 id 语义（消费端契约）', async () => {
  // chat avatar 错位根因（2026-08——用户实证）+ 确定性修复记录：
  // 命令流（生成端——正确）：嵌套组件元素 insert parent=compId（子空间）
  // + 兄弟内容 ref=compId（组件 id）——**组件 id 非 DOM 节点**——消费端
  // ref 解析 null → 插头部（顺序颠倒——avatar 跑到内容后）。
  // **确定性修复（对称补丁——消费端 + Sim）**：ref=组件 id → 物理代表
  // = 其子空间最新插入节点（插入序前缀检索——纯查询零映射）——与
  // parentOf 的「组件逻辑父回退」对称（此前仅 parent 有回退——ref 无）。
  // 生成端零改动（command 流本就正确——本测试锁定其正确形态）。
  const Avatar2 = () => () => h('div', { class: 'avatar' }, 'A')
  const Ava2 = () => () => h(Avatar2, {})
  const Row2 = () => () => h('div', { class: 'row' }, [
    h(Ava2, {}),
    h('div', { class: 'content' }, '内容'),
  ])
  const cmds = await collect(h(Row2, {}))
  const nestedInsert = cmds.find((c) => c.op === 'insert' && c.id === 'root.0.0.0') as any
  assert.ok(nestedInsert, '嵌套组件元素 insert 存在（root.0.0.0）')
  assert.equal(nestedInsert?.parent, 'root.0.0', 'parent = 组件 compId（子空间——parentOf 回退）')
  const contentInsert = cmds.find((c) => c.op === 'insert' && c.id === 'root.0.1') as any
  assert.equal(contentInsert?.ref, 'root.0.0', '内容 ref=组件 id——消费端前缀回退解析（槽位代表）')
  // 插入顺序（命令流序列）——嵌套组件元素先、内容后（ref 语义保证 DOM 顺序）
  const nestedIdx = cmds.findIndex((c) => c.op === 'insert' && c.id === 'root.0.0.0')
  const contentIdx = cmds.findIndex((c) => c.op === 'insert' && c.id === 'root.0.1')
  assert.ok(nestedIdx >= 0 && contentIdx > nestedIdx, '嵌套组件先插、内容后插（ref=组件 id 的顺序语义）')
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

