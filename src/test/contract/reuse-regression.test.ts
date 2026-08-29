/**
 * RENDER-HEALTH-PLAN 波次 2 —— diff 组件复用失败最小复现（契约层）
 *
 * 病灶：交付物渲染循环（FilesSection 每拍 remount——框架根因）——组件在
 * diff 中「不重跑 = 复用」——本文件锁定四条候选路径的复用失败形态：
 *   1) 混合列表（keyed+unkeyed 混排——unkeyed 项增删）
 *   2) 条件槽位（空洞↔元素切换在 keyed 组件前）
 *   3) 组件输出对照（diffComponentOutput——keyed 路径）
 *   4) FRAG 投影（Fragment 内 keyed 组件——Fragment 槽位变化）
 *
 * 断言形态：**工厂执行次数**（runs 数组——单世界双阶段）——1 = 复用
 * （挂载仅一次）——>1 = 复现（diff 重建——状态丢失诊断位）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h, Fragment } from '../../client/vdom/index.ts'
import { createComponentRegistry } from '../../client/vdom/core/node/component.ts'
import { renderToStreamV2, diffToStreamV2 } from '../../client/vdom/core/v2/integrate.ts'
import type { Segment, SegmentMap } from '../../client/vdom/core/v2/diff.ts'
import { Sim, drainStream } from './sim.ts'

/** 双阶段消费（单世界——build old → diff new——工厂计数准确） */
async function twoPhase(oldT: ReturnType<typeof h>, newT: ReturnType<typeof h>) {
  const segs: SegmentMap = new Map<string, Segment>()
  const reg = createComponentRegistry()
  const sim = new Sim()
  for (const c of await drainStream(renderToStreamV2(oldT, {}, reg, segs))) sim.apply(c)
  const cmds = await drainStream(diffToStreamV2(oldT, newT, {}, reg, segs))
  for (const c of cmds) sim.apply(c)
  return { segs, reg }
}

function makeKeyed(label: string, runs: string[]) {
  const C = (p: { label?: string; n?: number }) => {
    runs.push(`keyed:${p.label ?? '?'}`)
    return () => h('span', { class: 'k' }, String((p as { n?: number }).n ?? 0))
  }
  ;(C as { __name?: string }).__name = label
  return C
}

test('RH-1 混合列表：unkeyed 项增删——keyed 组件不重跑（复用）', async () => {
  const runs: string[] = []
  const K = makeKeyed('K', runs)
  const oldT = h('div', {}, [
    h('span', { class: 'u1', key: null }), h(K, { key: 'k1', n: 1 }), h('span', { class: 'u2', key: null }),
  ])
  // unkeyed 项变化（u1 删、u3 增）——K 不动
  const newT = h('div', {}, [
    h('span', { class: 'u3', key: null }), h(K, { key: 'k1', n: 1 }), h('span', { class: 'u2', key: null }),
  ])
  await twoPhase(oldT, newT)
  const kr = runs.filter((r) => r.startsWith("keyed:"))
  assert.equal(kr.length, 1, `混排增删后 keyed 工厂应只跑 1 次（实跑 ${kr.length} = 复现）`)
})

test('RH-2 条件槽位：空洞↔元素切换在 keyed 前——keyed 不重跑', async () => {
  const runs: string[] = []
  const K = makeKeyed('K', runs)
  let cond = true
  const oldT = h('div', {}, [cond ? h('em', { class: 'c' }) : null, h(K, { key: 'k1', n: 1 })])
  const newT = h('div', {}, [cond ? null : h('b', { class: 'c' }), h(K, { key: 'k1', n: 1 })])
  await twoPhase(oldT, newT)
  const kr = runs.filter((r) => r.startsWith("keyed:"))
  assert.equal(kr.length, 1, `条件切换后 keyed 工厂应只跑 1 次（实跑 ${kr.length} = 复现）`)
})

test('RH-3 输出对照：keyed 组件在数组（组件输出自身变化）——不重跑', async () => {
  const runs: string[] = []
  const K = makeKeyed('K', runs)
  const A = () => { runs.push('A'); return () => h('span', { class: 'a' }) }
  const oldT = h('div', {}, [h(A), h(K, { key: 'k1', n: 1 }), h(A)])
  const newT = h('div', {}, [h(A), h(K, { key: 'k1', n: 2 }), h(A)]) // K 的 n 变化（同 key 同位置）
  await twoPhase(oldT, newT)
  const kr = runs.filter((r) => r.startsWith("keyed:"))
  assert.equal(kr.length, 1, `数组内 K 属性变化工厂应只跑 1 次（实跑 ${kr.length} = 复现）`)
})

