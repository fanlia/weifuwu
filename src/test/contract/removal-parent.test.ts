/**
 * 组件输出清理 parent 语义（证明审计——sink 特判对齐）
 *
 * 背景：removeVNodeTree 的 parent 参数 = "渲染时 sink 的 parent"——三处
 * 错位实证（fuzz 生成器盲区——组件输出数组项从未带 key）：
 * ① 数组分支：组件输出数组内 keyed 组件——渲染 keyedId(compId, key)
 *   （数组挂 compId 子空间）——清理传槽位父 → keyedId 错位
 *   （root.0.0.kk1 渲染 vs root.0.kk1 清理——unmount 卸错——实例残留）
 * ② 组件输出 keyed 组件（单输出）：渲染 sink(组件, compId, 0)——清理
 *   transitionComponent/diffSame 顶层传槽位父——同源错位
 * ③ 组件输出 Fragment 含 keyed 组件：渲染挂槽位父——清理组件分支递归
 *   传 compId——index 推导 + keyedId 错位（组件在非 0 槽位时）
 *
 * 修复：removalParent（cleanup.ts 单一实现源——组件/数组 → compId；
 * Fragment → 槽位父）+ 数组分支递归传 base——三调用点统一。
 *
 * **v1 退役（2027-08）**：实例权威迁移 v2 段表（segments）——断言逻辑不变
 * （unmount compId 命中/工厂不重跑/实例面无残留——段表为权威）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h } from '../../client/vdom/core/vnode.ts'
import { Fragment } from '../../client/vdom/core/node/fragment.ts'
import { diffToStreamV2 } from '../../client/vdom/core/v2/integrate.ts' // v1 退役——v2 桥
import { renderToStreamV2 } from '../../client/vdom/core/v2/integrate.ts' // v1 退役——v2 桥
import { keyedId } from '../../client/vdom/core/node/keyed.ts'
import type { Segment } from '../../client/vdom/core/v2/diff.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'

async function drain(s: ReadableStream<Command>): Promise<Command[]> {
  const out: Command[] = []
  const r = s.getReader()
  while (true) { const { value, done } = await r.read(); if (done) break; out.push(value) }
  return out
}

function segments() { return new Map<string, Segment>() }

const unmountsOf = (cmds: Command[]): string[] => cmds.filter((c) => c.op === 'unmount').map((c) => (c as { compId: string }).compId)

test('G10：组件输出数组内 keyed 组件——类型切换 unmount compId 一致（错位实证①）', async () => {
  const Inner = () => () => h('span', {}, 'i')
  const A = () => () => [h(Inner, { key: 'k1' })]   // 输出数组含 keyed 组件
  const B = () => () => h('div', {}, 'b')            // 异类型（触发切换清理）
  const segs = segments()
  const oldT = h('div', {}, [h(A, {})])
  const newT = h('div', {}, [h(B, {})])
  await drain(renderToStreamV2(oldT, {}, undefined, segs))
  assert.ok(segs.get(keyedId('root.0.0', 'k1')), 'build 后 Inner 段在 compId 子空间（root.0.0.kk1）')
  const d = await drain(diffToStreamV2(oldT, newT, {}, undefined, segs))
  const um = unmountsOf(d)
  assert.ok(um.includes(keyedId('root.0.0', 'k1')), `unmount 必须命中渲染 compId root.0.0.kk1（实际: ${um.join(',')}——修复前 root.0.kk1 错位）`)
})

test('G10：组件输出 keyed 组件（单输出）——转换路径 unmount compId 一致（错位实证②）', async () => {
  const Inner = () => () => h('span', {}, 'i')
  const A = () => () => h(Inner, { key: 'k1' })      // 输出单 keyed 组件
  const B = () => () => h('div', {}, 'b')
  const segs = segments()
  const oldT = h('div', {}, [h(A, {})])
  const newT = h('div', {}, [h(B, {})])
  await drain(renderToStreamV2(oldT, {}, undefined, segs))
  assert.ok(segs.get(keyedId('root.0.0', 'k1')), '渲染 compId = keyedId(外层 compId)——root.0.0.kk1')
  const d = await drain(diffToStreamV2(oldT, newT, {}, undefined, segs))
  const um = unmountsOf(d)
  assert.ok(um.includes(keyedId('root.0.0', 'k1')), `unmount 命中 root.0.0.kk1（实际: ${um.join(',')}）`)
})

test('G10：组件输出 Fragment 含 keyed 组件——unmount compId 一致（错位实证③）', async () => {
  const Inner = () => () => h('span', {}, 'i')
  const A = () => () => h(Fragment, {}, [h(Inner, { key: 'k1' })])  // 输出 Fragment
  const B = () => () => h('div', {}, 'b')
  const segs = segments()
  const oldT = h('div', {}, [h(A, {})])
  const newT = h('div', {}, [h(B, {})])
  await drain(renderToStreamV2(oldT, {}, undefined, segs))
  // Fragment 渲染挂槽位父（root.0）——内项 keyedId('root.0', 'k1')
  assert.ok(segs.get(keyedId('root.0', 'k1')), '渲染 compId = keyedId(槽位父)')
  const d = await drain(diffToStreamV2(oldT, newT, {}, undefined, segs))
  const um = unmountsOf(d)
  assert.ok(um.includes(keyedId('root.0', 'k1')), `unmount 命中 root.0.kk1（实际: ${um.join(',')}）`)
})

test('G10：keyed 组件输出收缩（vnode → null）——unmount + 区间移除（错位实证④）', async () => {
  let showInner = true
  let innerFactoryRuns = 0
  const Inner = (() => { innerFactoryRuns++; return () => h('span', {}, 'i') })
  const Outer = () => () => showInner ? h(Inner, {}) : null
  const segs = segments()
  const oldT = h('div', {}, [h(Outer, { key: 'k1' })])
  await drain(renderToStreamV2(oldT, {}, undefined, segs))
  assert.ok(segs.get(keyedId('root.0', 'k1') + '.0'), 'build 后 Inner 段（root.0.kk1.0）')
  showInner = false
  const d = await drain(diffToStreamV2(oldT, h('div', {}, [h(Outer, { key: 'k1' })]), {}, undefined, segs))
  const um = unmountsOf(d)
  assert.ok(um.includes(keyedId('root.0', 'k1') + '.0'), `输出收缩必须 unmount Inner（实际: ${um.join(',')}——缺失则实例残留）`)
  assert.ok(d.some((c) => c.op === 'remove' && c.id === keyedId('root.0', 'k1') + '.0.0'), '区间移除（Inner 输出的 DOM）')
  assert.ok(d.some((c) => c.op === 'createAnchor'), '收缩后占位锚（同构保持）')
})

test('G10：keyed 组件输出 keyed 组件——对照段复用 + id 空间一致（错位实证⑤）', async () => {
  let innerFactoryRuns = 0
  const Inner = (() => { innerFactoryRuns++; return () => h('b', {}, 'b') })
  const Outer = () => () => h(Inner, { key: 'x' })   // 输出 keyed 组件
  const segs = segments()
  const oldT = h('div', {}, [h(Outer, { key: 'k1' })])
  await drain(renderToStreamV2(oldT, {}, undefined, segs))
  const f0 = innerFactoryRuns
  assert.ok(segs.get(keyedId(keyedId('root.0', 'k1'), 'x')), 'build 后 Inner 段（keyedId(root.0.kk1, x)）')
  const d = await drain(diffToStreamV2(oldT, h('div', {}, [h(Outer, { key: 'k1' })]), {}, undefined, segs))
  assert.equal(innerFactoryRuns, f0, 'Inner 工厂不重跑（段复用——修复前落空重建）')
  assert.ok(!d.some((c) => c.op === 'mount'), `无 mount（复用——实际: ${d.map((c) => c.op).join(',')}）`)
  assert.deepEqual([...segs.keys()].sort(), [keyedId('root.0', 'k1'), keyedId(keyedId('root.0', 'k1'), 'x')], '段表无残留无错位')
})
