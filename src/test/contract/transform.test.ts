/**
 * vdom transform — 状态机测试（转换表选择 + **完整转换**策略命令）
 *
 * 锁定规则（设计规则 §4.0/§6.3——占位法）：
 * - 同态（text→text/element→element/component→component/hole→hole/
 *   fragment→fragment）= null 策略（diff 就地 patch——不重建）
 * - **异态 = 完整转换**（状态机——各状态文件）：旧侧让位（remove/
 *   unmountComp）+ ctx.emitNode 新侧渲染——diff 只查表调用——不手写转换
 * - component → X 先 unmount（onUnmounts 清理）再移除
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { transitionOf, runTransition, TRANSITIONS } from '../../client/vdom/core/transform/table.ts'
import { stateOf } from '../../client/vdom/core/transform/states.ts'
import { h } from '../../client/vdom/core/vnode.ts'
import { Fragment } from '../../client/vdom/core/node/fragment.ts'
import type { TransformContext } from '../../client/vdom/core/transform/index.ts'

function mkCtx(cmds: unknown[], emitted: unknown[] = [], oldCompId?: string): TransformContext {
  return {
    emit: (c) => cmds.push(c),
    emitNode: async (v) => { emitted.push(v) },
    oldId: 'root.1', newId: 'root.1', parent: 'root.0', index: 1, ref: 'root.0.0',
    ...(oldCompId ? { oldCompId } : {}),
  }
}

test('转换表完整性：6×6 全策略（同态 null + 异态函数）', () => {
  const states = ['text', 'hole', 'element', 'component', 'fragment', 'array']
  for (const old of states) {
    for (const next of states) {
      const fn = TRANSITIONS[old as keyof typeof TRANSITIONS]?.[next as never]
      if (old === next) {
  assert.equal(fn, null, `${old} → ${next} 同态——就地 patch`)
      } else {
  assert.equal(typeof fn, 'function', `${old} → ${next} 应有转换策略`)
      }
    }
  }
})

test('stateOf：vnode 形态 → 转换状态', () => {
  assert.equal(stateOf(null), 'hole')
  assert.equal(stateOf(false), 'hole')
  assert.equal(stateOf('text'), 'text')
  assert.equal(stateOf(42), 'text')
  assert.equal(stateOf({ type: 'div', props: {}, key: null } as never), 'element')
  assert.equal(stateOf({ type: () => () => null, props: {}, key: null } as never), 'component')
  assert.equal(stateOf([]), 'array')
})

test('null <-> component：hole → component 完整转换（锚让位 + 新侧渲染）', async () => {
  const cmds: unknown[] = []
  const emitted: unknown[] = []
  const comp = { type: () => () => null, props: {}, key: null }
  await runTransition('hole', 'component', null, comp as never, mkCtx(cmds, emitted))
  assert.deepEqual(cmds, [{ op: 'remove', id: 'root.1' }], '旧锚移除')
  assert.deepEqual(emitted, [comp], '新侧经 emitNode 渲染（状态机完整）')
})

test('null <-> fragment：hole → fragment 完整转换（条件渲染空数组）', async () => {
  const cmds: unknown[] = []
  const emitted: unknown[] = []
  await runTransition('hole', 'fragment', null, [], mkCtx(cmds, emitted))
  assert.equal(cmds.length, 1)
  assert.deepEqual(emitted, [[]])
})

test('component <-> fragment：component 先 unmount 再移除 + 新侧渲染', async () => {
  const cmds: unknown[] = []
  const emitted: unknown[] = []
  const ctx = mkCtx(cmds, emitted)
  ctx.oldCompId = 'root.1'
  await runTransition('component', 'fragment', { type: () => () => null }, [], ctx)
  assert.deepEqual(cmds, [
    { op: 'unmount', compId: 'root.1' },
    { op: 'remove', id: 'root.1' },
  ])
  assert.deepEqual(emitted, [[]], '新侧渲染')
})

test('element <-> component：元素让位 + 新侧渲染（无组件卸载）', async () => {
  const cmds: unknown[] = []
  const emitted: unknown[] = []
  const comp = { type: () => () => null, props: {}, key: null }
  await runTransition('element', 'component', { type: 'div', props: {}, key: null }, comp as never, mkCtx(cmds, emitted))
  assert.deepEqual(cmds, [{ op: 'remove', id: 'root.1' }])
  assert.deepEqual(emitted, [comp])
})

test('transitionOf：同态 null / 异态函数', () => {
  assert.equal(transitionOf('text', 'text'), null)
  assert.equal(transitionOf('element', 'element'), null)
  assert.equal(transitionOf('component', 'component'), null, '同类型组件复用——diff 层')
  assert.equal(typeof transitionOf('hole', 'element'), 'function')
  assert.equal(typeof transitionOf('fragment', 'component'), 'function')
})

test('转换表缺省安全：未知状态对 → null（no-op）', () => {
  assert.equal(transitionOf('unknown' as never, 'element'), null)
})

// ── 状态机全分支测试（每个异态对的转换行为——旧侧清理 + 新侧渲染） ──

function runT(oldState: string, newState: string, oldNode: unknown, nextNode: unknown, opts?: { oldCompId?: string }) {
  const cmds: unknown[] = []
  const emitted: unknown[] = []
  return {
    cmds, emitted,
    run: () => runTransition(oldState as never, newState as never, oldNode, nextNode, mkCtx(cmds, emitted, opts?.oldCompId)),
  }
}

test('全分支：fragment → element（数组 → 单节点——旧区间完整递归清理）', async () => {
  const t = runT('fragment', 'element',
    [h('span', {}, 'a'), h('div', {}, [h('b', {}, 'x'), 'txt'])],
    h('p', {}, '单'),
  )
  await t.run()
  // 旧展开区间逐项递归 remove（span、span 文本、div、b、txt、div）——
  // 非只清首锚——完整子树清理
  const removes = t.cmds.filter((c) => (c as { op: string }).op === 'remove')
  assert.equal(removes.length, 6, '数组 + 嵌套完整递归清理（span/a/div/b/txt/div）')
  assert.deepEqual(
    removes.map((c) => (c as { id: string }).id),
    ['root.0.1.0', 'root.0.1', 'root.0.2.0.0', 'root.0.2.0', 'root.0.2.1', 'root.0.2'],
    '展开位置连续（pathId(parent, index+ci)——递归子先父后）')
  assert.deepEqual(t.emitted, [h('p', {}, '单') as never], '新侧渲染')
})

test('全分支：fragment → component（数组 → 组件）', async () => {
  const comp = { type: () => () => null, props: {}, key: null }
  const t = runT('fragment', 'component', [h('span', {}), 't'], comp)
  await t.run()
  assert.equal(t.cmds.filter((c) => (c as { op: string }).op === 'remove').length, 2, '两项清理')
  assert.deepEqual(t.emitted, [comp])
})

test('全分支：fragment → text / fragment → hole', async () => {
  const arr = [h('span', {}), h('i', {})]
  const t1 = runT('fragment', 'text', arr, '文本')
  await t1.run()
  assert.equal(t1.cmds.filter((c) => (c as { op: string }).op === 'remove').length, 2, '数组清理')
  assert.deepEqual(t1.emitted, ['文本'])
  const t2 = runT('fragment', 'hole', arr, null)
  await t2.run()
  assert.equal(t2.cmds.filter((c) => (c as { op: string }).op === 'remove').length, 2)
  assert.deepEqual(t2.emitted, [null], '新侧 hole（占位锚）')
})

test('全分支：element → fragment / component → fragment / text → fragment / hole → fragment', async () => {
  const arr = [h('span', {}), h('i', {})]
  // element → fragment：旧元素移除 + 数组渲染
  const t1 = runT('element', 'fragment', h('div', {}, 'x'), arr)
  await t1.run()
  // **根本修复（C2——统一区间移除）**：removeVNodeTree——子槽位 + 元素
  // （多余子槽位 remove 幂等无害——DOM 随父移除——子树实例清理必要）
  assert.deepEqual(t1.cmds, [{ op: 'remove', id: 'root.1.0' }, { op: 'remove', id: 'root.1' }], '旧元素完整区间让位')
  assert.deepEqual(t1.emitted, [arr])
  // component → fragment：unmountComp + 移除 + 数组
  const t2 = runT('component', 'fragment', { type: () => () => null, props: {}, key: null }, arr, { oldCompId: 'root.1' })
  await t2.run()
  const ops2 = t2.cmds.map((c) => (c as { op: string }).op)
  assert.ok(ops2.includes('unmount') && ops2.includes('remove'), '组件卸载 + 移除')
  assert.deepEqual(t2.emitted, [arr])
  // text → fragment / hole → fragment：旧侧让位
  const t3 = runT('text', 'fragment', '旧文本', arr)
  await t3.run()
  assert.deepEqual(t3.cmds, [{ op: 'remove', id: 'root.1' }])
  assert.deepEqual(t3.emitted, [arr])
  const t4 = runT('hole', 'fragment', null, arr)
  await t4.run()
  assert.deepEqual(t4.cmds, [{ op: 'remove', id: 'root.1' }], '锚让位')
  assert.deepEqual(t4.emitted, [arr])
})


test('全分支：text → X / hole → X / element → X / component → X（旧侧统一让位）', async () => {
  const comp = { type: () => () => null, props: {}, key: null }
  // text → element / text → component
  for (const [next, node] of [['element', h('div', {})], ['component', comp]] as const) {
    const t = runT('text', next, '旧文本', node)
    await t.run()
  assert.deepEqual(t.cmds, [{ op: 'remove', id: 'root.1' }], `text → ${next} 文本让位`)
  assert.deepEqual(t.emitted, [node])
  }
  // hole → element / hole → component / hole → text
  for (const [next, node] of [['element', h('div', {})], ['component', comp], ['text', 'x']] as const) {
    const t = runT('hole', next, null, node)
    await t.run()
  assert.deepEqual(t.cmds, [{ op: 'remove', id: 'root.1' }], `hole → ${next} 锚让位`)
  assert.deepEqual(t.emitted, [node])
  }
  // element → text / element → hole / element → component
  for (const [next, node] of [['text', 'x'], ['hole', null], ['component', comp]] as const) {
    const t = runT('element', next, h('div', {}, 'x'), node)
    await t.run()
  // 完整区间（子槽位 + 元素——C2 统一）
  assert.deepEqual(t.cmds, [{ op: 'remove', id: 'root.1.0' }, { op: 'remove', id: 'root.1' }], `element → ${next} 元素完整区间让位`)
  assert.deepEqual(t.emitted, [node])
  }
  // component → text / component → element / component → hole
  for (const [next, node] of [['text', 'x'], ['element', h('div', {})], ['hole', null]] as const) {
    const t = runT('component', next, comp, node, { oldCompId: 'root.1' })
    await t.run()
    const ops = t.cmds.map((c) => (c as { op: string }).op)
  assert.deepEqual(ops, ['unmount', 'remove'], `component → ${next} 卸载 + 移除`)
  assert.deepEqual(t.emitted, [node])
  }
})

test('全分支补全：array → X（数组 → 单节点/空洞/浮层——组件输出收窄）', async () => {
  const arr = [h('span', {}), h('i', {})]
  const comp = { type: () => () => null, props: {}, key: null }
  // array → element：旧区间清理 + 单节点
  const t1 = runT('array', 'element', arr, h('div', {}))
  await t1.run()
  assert.equal(t1.cmds.filter((c) => (c as { op: string }).op === 'remove').length, 2, '数组项逐项清理')
  assert.deepEqual(t1.emitted, [h('div', {}) as never])
  // array → text / array → hole：收窄为单值/空洞
  const t2 = runT('array', 'text', arr, 'x')
  await t2.run()
  assert.equal(t2.cmds.filter((c) => (c as { op: string }).op === 'remove').length, 2)
  assert.deepEqual(t2.emitted, ['x'])
  const t3 = runT('array', 'hole', arr, null)
  await t3.run()
  assert.equal(t3.cmds.filter((c) => (c as { op: string }).op === 'remove').length, 2)
  assert.deepEqual(t3.emitted, [null])
  // array → component：卸载数组 + 组件渲染
  const t4 = runT('array', 'component', arr, comp, { oldCompId: 'root.1' })
  await t4.run()
  assert.deepEqual(t4.emitted, [comp])
  // array → fragment：同义展开
  const t5 = runT('array', 'fragment', arr, h(Fragment, {}, 'a'))
  await t5.run()
  assert.deepEqual(t5.emitted, [h(Fragment, {}, 'a') as never])
})


test('全分支补全：fragment → array（Fragment 符号 → 数组——同义展开）', async () => {
  const t = runT('fragment', 'array', h(Fragment, {}, 'a'), [h('span', {})])
  await t.run()
  assert.equal(t.cmds.filter((c) => (c as { op: string }).op === 'remove').length, 1, '旧展开项清理')
  assert.deepEqual(t.emitted, [[h('span', {})]])
})

// 浏览器测试 runner 入口标记（sideEffects 摇除防护——scripts/test-browser.ts 引用）
export const __wf_tests = (): void => {}