test('RH-4 投影：Fragment 内 keyed 组件——FRAG 槽位变化不重跑', async () => {
  const runs: string[] = []
  const K = makeKeyed('K', runs)
  const oldT = h('div', {}, [
    h(Fragment, {}, [h('span', { class: 'f1' }), h(K, { key: 'k1', n: 1 })]),
  ])
  const newT = h('div', {}, [
    h(Fragment, {}, [h('span', { class: 'f1' }), h('span', { class: 'f2' }), h(K, { key: 'k1', n: 1 })]),
  ])
  await twoPhase(oldT, newT)
  const kr = runs.filter((r) => r.startsWith("keyed:"))
  assert.equal(kr.length, 1, `FRAG 槽位变化后 keyed 工厂应只跑 1 次（实跑 ${kr.length} = 复现）`)
})

test('RH-5 列表 map：keyed 组件列表——数据更新（n 变化）不重建', async () => {
  const runs: string[] = []
  const K = makeKeyed('K', runs)
  const item = (id: string, n: number) => h(K, { key: id, n })
  const oldT = h('div', {}, [item('a', 1), item('b', 1), item('c', 1)])
  const newT = h('div', {}, [item('a', 2), item('b', 1), item('c', 1)]) // a 数据更新
  await twoPhase(oldT, newT)
  const kr = runs.filter((r) => r.startsWith("keyed:"))
  assert.equal(kr.length, 3, `列表数据更新——keyed 工厂应各跑 1 次（实跑 ${kr.length} = 复现）`)
})

test('RH-6 顶层输出 Fragment：输出 FRAG 结构微变——子 keyed 组件不重跑', async () => {
  const runs: string[] = []
  const K = makeKeyed('K', runs)
  // 同类型组件（段复用）——renderFn 输出 FRAG 结构微变（文件面板典型——
  // header 改名 + footer→section——内部 keyed 列表不动）
  let variant = 1
  const Pane = () => {
    runs.push('pane')
    return () => variant === 1
      ? h(Fragment, {}, [h('header', { class: 'hd' }), h('div', {}, [h(K, { key: 'k1', n: 1 }), h(K, { key: 'k2', n: 2 })]), h('footer', { class: 'ft' })])
      : h(Fragment, {}, [h('header', { class: 'hd2' }), h('div', {}, [h(K, { key: 'k1', n: 1 }), h(K, { key: 'k2', n: 2 })]), h('section', { class: 'extra' })])
  }
  const oldT = h('main', {}, [h(Pane)])
  const segs: SegmentMap = new Map()
  const reg = createComponentRegistry()
  const sim = new Sim()
  for (const c of await drainStream(renderToStreamV2(oldT, {}, reg, segs))) sim.apply(c) // variant=1
  variant = 2
  const newT = h('main', {}, [h(Pane)])
  for (const c of await drainStream(diffToStreamV2(oldT, newT, {}, reg, segs))) sim.apply(c)
  const kr = runs.filter((r) => r.startsWith("keyed:"))
  assert.equal(kr.length, 2, `同类型 FRAG 结构微变——keyed 子项工厂各 1 次（实跑 ${kr.length} = 复现）`)
})

test('RH-7 条件槽位无 key 组件：兄弟有 keyed 列表——切换后 keyed 不重跑', async () => {
  const runs: string[] = []
  const K = makeKeyed('K', runs)
  const S = () => { runs.push('s'); return () => h('section', { class: 's' }, 's') }
  let cond = true
  const oldT = h('div', {}, [cond ? h(S) : null, h(K, { key: 'k1', n: 1 })])
  const newT = h('div', {}, [cond ? null : h('b', { class: 'b' }), h(K, { key: 'k1', n: 1 })])
  await twoPhase(oldT, newT)
  const kr = runs.filter((r) => r.startsWith("keyed:"))
  assert.equal(kr.length, 1, `条件槽位切换——keyed 兄弟工厂 1 次（实跑 ${kr.length} = 复现）`)
})
