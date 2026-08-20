/**
 * vdom transform — 状态机测试（转换表选择 + **完整转换**策略命令）
 *
 * 锁定规则（AGENTS §4.0/§6.3——占位法）：
 * - 同态（text→text/element→element/component→component/hole→hole/
 *   fragment→fragment/portal→portal）= null 策略（diff 就地 patch——不重建）
 * - **异态 = 完整转换**（状态机——各状态文件）：旧侧让位（remove/
 *   unmountComp）+ ctx.emitNode 新侧渲染——diff 只查表调用——不手写转换
 * - component → X 先 unmount（onUnmounts 清理）再移除
 */

import { test } from 'vitest'
import { expect } from 'vitest'
import { transitionOf, runTransition, TRANSITIONS } from './table.ts'
import { stateOf } from './states.ts'
import { h } from '../vnode.ts'
import { Fragment } from '../node/fragment.ts'
import type { TransformContext } from './index.ts'

function mkCtx(cmds: unknown[], emitted: unknown[] = [], oldCompId?: string): TransformContext {
  return {
    emit: (c) => cmds.push(c),
    emitNode: async (v) => { emitted.push(v) },
    oldId: 'root.1', newId: 'root.1', parent: 'root.0', index: 1, ref: 'root.0.0',
    ...(oldCompId ? { oldCompId } : {}),
  }
}

test('转换表完整性：7×7 全策略（同态 null + 异态函数）', () => {
  const states = ['text', 'hole', 'element', 'component', 'fragment', 'portal', 'array']
  for (const old of states) {
    for (const next of states) {
      const fn = TRANSITIONS[old as keyof typeof TRANSITIONS]?.[next as never]
      if (old === next) {
  expect(fn, `${old} → ${next} 同态——就地 patch`).toBe(null)
      } else {
  expect(typeof fn, `${old} → ${next} 应有转换策略`).toBe('function')
      }
    }
  }
})

test('stateOf：vnode 形态 → 转换状态', () => {
  expect(stateOf(null)).toBe('hole')
  expect(stateOf(false)).toBe('hole')
  expect(stateOf('text')).toBe('text')
  expect(stateOf(42)).toBe('text')
  expect(stateOf({ type: 'div', props: {}, key: null } as never)).toBe('element')
  expect(stateOf({ type: () => () => null, props: {}, key: null } as never)).toBe('component')
  expect(stateOf([])).toBe('array')
})

test('null <-> component：hole → component 完整转换（锚让位 + 新侧渲染）', async () => {
  const cmds: unknown[] = []
  const emitted: unknown[] = []
  const comp = { type: () => () => null, props: {}, key: null }
  await runTransition('hole', 'component', null, comp as never, mkCtx(cmds, emitted))
  expect(cmds, '旧锚移除').toEqual([{ op: 'remove', id: 'root.1' }])
  expect(emitted, '新侧经 emitNode 渲染（状态机完整）').toEqual([comp])
})

test('null <-> fragment：hole → fragment 完整转换（条件渲染空数组）', async () => {
  const cmds: unknown[] = []
  const emitted: unknown[] = []
  await runTransition('hole', 'fragment', null, [], mkCtx(cmds, emitted))
  expect(cmds.length).toBe(1)
  expect(emitted).toEqual([[]])
})

test('component <-> fragment：component 先 unmount 再移除 + 新侧渲染', async () => {
  const cmds: unknown[] = []
  const emitted: unknown[] = []
  const ctx = mkCtx(cmds, emitted)
  ctx.oldCompId = 'root.1'
  await runTransition('component', 'fragment', { type: () => () => null }, [], ctx)
  expect(cmds, '卸载清理先于移除').toEqual([
    { op: 'unmount', compId: 'root.1' },
    { op: 'remove', id: 'root.1' },
  ])
  expect(emitted, '新侧渲染').toEqual([[]])
})

test('element <-> component：元素让位 + 新侧渲染（无组件卸载）', async () => {
  const cmds: unknown[] = []
  const emitted: unknown[] = []
  const comp = { type: () => () => null, props: {}, key: null }
  await runTransition('element', 'component', { type: 'div', props: {}, key: null }, comp as never, mkCtx(cmds, emitted))
  expect(cmds).toEqual([{ op: 'remove', id: 'root.1' }])
  expect(emitted).toEqual([comp])
})

test('transitionOf：同态 null / 异态函数', () => {
  expect(transitionOf('text', 'text')).toBe(null)
  expect(transitionOf('element', 'element')).toBe(null)
  expect(transitionOf('component', 'component'), '同类型组件复用——diff 层').toBe(null)
  expect(typeof transitionOf('hole', 'element')).toBe('function')
  expect(typeof transitionOf('fragment', 'component')).toBe('function')
  expect(typeof transitionOf('portal', 'hole')).toBe('function')
})

