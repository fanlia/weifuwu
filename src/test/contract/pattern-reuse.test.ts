/**
 * PatternLive 场景契约——组件切换残留（SPA 导航 demo 混合）
 *
 * 场景：组件 A（AppShell 结构）→ 卸载（列表页）→ 同位置挂组件 B
 * （SplitWorkspace 结构）——断言：A 节点全 remove、B 全新 create（零复用残留）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h, type VNode } from '../../client/vdom/core/vnode.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'
import { diffToStreamV2 } from '../../client/vdom/core/v2/integrate.ts' // v1 退役——v2 桥
import { renderToStreamV2 } from '../../client/vdom/core/v2/integrate.ts' // v1 退役——v2 桥
import { createComponentRegistry } from '../../client/vdom/core/node/component.ts'
import type { Segment } from '../../client/vdom/core/v2/diff.ts'
import type { UIContext } from '../../client/vdom/context/UIContext.ts'

async function diff(
  oldTree: VNode, newTree: VNode,
  segments: Map<string, Segment> = new Map(),
): Promise<Command[]> {
  const cmds: Command[] = []
  const reader = diffToStreamV2(oldTree, newTree, {} as UIContext, undefined, segments).getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    cmds.push(value)
  }
  return cmds
}
async function build(tree: VNode, segments: Map<string, Segment> = new Map()): Promise<Command[]> {
  const cmds: Command[] = []
  const reader = renderToStreamV2(tree, {} as UIContext, undefined, segments).getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    cmds.push(value)
  }
  return cmds
}
const ops = (cmds: Command[]) => cmds.map((c: any) => c.op + (c.id ? ':' + c.id : ''))

test('组件切换：A → 列表（卸载）→ 同位置 B——命令流正确（PatternLive 场景）', async () => {
  const CompA = () => () => h('aside', {}, [h('nav', {}, 'A-nav'), h('div', {}, 'A-files')])
  const CompB = () => () => h('aside', {}, [h('div', {}, 'B-files')])
  const segs = new Map<string, Segment>()
  const v0 = h('div', {}, [h(CompA, {})])
  const v1 = h('div', {}, [h('ul', {}, '列表')])
  const v2 = h('div', {}, [h(CompB, {})])
  // 0. 先挂载 A（段表有 A 的段——模拟真实导航历史）
  await build(v0, segs)
  // 1. A → 列表：A 卸载 + 输出区间 remove（transform 组件→X——子树由 patch
  //    层 procRemove 前缀清理——契约层只验证命令流正确）
  const c1 = await diff(v0, v1, segs)
  const ops1 = ops(c1)
  assert.ok(ops1.some(o => o === 'unmount'), `A 组件卸载（实际 ${ops1.join(',')}）`)
  assert.ok(ops1.some(o => o.startsWith('remove:')), `A 首节点 remove（实际 ${ops1.join(',')}）`)
  // 2. 列表 → B：B 全新 create（旧树是列表——remove 只清 ul）
  const c2 = await diff(v1, v2, segs)
  const ops2 = ops(c2)
  assert.ok(ops2.some(o => o.startsWith('create:')), `B 创建（实际 ${ops2.join(',')}）`)
})

test('组件同位置异类型切换：A → B 直接（diffSame 异类型分支——卸载+重建）', async () => {
  const CompA = () => () => h('aside', {}, [h('nav', {}, 'A-nav')])
  const CompB = () => () => h('aside', {}, [h('div', {}, 'B-file')])
  const segs = new Map<string, Segment>()
  const v0 = h('div', {}, [h(CompA, {})])
  const v2 = h('div', {}, [h(CompB, {})])
  await build(v0, segs) // A 先挂载（段表有 A 段——异类型分支：清输出 + dispose + 重建）
  const c = await diff(v0, v2, segs)
  const ops2 = ops(c)
  // 异类型：段 dispose（生成期）+ 输出区间递归 remove（A 的 nav 子节点也
  // remove——完整清理）
  assert.ok(ops2.some(o => o.startsWith('remove:root.0.0.0')), `A 子节点 nav remove（实际 ${ops2.join(',')}）`)
  assert.ok(ops2.some(o => o.startsWith('remove:root.0.0')), `A 首节点 remove（实际 ${ops2.join(',')}）`)
  assert.ok(ops2.some(o => o.startsWith('create:')), `B 重建（实际 ${ops2.join(',')}）`)
})
