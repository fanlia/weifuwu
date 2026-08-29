/**
 * vdom v2 — transform 6×6 等价验证（v1 转换状态机语义——v2 流式适配）
 *
 * 转换矩阵样本：text↔element / hole↔component / element↔component /
 * fragment↔element / component↔array——v1/v2 命令流相等
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h, type VNode } from '../../client/vdom/core/vnode.ts'
import { diffStream } from '../../client/vdom/core/diff/index.ts'
import { diffV2, type SegmentMap } from '../../client/vdom/core/v2/diff.ts'
import { createComponentRegistry } from '../../client/vdom/core/node/component.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'
import { Observable } from '../../client/vdom/observable/index.ts'

const emptyCtx = { render: async () => {}, browser: null } as never

async function collectV1(oldT: VNode, newT: VNode): Promise<Command[]> {
  const out: Command[] = []
  for await (const c of diffStream(oldT, newT, emptyCtx, createComponentRegistry())) out.push(c)
  return out
}

function collectV2(oldT: VNode, newT: VNode, segments: SegmentMap): Promise<Command[]> {
  return new Promise((resolve, reject) => {
    const out: Command[] = []
    diffV2(oldT, newT, emptyCtx, segments, createComponentRegistry()).subscribe({
      next: (c) => out.push(c), error: reject, complete: () => resolve(out),
    })
  })
}

function sameCmds(a: Command[], b: Command[]): string | null {
  if (a.length !== b.length) return `长度 ${a.length} vs ${b.length}（v1: ${a.map(c => c.op).join(',')} / v2: ${b.map(c => c.op).join(',')}）`
  for (let i = 0; i < a.length; i++) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return `第 ${i} 条:\n  v1: ${JSON.stringify(a[i]).slice(0, 130)}\n  v2: ${JSON.stringify(b[i]).slice(0, 130)}`
  }
  return null
}

async function cmp(name: string, oldC: any, newC: any): Promise<string | null> {
  const oldT = h('div', {}, [oldC]) as VNode
  const newT = h('div', {}, [newC]) as VNode
  const v1 = await collectV1(oldT, newT)
  const v2 = await collectV2(oldT, newT, new Map() as unknown as SegmentMap)
  const d = sameCmds(v1, v2)
  if (d) return `${name}: ${d}`
  return null
}

test('转换：text ↔ element', async () => {
  const d1 = await cmp('text→element', 'hello', h('b', {}, 'x'))
  const d2 = await cmp('element→text', h('b', {}, 'x'), 'hello')
  assert.equal(d1 ?? d2, null, d1 ?? d2 ?? '')
})

test('转换：hole ↔ component（条件渲染核心）', async () => {
  const Comp: any = (_p: any, _c: any) => () => h('span', { class: 'c' }, 'cc')
  const d1 = await cmp('hole→component', null, h(Comp, {}))
  const d2 = await cmp('component→hole', h(Comp, {}), null)
  assert.equal(d1 ?? d2, null, d1 ?? d2 ?? '')
})

test('转换：element ↔ component', async () => {
  const Comp: any = (_p: any, _c: any) => () => h('span', { class: 'c' }, 'cc')
  const d1 = await cmp('element→component', h('div', { class: 'e' }, 'x'), h(Comp, {}))
  const d2 = await cmp('component→element', h(Comp, {}), h('div', { class: 'e' }, 'x'))
  assert.equal(d1 ?? d2, null, d1 ?? d2 ?? '')
})

test('转换：fragment ↔ element（多节点展开 ↔ 单节点）', async () => {
  const d1 = await cmp('fragment→element', h('>', {}, [h('i', {}, 'a'), h('i', {}, 'b')]), h('div', {}, 'solo'))
  const d2 = await cmp('element→fragment', h('div', {}, 'solo'), h('>', {}, [h('i', {}, 'a'), h('i', {}, 'b')]))
  assert.equal(d1 ?? d2, null, d1 ?? d2 ?? '')
})

test('转换：text ↔ hole（空 ↔ 文本）', async () => {
  const d1 = await cmp('text→hole', 'x', '')
  const d2 = await cmp('hole→text', '', 'y')
  assert.equal(d1 ?? d2, null, d1 ?? d2 ?? '')
})
