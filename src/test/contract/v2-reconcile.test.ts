/**
 * vdom v2 — 双引擎对账（v1/v2 命令流 → Sim 终态等价——切换护栏）
 *
 * VDOM-V2-BLUEPRINT 阶段 2C：
 * - 同树 → v1 命令流（renderToStream/diffStream）→ Sim A（终态）
 * - 同树 → v2 命令流（renderV2/diffV2）→ Sim B（终态）
 * - **终态等价**（DOM 序列 + 事件表 + 实例集）——模拟器裁决（非手动比较）
 * - fuzz：随机树 × 100 对（渲染等价）+ 更新对（diff 等价）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h, type VNode } from '../../client/vdom/core/vnode.ts'
import { renderToStream } from '../../client/vdom/core/build.ts'
import { diffStream } from '../../client/vdom/core/diff/index.ts'
import { renderV2 } from '../../client/vdom/core/v2/render.ts'
import { diffV2, type SegmentMap } from '../../client/vdom/core/v2/diff.ts'
import { createComponentRegistry } from '../../client/vdom/core/node/component.ts'
import { Sim } from './sim.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'

const emptyCtx = { render: async () => {}, browser: null } as never

async function collectV1(s: ReadableStream<Command>): Promise<Command[]> {
  const out: Command[] = []
  for await (const c of s) out.push(c)
  return out
}

function collectObs(o: import('../../client/vdom/observable/index.ts').Observable<Command>): Promise<Command[]> {
  return new Promise((resolve, reject) => {
    const out: Command[] = []
    o.subscribe({ next: (c) => out.push(c), error: reject, complete: () => resolve(out) })
  })
}

/** 命令流 → Sim 终态序列 */
function simState(cmds: Command[]): string {
  const sim = new Sim()
  for (const c of cmds) sim.apply(c)
  return sim.toString()
}

test('对账：渲染等价（同树 → 双引擎 → Sim 终态相等）', async () => {
  const root = h('div', { class: 'a' }, [
    h('span', { key: 's1', 'data-k': '1' }, 'x'),
    h('button', { onClick: () => {} }, '点'),
    h('i', {}, null),
    h('b', {}, [h('em', {}, 'deep')]),
  ]) as VNode
  const v1 = await collectV1(renderToStream(root, emptyCtx, createComponentRegistry()))
  const v2 = await collectObs(renderV2(root, emptyCtx, createComponentRegistry()))
  assert.equal(simState(v2), simState(v1), 'v2 渲染终态必须等于 v1')
})

test('对账：diff 等价（更新对 → 双引擎 → Sim 终态相等）', async () => {
  const oldT = h('div', {}, [
    h('span', { key: 'a', 'data-k': '1' }, 'a'),
    h('span', { key: 'b', 'data-k': '2' }, 'b'),
  ]) as VNode
  const newT = h('div', {}, [
    h('span', { key: 'b', 'data-k': '2' }, 'bb'),   // 移动 + 文本变化
    h('span', { key: 'c', 'data-k': '3' }, 'c'),     // 新增
  ]) as VNode
  // 两侧「旧树渲染 + diff」组合（diff 命令需旧树基线——Sim 终态）
  const v1Base = (await collectV1(renderToStream(oldT, emptyCtx, createComponentRegistry()))).filter((c) => c.op !== 'done')
  const v1d = (await collectV1(diffStream(oldT, newT, emptyCtx, createComponentRegistry()))).filter((c) => c.op !== 'done')
  const segments = new Map<string, never>() as unknown as SegmentMap
  const reg = createComponentRegistry()
  const v2Base = (await collectObs(renderV2(oldT, emptyCtx, reg))).filter((c) => c.op !== 'done')
  const v2d = (await collectObs(diffV2(oldT, newT, emptyCtx, segments, reg))).filter((c) => c.op !== 'done')
  assert.equal(simState([...v2Base, ...v2d]), simState([...v1Base, ...v1d]), 'v2 diff 终态必须等于 v1')
})

test('对账：随机树 fuzz（50 对——渲染 + diff 双引擎）', async () => {
  let seed = 2026
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  const mkTree = (depth: number): any => {
    if (depth <= 0 || rnd() < 0.25) return rnd() < 0.6 ? 't' + Math.floor(rnd() * 4) : null
    const n = 1 + Math.floor(rnd() * 3)
    const children = Array.from({ length: n }, () => mkTree(depth - 1))
    const key = rnd() < 0.3 ? 'k' + Math.floor(rnd() * 4) : null
    return h(['div', 'span', 'p'][Math.floor(rnd() * 3)], key ? { key, 'data-k': key } : {}, children)
  }
  const mkPair = (): [VNode, VNode] => {
    const mkRoot = (): VNode => {
      const t = mkTree(3)
      return (t === null || typeof t === 'string' || typeof t === 'number') ? h('div', {}, t) : t as VNode
    }
    return [mkRoot(), mkRoot()]
  }
  let renderMismatch = 0
  let diffMismatch = 0
  let sample = ''
  for (let i = 0; i < 50; i++) {
    const [oldT, newT] = mkPair()
    // 渲染对账（两棵树各自 renderV1/v2）
    const v1a = await collectV1(renderToStream(oldT, emptyCtx, createComponentRegistry()))
    const v2a = await collectObs(renderV2(oldT, emptyCtx, createComponentRegistry()))
    if (simState(v2a) !== simState(v1a)) { renderMismatch++; if (!sample) sample = `render i=${i}` }
    // diff 对账（old→new——旧树基线组合）
    const segs = new Map<string, never>() as unknown as SegmentMap
    const reg = createComponentRegistry()
    const v1Base = (await collectV1(renderToStream(oldT, emptyCtx, createComponentRegistry()))).filter((c) => c.op !== 'done')
    const v1d = (await collectV1(diffStream(oldT, newT, emptyCtx, createComponentRegistry()))).filter((c) => c.op !== 'done')
    const v2Base = (await collectObs(renderV2(oldT, emptyCtx, reg))).filter((c) => c.op !== 'done')
    const v2d = (await collectObs(diffV2(oldT, newT, emptyCtx, segs, reg))).filter((c) => c.op !== 'done')
    if (simState([...v2Base, ...v2d]) !== simState([...v1Base, ...v1d])) {
      diffMismatch++
      if (!sample) sample = `diff i=${i}`
    }
  }
  assert.equal(renderMismatch, 0, `渲染对账不等价 ${renderMismatch}/50 ${sample}`)
  assert.equal(diffMismatch, 0, `diff 对账不等价 ${diffMismatch}/50 ${sample}`)
})
