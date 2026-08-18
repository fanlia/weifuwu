/**
 * vdom transform — 状态机测试（转换表选择 + 策略命令生成）
 *
 * 锁定规则（AGENTS §4.0/§6.3——占位法）：
 * - 同态（text→text/element→element/component→component/hole→hole/
 *   fragment→fragment/portal→portal）= null 策略（diff 就地 patch——不重建）
 * - 异态走转换：旧侧让位（remove/unmountComp）——新侧 diff 渲染到同一位置
 * - component → X 先 unmountComp（onUnmounts 清理）再移除
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { transitionOf, runTransition, TRANSITIONS } from './table.ts'
import { stateOf } from './states.ts'
import type { TransformContext } from './index.ts'

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

test('null <-> component：hole → component 策略 = 锚让位（remove）', () => {
  const cmds: unknown[] = []
  const ctx: TransformContext = { emit: (c) => cmds.push(c), oldId: 'root.1', newId: 'root.1', parent: 'root.0', ref: 'root.0.0' }
  runTransition('hole', 'component', null, { type: () => () => null }, ctx)
  assert.deepEqual(cmds, [{ op: 'remove', id: 'root.1' }], '旧锚移除——新组件 diff 渲染')
})

test('null <-> fragment：hole → fragment 策略（条件渲染空数组）', () => {
  const cmds: unknown[] = []
  const ctx: TransformContext = { emit: (c) => cmds.push(c), oldId: 'root.1', newId: 'root.1', parent: 'root.0', ref: null }
  runTransition('hole', 'fragment', null, [], ctx)
  assert.equal(cmds.length, 1)
})

test('component <-> fragment：component 先 unmountComp 再移除', () => {
  const cmds: unknown[] = []
  const ctx: TransformContext = { emit: (c) => cmds.push(c), oldId: 'root.0', newId: 'root.0', parent: 'root', ref: null, oldCompId: 'root.0' }
  runTransition('component', 'fragment', { type: () => () => null }, [], ctx)
  assert.deepEqual(cmds, [
    { op: 'unmountComp', compId: 'root.0' },
    { op: 'remove', id: 'root.0' },
  ], '卸载清理先于移除')
})

test('element <-> component：元素让位（无组件卸载）', () => {
  const cmds: unknown[] = []
  const ctx: TransformContext = { emit: (c) => cmds.push(c), oldId: 'root.2', newId: 'root.2', parent: 'root', ref: null }
  runTransition('element', 'component', { type: 'div', props: {}, key: null }, { type: () => () => null }, ctx)
  assert.deepEqual(cmds, [{ op: 'remove', id: 'root.2' }])
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