test('转换表缺省安全：未知状态对 → null（no-op）', () => {
  expect(transitionOf('unknown' as never, 'element')).toBe(null)
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
  expect(removes.length, '数组 + 嵌套完整递归清理（span/a/div/b/txt/div）').toBe(6)
  expect(removes.map((c) => (c as { id: string }).id)).toEqual(
    ['root.0.1.0', 'root.0.1', 'root.0.2.0.0', 'root.0.2.0', 'root.0.2.1', 'root.0.2'],
    '展开位置连续（pathId(parent, index+ci)——递归子先父后）')
  expect(t.emitted, '新侧渲染').toEqual([h('p', {}, '单') as never])
})

test('全分支：fragment → component（数组 → 组件）', async () => {
  const comp = { type: () => () => null, props: {}, key: null }
  const t = runT('fragment', 'component', [h('span', {}), 't'], comp)
  await t.run()
  expect(t.cmds.filter((c) => (c as { op: string }).op === 'remove').length, '两项清理').toBe(2)
  expect(t.emitted).toEqual([comp])
})

test('全分支：fragment → text / fragment → hole / fragment → portal', async () => {
  const arr = [h('span', {}), h('i', {})]
  const t1 = runT('fragment', 'text', arr, '文本')
  await t1.run()
  expect(t1.cmds.filter((c) => (c as { op: string }).op === 'remove').length, '数组清理').toBe(2)
  expect(t1.emitted).toEqual(['文本'])
  const t2 = runT('fragment', 'hole', arr, null)
  await t2.run()
  expect(t2.cmds.filter((c) => (c as { op: string }).op === 'remove').length).toBe(2)
  expect(t2.emitted, '新侧 hole（占位锚）').toEqual([null])
  const p = { type: Symbol('portal'), props: {}, key: 'k' }
  const t3 = runT('fragment', 'portal', arr, p)
  await t3.run()
  expect(t3.emitted).toEqual([p])
})

test('全分支：element → fragment / component → fragment / text → fragment / hole → fragment', async () => {
  const arr = [h('span', {}), h('i', {})]
  // element → fragment：旧元素移除 + 数组渲染
  const t1 = runT('element', 'fragment', h('div', {}, 'x'), arr)
  await t1.run()
  expect(t1.cmds, '旧元素让位').toEqual([{ op: 'remove', id: 'root.1' }])
  expect(t1.emitted).toEqual([arr])
  // component → fragment：unmountComp + 移除 + 数组
  const t2 = runT('component', 'fragment', { type: () => () => null, props: {}, key: null }, arr, { oldCompId: 'root.1' })
  await t2.run()
  const ops2 = t2.cmds.map((c) => (c as { op: string }).op)
  expect(ops2.includes('unmount') && ops2.includes('remove'), '组件卸载 + 移除').toBeTruthy()
  expect(t2.emitted).toEqual([arr])
  // text → fragment / hole → fragment：旧侧让位
  const t3 = runT('text', 'fragment', '旧文本', arr)
  await t3.run()
  expect(t3.cmds).toEqual([{ op: 'remove', id: 'root.1' }])
  expect(t3.emitted).toEqual([arr])
  const t4 = runT('hole', 'fragment', null, arr)
  await t4.run()
  expect(t4.cmds, '锚让位').toEqual([{ op: 'remove', id: 'root.1' }])
  expect(t4.emitted).toEqual([arr])
})

test('全分支：portal → X / X → portal（浮层槽位切换）', async () => {
  const portal = { type: Symbol('portal'), props: {}, key: 'dd' }
  const t1 = runT('portal', 'hole', portal, null)
  await t1.run()
  // 组件输出级浮层关闭：removePortal（容器清理——真实 bug）+ 锚让位
  expect(t1.cmds, '浮层容器清理 + 锚让位').toEqual([{ op: 'removePortal', key: 'dd' }, { op: 'remove', id: 'root.1' }])
  expect(t1.emitted).toEqual([null])
  const t2 = runT('hole', 'portal', null, portal)
  await t2.run()
  expect(t2.emitted).toEqual([portal])
  const t3 = runT('portal', 'element', portal, h('div', {}))
  await t3.run()
  expect(t3.cmds, 'portal → element 清容器 + 锚让位').toEqual([{ op: 'removePortal', key: 'dd' }, { op: 'remove', id: 'root.1' }])
  expect(t3.emitted).toEqual([h('div', {}) as never])
})

