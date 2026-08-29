/**
 * vdom v2 — diff 等价验证（v1 diffStream vs v2 diffV2——增量命令相等）
 *
 * VDOM-V2-BLUEPRINT 阶段 1b：
 * - 增量命令逐条相等（元素属性更新/文本更新/组件输出变化/空洞变换）
 * - **复用核心**：组件同位置同类型渲染两次——工厂执行 1 次（v2 流段——
 *   "复用失败"根治的证据）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h } from '../../client/vdom/core/vnode.ts'
import type { VNode } from '../../client/vdom/core/vnode.ts'
import { diffStream } from '../../client/vdom/core/diff/index.ts'
import { diffV2, createSegment, type SegmentMap } from '../../client/vdom/core/v2/diff.ts'
import { createComponentRegistry, type ComponentRegistry } from '../../client/vdom/core/node/component.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'
import { Observable } from '../../client/vdom/observable/index.ts'

const emptyCtx = { render: async () => {}, browser: null } as never

async function collectDiffV1(oldT: VNode, newT: VNode): Promise<Command[]> {
  const out: Command[] = []
  for await (const c of diffStream(oldT, newT, emptyCtx, createComponentRegistry())) out.push(c)
  return out
}

function collectObs(o: Observable<Command>): Promise<Command[]> {
  return new Promise((resolve, reject) => {
    const out: Command[] = []
    o.subscribe({ next: (c) => out.push(c), error: reject, complete: () => resolve(out) })
  })
}

function sameCmds(a: Command[], b: Command[]): string | null {
  if (a.length !== b.length) return `长度 ${a.length} vs ${b.length}（v1: ${a.map(c => c.op).join(',')} / v2: ${b.map(c => c.op).join(',')}）`
  for (let i = 0; i < a.length; i++) {
    const sa = JSON.stringify(a[i])
    const sb = JSON.stringify(b[i])
    if (sa !== sb) return `第 ${i} 条不同:\n  v1: ${sa.slice(0, 150)}\n  v2: ${sb.slice(0, 150)}`
  }
  return null
}

function v2Diff(oldT: VNode, newT: VNode, segments: SegmentMap, reg: ComponentRegistry): Observable<Command> {
  return diffV2(oldT, newT, emptyCtx, segments, reg)
}

test('增量：文本值更新（setText）', async () => {
  const oldT = h('div', {}, h('span', {}, 'a')) as VNode
  const newT = h('div', {}, h('span', {}, 'b')) as VNode
  const v1 = await collectDiffV1(oldT, newT)
  const v2 = await collectObs(v2Diff(oldT, newT, new Map(), createComponentRegistry()))
  assert.equal(sameCmds(v1, v2), null, sameCmds(v1, v2) ?? '')
})

test('增量：属性更新（setProp 只发变化键）', async () => {
  const oldT = h('button', { class: 'a', 'data-x': '1' }, 'x') as VNode
  const newT = h('button', { class: 'b', 'data-x': '1' }, 'x') as VNode
  const v1 = await collectDiffV1(oldT, newT)
  const v2 = await collectObs(v2Diff(oldT, newT, new Map(), createComponentRegistry()))
  assert.equal(sameCmds(v1, v2), null, sameCmds(v1, v2) ?? '')
})

test('增量：空洞 ↔ 元素（转换）', async () => {
  const oldT = h('div', {}, [null, h('span', {}, 'keep')]) as VNode
  const newT = h('div', {}, [h('b', {}, 'new'), h('span', {}, 'keep')]) as VNode
  const v1 = await collectDiffV1(oldT, newT)
  const v2 = await collectObs(v2Diff(oldT, newT, new Map(), createComponentRegistry()))
  assert.equal(sameCmds(v1, v2), null, sameCmds(v1, v2) ?? '')
})

test('复用：组件同位置渲染两次——工厂执行 1 次（流段根治）', async () => {
  let factoryRuns = 0
  const Comp: any = (_p: any, _c: any) => { factoryRuns++; return (props: any) => h('div', { 'data-v': props.v ?? '0' }, String(props.v ?? '0')) }
  const oldT = h('div', {}, h(Comp, { v: '1' })) as VNode
  const newT = h('div', {}, h(Comp, { v: '2' })) as VNode
  const segments = new Map<string, never>() as unknown as SegmentMap
  // 段（工厂执行 1 次——createSegment）
  const seg = createSegment(Comp as never, { v: '1' }, emptyCtx, 'root.0.0')
  segments.set('root.0.0', seg as never)
  const runsAfterSeed = factoryRuns
  await collectObs(v2Diff(oldT, newT, segments, createComponentRegistry()))
  assert.equal(factoryRuns, runsAfterSeed, 'diff 复用段——工厂不重跑')
})
