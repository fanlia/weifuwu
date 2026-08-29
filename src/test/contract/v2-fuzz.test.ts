/**
 * vdom v2 — fuzz 全量（双引擎对账——v1/v2 命令流 → Sim 终态相等）
 *
 * 缺口 5：v1 fuzz 生成器同源（mulberry32 确定性）——每对树：
 *   v1 引擎（renderV1+diffV1）→ Sim A 终态
 *   v2 引擎（renderV2+diffV2）→ Sim B 终态
 *   终态相等（DOM 序列 + 事件表 + 实例集——模拟器裁决）
 * 1200 静态树对（3 种子 × 400）+ 组件输出 300 对（D4 同源）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h, type VNode, type VNodeChild } from '../../client/vdom/core/vnode.ts'
import { Fragment } from '../../client/vdom/core/node/fragment.ts'
import { renderToStream } from '../../client/vdom/core/build.ts'
import { diffStream } from '../../client/vdom/core/diff/index.ts'
import { renderV2, type v2segment as _s } from '../../client/vdom/core/v2/render.ts'
import { diffV2, type SegmentMap } from '../../client/vdom/core/v2/diff.ts'
import { createComponentRegistry } from '../../client/vdom/core/node/component.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'
import { Observable } from '../../client/vdom/observable/index.ts'
import { Sim } from './sim.ts'

const emptyCtx = { render: async () => {}, browser: null } as never

/** mulberry32（v1 同源——确定性） */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return (): number => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function cV1(s: ReadableStream<Command>): Promise<Command[]> {
  const out: Command[] = []
  for await (const c of s) out.push(c)
  return out
}

function cV2(o: Observable<Command>): Promise<Command[]> {
  return new Promise((resolve, reject) => {
    const out: Command[] = []
    o.subscribe({ next: (c) => out.push(c), error: reject, complete: () => resolve(out) })
  })
}

function simState(cmds: Command[]): string {
  const sim = new Sim()
  for (const c of cmds) sim.apply(c)
  return sim.toString()
}

/** 静态树生成器（v1 fuzzRound 同源） */
function makeRandTree(rnd: () => number, seqRef: { n: number }): () => VNodeChild {
  const randLeaf = (): VNodeChild => {
    const r = rnd()
    if (r < 0.3) return 't' + (seqRef.n++ % 7)
    if (r < 0.5) return null
    if (r < 0.6) return false
    return seqRef.n++ % 2 === 0 ? 'x' : 42
  }
  const randTree = (depth: number): VNodeChild => {
    if (depth > 3 || rnd() < 0.25) return randLeaf()
    const r = rnd()
    if (r < 0.3) return h('span', { class: 'c' + (seqRef.n % 3) }, randTree(depth + 1))
    if (r < 0.5) return h('div', { id: 'd' + (seqRef.n % 2) }, Array.from({ length: 1 + (seqRef.n % 3) }, () => randTree(depth + 1)))
    if (r < 0.7) return h('span', { key: 'k' + (seqRef.n++ % 1000) }, randTree(depth + 1))
    if (r < 0.85) return h('ul', {}, Array.from({ length: 1 + (seqRef.n % 3) }, (_, i) => h('li', { key: 'L' + i }, randTree(depth + 1))))
    return h(Fragment, {}, Array.from({ length: 1 + (seqRef.n % 2) }, () => randTree(depth + 1)))
  }
  return () => randTree(0)
}

/** 双引擎对账（old→new——v1/v2 各自 渲染旧 + diff 新 → Sim 终态相等） */
async function dualCheck(oldT: VNode, newT: VNode): Promise<string | null> {
  // v1 侧
  const v1Base = (await cV1(renderToStream(oldT, emptyCtx, createComponentRegistry()))).filter((c) => c.op !== 'done')
  const v1Diff = (await cV1(diffStream(oldT, newT, emptyCtx, createComponentRegistry()))).filter((c) => c.op !== 'done')
  // v2 侧
  const reg2 = createComponentRegistry()
  const segments = new Map<string, never>() as unknown as SegmentMap
  const v2Base = (await cV2(renderV2(oldT, emptyCtx, reg2))).filter((c) => c.op !== 'done')
  const v2Diff = (await cV2(diffV2(oldT, newT, emptyCtx, segments, reg2))).filter((c) => c.op !== 'done')
  const a = simState([...v1Base, ...v1Diff])
  const b = simState([...v2Base, ...v2Diff])
  if (a === b) return null
  return `\n  v1: ${a.slice(0, 200)}\n  v2: ${b.slice(0, 200)}`
}

test('fuzz 全量：静态树 3 种子 × 400（1200 对——双引擎对账）', async () => {
  let total = 0
  let sample = ''
  for (const seed of [42, 7, 2026]) {
    const rnd = mulberry32(seed)
    const seq = { n: 0 }
    const make = makeRandTree(rnd, seq)
    const sub = { total: 0, sample: '' }
    for (let i = 0; i < 400; i++) {
      const oldT = make() as VNode
      const newT = make() as VNode
      if (typeof oldT === 'string' || oldT === null || typeof oldT === 'boolean' || typeof newT === 'string' || newT === null || typeof newT === 'boolean') continue
      const d = await dualCheck(oldT, newT)
      if (d) { sub.total++; if (!sub.sample) sub.sample = `seed=${seed} i=${i}${d}` }
    }
    total += sub.total
    if (!sample) sample = sub.sample
  }
  assert.equal(total, 0, `v2 双引擎对账不等价 ${total}/1200\n${sample}`)
})

test('fuzz 全量：组件输出（array/hole/comp——300 对）', async () => {
  let compSeq = 0
  const makeComp = (kind: 'array' | 'el' | 'hole' | 'comp', inner: () => any, rnd: () => number): any => {
    const holeVal = rnd() < 0.5
    const arrLabel = 'a' + (compSeq % 3)
    const innerV = inner()
    return (_p: any, _c: any) => () => {
      switch (kind) {
        case 'array': return [h('span', { class: arrLabel }, innerV), h('b', {}, 'x')]
        case 'el': return h('div', { class: 'el-fuzz' }, innerV)
        case 'hole': return holeVal ? null : h('em', { class: 'hole-fuzz' }, innerV)
        default: return h(Fragment, {}, [h('i', {}, '1'), innerV])
      }
    }
  }
  const rnd = mulberry32(99)
  let total = 0
  let sample = ''
  for (let i = 0; i < 300; i++) {
    const kind = (['array', 'el', 'hole', 'comp'] as const)[compSeq % 4]
    compSeq++
    const inner = makeComp(kind as 'array', () => h('span', {}, 'inner'), rnd)
    const Comp: any = (kind === 'array' || kind === 'comp')
      ? inner
      : makeComp(kind as 'array', () => h('span', {}, 'inner'), rnd)
    const oldT = h('div', {}, [h(Comp, {})]) as VNode
    const newT = h('div', {}, [h(Comp, {})]) as VNode
    const d = await dualCheck(oldT, newT)
    if (d) { total++; if (!sample) sample = `i=${i} kind=${kind}${d}` }
  }
  assert.equal(total, 0, `组件输出对账不等价 ${total}/300\n${sample}`)
})