test('全分支：text → X / hole → X / element → X / component → X（旧侧统一让位）', async () => {
  const comp = { type: () => () => null, props: {}, key: null }
  // text → element / text → component / text → portal
  for (const [next, node] of [['element', h('div', {})], ['component', comp], ['portal', { type: Symbol('p'), props: {}, key: 'k' }]] as const) {
    const t = runT('text', next, '旧文本', node)
    await t.run()
  expect(t.cmds, `text → ${next} 文本让位`).toEqual([{ op: 'remove', id: 'root.1' }])
  expect(t.emitted).toEqual([node])
  }
  // hole → element / hole → component / hole → text / hole → portal
  for (const [next, node] of [['element', h('div', {})], ['component', comp], ['text', 'x'], ['portal', { type: Symbol('p'), props: {}, key: 'k' }]] as const) {
    const t = runT('hole', next, null, node)
    await t.run()
  expect(t.cmds, `hole → ${next} 锚让位`).toEqual([{ op: 'remove', id: 'root.1' }])
  expect(t.emitted).toEqual([node])
  }
  // element → text / element → hole / element → component / element → portal
  for (const [next, node] of [['text', 'x'], ['hole', null], ['component', comp], ['portal', { type: Symbol('p'), props: {}, key: 'k' }]] as const) {
    const t = runT('element', next, h('div', {}, 'x'), node)
    await t.run()
  expect(t.cmds, `element → ${next} 元素让位`).toEqual([{ op: 'remove', id: 'root.1' }])
  expect(t.emitted).toEqual([node])
  }
  // component → text / component → element / component → hole / component → portal
  for (const [next, node] of [['text', 'x'], ['element', h('div', {})], ['hole', null], ['portal', { type: Symbol('p'), props: {}, key: 'k' }]] as const) {
    const t = runT('component', next, comp, node, { oldCompId: 'root.1' })
    await t.run()
    const ops = t.cmds.map((c) => (c as { op: string }).op)
  expect(ops, `component → ${next} 卸载 + 移除`).toEqual(['unmount', 'remove'])
  expect(t.emitted).toEqual([node])
  }
})

test('全分支补全：array → X（数组 → 单节点/空洞/浮层——组件输出收窄）', async () => {
  const arr = [h('span', {}), h('i', {})]
  const comp = { type: () => () => null, props: {}, key: null }
  // array → element：旧区间清理 + 单节点
  const t1 = runT('array', 'element', arr, h('div', {}))
  await t1.run()
  expect(t1.cmds.filter((c) => (c as { op: string }).op === 'remove').length, '数组项逐项清理').toBe(2)
  expect(t1.emitted).toEqual([h('div', {}) as never])
  // array → text / array → hole：收窄为单值/空洞
  const t2 = runT('array', 'text', arr, 'x')
  await t2.run()
  expect(t2.cmds.filter((c) => (c as { op: string }).op === 'remove').length).toBe(2)
  expect(t2.emitted).toEqual(['x'])
  const t3 = runT('array', 'hole', arr, null)
  await t3.run()
  expect(t3.cmds.filter((c) => (c as { op: string }).op === 'remove').length).toBe(2)
  expect(t3.emitted).toEqual([null])
  // array → component：卸载数组 + 组件渲染
  const t4 = runT('array', 'component', arr, comp, { oldCompId: 'root.1' })
  await t4.run()
  expect(t4.emitted).toEqual([comp])
  // array → fragment / array → portal：同义展开/浮层槽位
  const t5 = runT('array', 'fragment', arr, h(Fragment, {}, 'a'))
  await t5.run()
  expect(t5.emitted).toEqual([h(Fragment, {}, 'a') as never])
  const p = { type: Symbol('portal'), props: {}, key: 'k' }
  const t6 = runT('array', 'portal', arr, p)
  await t6.run()
  expect(t6.emitted).toEqual([p])
})

test('全分支补全：portal → text/component/fragment/array（浮层槽位被条件渲染替换）', async () => {
  const portal = { type: Symbol('portal'), props: {}, key: 'dd' }
  const comp = { type: () => () => null, props: {}, key: null }
  // portal → text / portal → component
  const RP = { op: 'removePortal', key: 'dd' }
  const t1 = runT('portal', 'text', portal, 'x')
  await t1.run()
  expect(t1.cmds, '浮层容器清理 + 锚让位').toEqual([RP, { op: 'remove', id: 'root.1' }])
  expect(t1.emitted).toEqual(['x'])
  const t2 = runT('portal', 'component', portal, comp)
  await t2.run()
  expect(t2.cmds).toEqual([RP, { op: 'remove', id: 'root.1' }])
  expect(t2.emitted).toEqual([comp])
  // portal → fragment / portal → array
  const t3 = runT('portal', 'fragment', portal, h(Fragment, {}, 'a'))
  await t3.run()
  expect(t3.cmds).toEqual([RP, { op: 'remove', id: 'root.1' }])
  expect(t3.emitted).toEqual([h(Fragment, {}, 'a') as never])
  const t4 = runT('portal', 'array', portal, [h('span', {})])
  await t4.run()
  expect(t4.cmds).toEqual([RP, { op: 'remove', id: 'root.1' }])
  expect(t4.emitted).toEqual([[h('span', {})]])
})

test('全分支补全：text → hole（文本消失——条件渲染收窄）', async () => {
  const t = runT('text', 'hole', '旧文本', null)
  await t.run()
  expect(t.cmds, '文本让位').toEqual([{ op: 'remove', id: 'root.1' }])
  expect(t.emitted, '新侧空洞（占位锚——同构保持）').toEqual([null])
})

test('全分支补全：fragment → array（Fragment 符号 → 数组——同义展开）', async () => {
  const t = runT('fragment', 'array', h(Fragment, {}, 'a'), [h('span', {})])
  await t.run()
  expect(t.cmds.filter((c) => (c as { op: string }).op === 'remove').length, '旧展开项清理').toBe(1)
  expect(t.emitted).toEqual([[h('span', {})]])
})
