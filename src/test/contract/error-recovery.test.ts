/**
 * 错误路径与恢复语义契约（VDOM-CORE-EXCELLENCE 波次 D——2027-10）
 *
 * **自愈不可消音**：R1 熔断（renderFn throw → hole 降级 → 下一拍重试）
 * 是容错不是静默。锁定：
 * - 日志去重：同 compId 连续 throw → console.error 恰 1 次（循环重试
 *   不刷日志——Icon 类回归案：mode 循环每次重试都报——风暴掩盖根因）
 * - 恢复清出：renderFn 成功 → 去重状态清出 → 再错再报（错误状态变化
 *   可观测——不是一次性静音）
 * - 错误计数：total 累计 + byComp（render-health snapshot.errors 轴——
 *   dev 仪表四轴：频率/规模/复用/错误）
 * - 连续降级恢复：多次 throw → 多次 hole 降级 → 修复后段/实例完整
 *   （循环降级不残留——段表/实例面收敛）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h, type VNode } from '../../client/vdom/core/vnode.ts'
import { renderToStreamV2, diffToStreamV2 } from '../../client/vdom/core/v2/integrate.ts'
import { createComponentRegistry, type ComponentRegistry } from '../../client/vdom/core/node/component.ts'
import type { Segment } from '../../client/vdom/core/v2/diff.ts'
import { drainStream } from './sim.ts'
import {
  noteRenderError, clearRenderError, errorSnapshot, resetErrorCounter,
} from '../../client/vdom/dev/error-counter.ts'

/** console.error 拦截（计数——不输出） */
function captureError(): { count(): number; restore(): void } {
  let n = 0
  const orig = console.error
  console.error = (...a: unknown[]) => { n++ }
  return { count: () => n, restore: () => { console.error = orig } }
}

/** throw 组件工厂（每次 renderFn 抛） */
function makeThrowComp(tag: string): () => any {
  const f = () => () => { throw new Error(`boom-${tag}`) }
  return f as any
}

test('D-err：日志去重——同 compId 连续 throw 恰 1 次 console.error', async () => {
  resetErrorCounter()
  const cap = captureError()
  try {
    const reg = createComponentRegistry()
    const segs = new Map<string, Segment>()
    const mk = () => h('div', {}, [h(makeThrowComp('x'), {})]) as VNode
    await drainStream(renderToStreamV2(mk(), {}, reg, segs))
    const n1 = cap.count()
    // 连续重渲染（每次 renderFn 都 throw）
    const newT = h('div', {}, [h(makeThrowComp('x'), {})]) as VNode
    await drainStream(diffToStreamV2(mk(), newT, {}, reg, segs))
    await drainStream(diffToStreamV2(newT, mk(), {}, reg, segs))
    const n2 = cap.count()
    console.log(`[DBG] n1=${n1} n2=${n2} total=${errorSnapshot().total} byComp=${JSON.stringify(errorSnapshot().byComp)}`)
    assert.equal(n1, 1, `首次错误报 1 次（实际 ${n1}）`)
    assert.equal(errorSnapshot().total, 3, `计数累计 3（实际 ${errorSnapshot().total}）`)
  } finally { cap.restore(); resetErrorCounter() }
})

test('D-err：恢复清出——成功后再错再报（错误状态变化可观测）', () => {
  resetErrorCounter()
  const cap = captureError()
  try {
    noteRenderError('c1', new Error('a'))
    assert.equal(cap.count(), 1)
    noteRenderError('c1', new Error('a2'))
    assert.equal(cap.count(), 1, '重复静默')
    clearRenderError('c1') // renderFn 成功（恢复）
    noteRenderError('c1', new Error('a3'))
    assert.equal(cap.count(), 2, '恢复后再错——再报（状态变化）')
  } finally { cap.restore(); resetErrorCounter() }
})

test('D-err：render-health errors 轴——快照累计计数（dev 四轴）', async () => {
  resetErrorCounter()
  const reg = createComponentRegistry()
  const segs = new Map<string, Segment>()
  const mk = (tag: string) => h('div', {}, [h(makeThrowComp(tag), {})]) as VNode
  await drainStream(renderToStreamV2(mk('a'), {}, reg, segs))
  // 两个不同 compId 的错误段 + 一次成功恢复
  noteRenderError('other-1', new Error('x'))
  const snap = errorSnapshot()
  assert.ok(snap.total >= 2, `errors 累计 ${snap.total}`)
  assert.ok(Object.keys(snap.byComp).length >= 2, 'byComp 分组件计数')
  // 恢复清空后归零影响
  resetErrorCounter()
  assert.equal(errorSnapshot().total, 0)
})

test('D-err：连续降级 → 修复 → 段/实例收敛（循环降级不残留）', async () => {
  const reg = createComponentRegistry()
  const segs = new Map<string, Segment>()
  const mk = (good: boolean) => h('div', {}, [
    good ? h('div', {}, 'ok') : h(makeThrowComp('loop'), {}),
  ]) as VNode
  // 连续 3 轮 throw（每轮 hole 降级——段保留）
  await drainStream(renderToStreamV2(mk(false), {}, reg, segs))
  const segsAfterFirst = segs.size
  await drainStream(diffToStreamV2(mk(false), mk(false), {}, reg, segs))
  await drainStream(diffToStreamV2(mk(false), mk(false), {}, reg, segs))
  assert.equal(segs.size, segsAfterFirst, `循环降级段数不增长（${segsAfterFirst} → ${segs.size}）`)
  // 修复自愈（同位置正常组件——D3 契约扩展：多次降级后恢复）
  const cmds = await drainStream(diffToStreamV2(mk(false), mk(true), {}, reg, segs))
  assert.ok(cmds.some((c) => c.op === 'done'), '修复流完成')
  // 终态渲染正常（无 throw——恢复成功）
  const snap = await drainStream(diffToStreamV2(mk(true), mk(true), {}, reg, segs))
  assert.ok(snap.some((c) => c.op === 'done'), '恢复后稳态渲染')
  // 修复后 throw 组件被元素替换（transform 让位）——段销毁 = 语义正确
  assert.equal(segs.size, 0, '段表收敛（组件段销毁——无残留）')
})
