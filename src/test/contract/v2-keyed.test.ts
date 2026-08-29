/**
 * vdom v2 — keyed 列表 merge 等价验证（v1 diffKeyedChildren vs v2 diffKeyedV2）
 *
 * VDOM-V2-BLUEPRINT 阶段 1c：
 * - 增delete/插入/顺移（前置删除——move 左移）/交换（冲突重建）/
 *   循环移位（重建——实例复用）——v1/v2 命令流逐条相等
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

function collectV1(oldT: VNode, newT: VNode): Promise<Command[]> {
  return (async () => {
    const out: Command[] = []
    for await (const c of diffStream(oldT, newT, emptyCtx, createComponentRegistry())) out.push(c)
    return out
  })()
}

function collectV2(oldT: VNode, newT: VNode, segments: SegmentMap, reg: ComponentRegistry): Promise<Command[]> {
  return new Promise((resolve, reject) => {
    const out: Command[] = []
    diffV2(oldT, newT, emptyCtx, segments, reg).subscribe({ next: (c) => out.push(c), error: reject, complete: () => resolve(out) })
  })
}

function sameCmds(a: Command[], b: Command[]): string | null {
  if (a.length !== b.length) return `长度 ${a.length} vs ${b.length}（v1: ${a.map(c => c.op).join(',')} / v2: ${b.map(c => c.op).join(',')}）`
  for (let i = 0; i < a.length; i++) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return `第 ${i} 条:\n  v1: ${JSON.stringify(a[i]).slice(0, 130)}\n  v2: ${JSON.stringify(b[i]).slice(0, 130)}`
  }
  return null
}

const keyed = (id: string, k: string) => h('span', { key: k, 'data-k': k }, id)

test('keyed：前置删除（顺移——move 左移）', async () => {
  const oldT = h('div', {}, [keyed('a', 'a'), keyed('b', 'b'), keyed('c', 'c')]) as VNode
  const newT = h('div', {}, [keyed('b', 'b'), keyed('c', 'c')]) as VNode
  const v1 = await collectV1(oldT, newT)
  const v2 = await collectV2(oldT, newT, new Map(), createComponentRegistry())
  assert.equal(sameCmds(v1, v2), null, sameCmds(v1, v2) ?? '')
})

test('keyed：插入（首/中）', async () => {
  const oldT = h('div', {}, [keyed('a', 'a'), keyed('c', 'c')]) as VNode
  const newT = h('div', {}, [keyed('x', 'x'), keyed('a', 'a'), keyed('b', 'b'), keyed('c', 'c')]) as VNode
  const v1 = await collectV1(oldT, newT)
  const v2 = await collectV2(oldT, newT, new Map(), createComponentRegistry())
  assert.equal(sameCmds(v1, v2), null, sameCmds(v1, v2) ?? '')
})

test('keyed：尾部删除', async () => {
  const oldT = h('div', {}, [keyed('a', 'a'), keyed('b', 'b'), keyed('c', 'c')]) as VNode
  const newT = h('div', {}, [keyed('a', 'a'), keyed('b', 'b')]) as VNode
  const v1 = await collectV1(oldT, newT)
  const v2 = await collectV2(oldT, newT, new Map(), createComponentRegistry())
  assert.equal(sameCmds(v1, v2), null, sameCmds(v1, v2) ?? '')
})

test('keyed：交换（冲突重建——remove 全部 + 按新序）', async () => {
  const oldT = h('div', {}, [keyed('a', 'a'), keyed('b', 'b'), keyed('c', 'c')]) as VNode
  const newT = h('div', {}, [keyed('c', 'c'), keyed('b', 'b'), keyed('a', 'a')]) as VNode
  const v1 = await collectV1(oldT, newT)
  const v2 = await collectV2(oldT, newT, new Map(), createComponentRegistry())
  assert.equal(sameCmds(v1, v2), null, sameCmds(v1, v2) ?? '')
})

test('keyed：循环移位（重建——组件段复用）', async () => {
  let runs = 0
  const Comp: any = (_p: any, _c: any) => { runs++; return (props: any) => h('div', { 'data-k': props.k }, props.k) }
  const items = (keys: string[]) => keys.map((k) => h(Comp, { k, key: k }))
  const oldT = h('div', {}, items(['a', 'b', 'c'])) as VNode
  const newT = h('div', {}, items(['c', 'a', 'b'])) as VNode
  const segments = new Map<string, never>() as unknown as SegmentMap
  // 段（工厂 1 次/组件）
  for (const k of ['a', 'b', 'c']) {
    const seg = createSegment(Comp as never, { k }, emptyCtx, `root.0.k${k}`)
    segments.set(`root.0.k${k}`, seg as never)
  }
  const before = runs
  const v2 = await collectV2(oldT, newT, segments, createComponentRegistry())
  void v2
  // 冲突重建——组件段复用（工厂不重跑）
  assert.equal(runs, before, '循环移位重建——组件段复用（工厂不重跑）')
})
