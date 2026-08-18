/**
 * vdom transform — 状态机测试（转换表选择 + **完整转换**策略命令）
 *
 * 锁定规则（AGENTS §4.0/§6.3——占位法）：
 * - 同态（text→text/element→element/component→component/hole→hole/
 *   fragment→fragment/portal→portal）= null 策略（diff 就地 patch——不重建）
 * - **异态 = 完整转换**（状态机——各状态文件）：旧侧让位（remove/
 *   unmountComp）+ ctx.emitNode 新侧渲染——diff 只查表调用——不手写转换
 * - component → X 先 unmountComp（onUnmounts 清理）再移除
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { transitionOf, runTransition, TRANSITIONS } from './table.ts'
import { stateOf } from './states.ts'
import type { TransformContext } from './index.ts'

function mkCtx(cmds: unknown[], emitted: unknown[] = []): TransformContext {
  return {
    emit: (c) => cmds.push(c),
    emitNode: async (v) => { emitted.push(v) },
    oldId: 'root.1', newId: 'root.1', parent: 'root.0', index: 1, ref: 'root.0.0',
  }
}

test('转换表完整性：7×7 全策略（同态 null + 异态函数）', () => {
  const states = ['text', 'hole', 'element', 'component', 'fragment', 'portal', 'array']
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

test('component <-> fragment：component 先 unmountComp 再移除 + 新侧渲染', async () => {
  const cmds: unknown[] = []
  const emitted: unknown[] = []
  const ctx = mkCtx(cmds, emitted)
  ctx.oldCompId = 'root.1'
  await runTransition('component', 'fragment', { type: () => () => null }, [], ctx)
  assert.deepEqual(cmds, [
    { op: 'unmountComp', compId: 'root.1' },
    { op: 'remove', id: 'root.1' },
  ], '卸载清理先于移除')
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
  assert.equal(typeof transitionOf('portal', 'hole'), 'function')
})

test('转换表缺省安全：未知状态对 → null（no-op）', () => {
  assert.equal(transitionOf('unknown' as never, 'element'), null)
})
