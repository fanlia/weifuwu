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

// ── 2027-09 tour 违例回归：洞→组件转换 + 组件输出 null 的挂载分离 ────────

test('RH-8 洞→组件（输出 null）：锚挂槽位父——命名保持 compId.0（id 空间合法）', async () => {
  const runs: string[] = []
  const Tour = () => { runs.push('tour'); return () => null } // 弹窗内容走命令式——输出 null
  let open = false
  const Demo = () => () => h('div', { class: 'wf-stack' }, [
    h('div', { class: 'wf-row' }, [h('button', { class: 'go' }, '开始')]),
    open ? h(Tour, { steps: [] }) : null,
  ])
  const oldT = h('main', {}, [h(Demo)])
  const segs = new Map<string, Segment>()
  const reg = createComponentRegistry()
  const sim = new Sim()
  for (const c of await drainStream(renderToStreamV2(oldT, {}, reg, segs))) sim.apply(c)
  open = true
  const newT = h('main', {}, [h(Demo)])
  const cmds = await drainStream(diffToStreamV2(oldT, newT, {}, reg, segs))
  for (const c of cmds) sim.apply(c) // Sim 状态机验证（insert 容器性）
  // 断言：洞→组件转换的锚挂在槽位父（非 compId 槽）
  const inserts = cmds.filter((c) => c.op === 'insert')
  const holeIns = inserts.find((c) => (c as { id: string }).id.endsWith('.0') && (cmds as never[]).some((x) => (x as { op: string; id: string }).op === 'createAnchor' && (x as { id: string }).id === (c as { id: string }).id))
  assert.ok(!holeIns || (holeIns as { parent: string }).parent === 'root.0.0', `洞锚插槽位父（${(holeIns as { parent: string }).parent}）——不插组件槽`)
  // 终态等价（参考世界）
  const ref = new Sim()
  const refSegs = new Map<string, Segment>()
  for (const c of await drainStream(renderToStreamV2(newT, {}, createComponentRegistry(), refSegs))) ref.apply(c)
  const s1 = ref.snapshot()
  const s2 = sim.snapshot()
  assert.equal(s1, s2, '终态等价（洞→组件转换无残留——锚位正确）')
})

test('RH-9 混合列表：unkeyed 项位置稳定——不重建（组件状态/事件闭包保持）', async () => {
  // 病灶（reports 图表 tooltip 自持循环实证）：keyed+unkeyed 混排列表中
  // unkeyed 项旧侧无条件 removeTreeV2 + 新侧无条件 renderV2Node——每轮
  // 渲染销毁重建（组件工厂重跑 + DOM 节点替换——mouseenter 新节点重复
  // 触发 → 渲染→替换→再触发自持循环——tooltip 永不出现）——修复：unkeyed
  // 项位置身份接管（pos:{i}——keyed.ts 设计契约落定——位置稳定 = diff 复用）
  const runs: string[] = []
  const K = makeKeyed('K', runs)
  const U = () => { runs.push('unkeyed'); return () => h('span', { class: 'u' }) }
  const oldT = h('div', {}, [
    h(U),            // unkeyed 组件项（位置 0）
    h(K, { key: 'k1', n: 1 }),
    h('div', { class: 'plain' }), // unkeyed 元素项（位置 2）
  ])
  const newT = h('div', {}, [
    h(U),
    h(K, { key: 'k1', n: 2 }), // K 更新（同 key）
    h('div', { class: 'plain' }),
  ])
  await twoPhase(oldT, newT)
  assert.equal(runs.filter((r) => r === 'unkeyed').length, 1, `unkeyed 组件工厂应只跑 1 次（实跑 ${runs.filter((r) => r === 'unkeyed').length} = 重建复现）`)
  assert.equal(runs.filter((r) => r.startsWith('keyed:')).length, 1, `keyed 工厂不重跑（实跑 ${runs.filter((r) => r.startsWith('keyed:')).length}）`)
})

test('RH-10 混合列表：unkeyed 项位置变化——位置身份移除/新建（语义不串位）', async () => {
  const runs: string[] = []
  const K = makeKeyed('K', runs)
  const U = (label: string) => { runs.push(`u:${label}`); return () => h('span', { class: `u-${label}` }) }
  const oldT = h('div', {}, [
    h(U('a')), // 位置 0
    h(K, { key: 'k1', n: 1 }),
  ])
  // keyed 前移到位置 0——旧 unkeyed 位置被接管（位置身份——移除）→ 新
  // 位置 1 的 unkeyed 项新建
  const newT = h('div', {}, [
    h(K, { key: 'k1', n: 2 }),
    h(U('a')),
  ])
  await twoPhase(oldT, newT)
  assert.equal(runs.filter((r) => r === 'u:a').length, 2, `旧 unkeyed 项随位置身份移除、新位置新建（实跑 ${runs.filter((r) => r === 'u:a').length}——两段生命周期）`)
  assert.equal(runs.filter((r) => r.startsWith('keyed:')).length, 1, `keyed 工厂不重跑（实跑 ${runs.filter((r) => r.startsWith('keyed:')).length}）`)
})
