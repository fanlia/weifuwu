/**
 * 段输出根枚举契约（VDOM-CORE-EXCELLENCE KEYED-MOVE M1——2027-10）
 *
 * outputRootIds = keyed 组件顺移物理 move 的命令目标单一实现源。
 * **形态映射（四形态探针实证——真渲染段）**：
 * - 单 el/text → 槽位 id（P 契约槽位 remap 有效实证）
 * - 数组 → compId.i 平铺（与兄弟槽位隔离）
 * - null → compId.0 锚（G11 修正）
 * - 嵌套组件 → compId.0（HoverCard 事故实证）
 * - CompOutput {kind,v} 包装解包（A 波次——不解包 type 全落空）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h } from '../../client/vdom/core/vnode.ts'
import { renderToStreamV2 } from '../../client/vdom/core/v2/integrate.ts'
import { outputRootIds } from '../../client/vdom/core/v2/diff.ts'
import { createComponentRegistry } from '../../client/vdom/core/node/component.ts'
import { keyedId } from '../../client/vdom/core/node/keyed.ts'
import { drainStream } from './sim.ts'

/** 渲染 keyed 组件并返回（段表, kid）——四形态驱动 */
async function renderCase(out: unknown): Promise<{ segs: Map<string, never>; kid: string }> {
  const Outer = () => () => out as never
  const reg = createComponentRegistry()
  const segs = new Map() as never as Map<string, never>
  await drainStream(renderToStreamV2(h('div', {}, [h(Outer as never, { key: 'k1' })]) as never, {}, reg, segs))
  return { segs, kid: keyedId('root.0', 'k1') }
}

test('M1 单 el 输出 → 槽位 id（root.0.0——P 契约槽位 remap 实证形态）', async () => {
  const { segs, kid } = await renderCase(h('div', {}, 'e'))
  const roots = outputRootIds((segs as Map<string, { lastOutput: unknown }>).get(kid), kid, 'root.0', 0)
  assert.deepEqual(roots, ['root.0.0'], `单 el 挂槽位（实际 ${JSON.stringify(roots)}）`)
})

test('M1 数组输出 → compId.i 平铺（root.0.kk1.0/.1）', async () => {
  const { segs, kid } = await renderCase([h('span', { key: 's' }, 'a'), 't'])
  const roots = outputRootIds((segs as Map<string, { lastOutput: unknown }>).get(kid), kid, 'root.0', 0)
  assert.deepEqual(roots, [kid + '.0', kid + '.1'], `数组平铺（实际 ${JSON.stringify(roots)}）`)
})

test('M1 null 输出 → compId.0 锚（G11 修正形态）', async () => {
  const { segs, kid } = await renderCase(null)
  const roots = outputRootIds((segs as Map<string, { lastOutput: unknown }>).get(kid), kid, 'root.0', 0)
  assert.deepEqual(roots, [kid + '.0'], `null 锚（实际 ${JSON.stringify(roots)}）`)
})

test('M1 嵌套组件输出 → compId.0（HoverCard 防冲突形态）', async () => {
  const Inner = () => () => h('div', {}, 'inner')
  const { segs, kid } = await renderCase(h(Inner as never, {}))
  const roots = outputRootIds((segs as Map<string, { lastOutput: unknown }>).get(kid), kid, 'root.0', 0)
  assert.deepEqual(roots, [kid + '.0'], `嵌套组件（实际 ${JSON.stringify(roots)}）`)
})

test('M1 段未知（undefined lastOutput）→ 首根兜底（保守路径）', () => {
  const roots = outputRootIds(undefined, 'root.0.kk1', 'root.0', 0)
  assert.deepEqual(roots, ['root.0.kk1.0'])
})
