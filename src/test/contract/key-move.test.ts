/**
 * keyed 组件顺移物理 move 契约（VDOM-CORE-EXCELLENCE KEYED-MOVE M2——2027-10）
 *
 * **movedComp 撤销（A2「一律退重建」→ M2 分支替代）**：
 * - 单根 el 输出 → 槽位 remap（noMove: true——元素同路径——P 契约实证）
 * - compId 子空间输出（数组/锚/嵌套）→ 输出根逐节点**物理 move**
 *   （id 自映射——detach+insert——段/状态/DOM 引用零扰动）
 * - move Post 自映射豁免（残留 = 自己——seed=42 fuzz 实证修复）
 * - 段未知 → 退重建（防御性兜底——fuzz D5 安全网）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h } from '../../client/vdom/core/vnode.ts'
import { renderToStreamV2, diffToStreamV2 } from '../../client/vdom/core/v2/integrate.ts'
import { createComponentRegistry } from '../../client/vdom/core/node/component.ts'
import { drainStream } from './sim.ts'
import { verifyEquivalence } from './helpers/verify.ts'

/** 数组输出组件（compId 子空间——物理 move 目标形态） */
const makeArrComp = (id: string) => () => () => [h('span', { key: 'sa' + id }, 'a' + id), 't' + id]
/** 单 el 输出组件（槽位 remap 形态） */
const makeElComp = (id: string) => () => () => h('div', { class: 'el-' + id }, 'e' + id)
/** 带内部状态闭包（状态保持探针） */
const makeStateful = () => {
  let renders = 0
  return () => { renders++; return () => { renders++; return h('div', {}, 'n' + renders) } }
}

test('M2 单根 el 输出组件顺移 → 槽位 remap（noMove: true——零重建）', async () => {
  const reg = createComponentRegistry()
  const segs = new Map()
  const A = makeElComp('a')
  const B = makeElComp('b')
  const oldT = h('div', {}, [h(A, { key: 'ka' }), h(B, { key: 'kb' })])
  const newT = h('div', {}, [h(B, { key: 'kb' })])
  await drainStream(renderToStreamV2(oldT, {}, reg, segs))
  const d = await drainStream(diffToStreamV2(oldT, newT, {}, reg, segs))
  const moves = d.filter((c: any) => c.op === 'move')
  // 删头：a 卸载 + b 前移——b 单根 el → 槽位 remap
  assert.equal(moves.length, 1, `b 前移 1 条 move（实际 ${moves.length}）`)
  assert.equal((moves[0] as any).noMove, true, '单根 el = 槽位 remap（noMove: true）')
  assert.ok(!d.some((c: any) => c.op === 'mount'), '无 mount 信号（段零扰动——非重建）')
})

test('M2 数组输出组件顺移 → 物理 move 链（id 自映射——ref 保持顺序）', async () => {
  const reg = createComponentRegistry()
  const segs = new Map()
  const Arr = makeArrComp('x')
  const oldT = h('div', {}, ['lead', h(Arr, { key: 'ka' })])
  const newT = h('div', {}, [h(Arr, { key: 'ka' }), 'lead'])
  await drainStream(renderToStreamV2(oldT, {}, reg, segs))
  const d = await drainStream(diffToStreamV2(oldT, newT, {}, reg, segs))
  const moves = d.filter((c: any) => c.op === 'move')
  // 数组输出 [span, text] → 2 节点物理 move（id 自映射 noMove: false）
  assert.equal(moves.length, 2, `2 输出根物理 move（实际 ${moves.length}）`)
  for (const m of moves) {
    assert.equal((m as any).noMove, false, '物理 move（noMove: false——detach+insert）')
    assert.equal((m as any).id, (m as any).newId, `id 自映射（${(m as any).id}）`)
  }
  // ref 链：首节点 ref = 前邻输出根；次节点 ref = 首节点（不逆序堆叠）
  const [m1, m2] = moves as any[]
  assert.equal(m2.ref, m1.id, '次节点 ref = 首节点 id（数组顺序保持）')
  assert.ok(!d.some((c: any) => c.op === 'mount'), '无 mount 信号')
})

test('M2 顺移后状态闭包保持 + 工厂不重跑（物理 move 零扰动行为面）', async () => {
  const reg = createComponentRegistry()
  const segs = new Map()
  let factoryRuns = 0
  let renderCalls = 0
  const Stateful = () => {
    factoryRuns++
    let internal = 0
    return () => {
      renderCalls++
      internal++
      return [h('b', { key: 'b1' }, 'x' + internal), 'y']
    }
  }
  const oldT = h('div', {}, ['s', h(Stateful, { key: 'ks' })])
  const newT = h('div', {}, [h(Stateful, { key: 'ks' }), 's'])
  await drainStream(renderToStreamV2(oldT, {}, reg, segs))
  const f0 = factoryRuns
  const r0 = renderCalls
  await drainStream(diffToStreamV2(oldT, newT, {}, reg, segs))
  assert.equal(factoryRuns - f0, 0, '工厂不重跑（段零扰动）')
  assert.equal(renderCalls - r0, 1, 'renderFn 恰 1 次（顺移对照——内部状态 +1 延续）')
})

test('M2 物理 move 终态等价（Sim 对账——多种子）', async () => {
  for (const seed of [11, 42, 2026]) {
    const make = (swapped: boolean) => {
      const X = makeArrComp('x' + seed)
      const Y = makeElComp('y' + seed)
      const items = [h(X, { key: 'kx' }), h(Y, { key: 'ky' }), 'tail']
      return h('div', {}, swapped ? [...items].reverse() : items) as never
    }
    const diff = await verifyEquivalence(make(false), make(true), createComponentRegistry())
    assert.equal(diff, null, `seed=${seed} 顺移等价（${diff ?? ''}）`)
  }
})

test('M2 命令数基线：10k keyed 组件删头前移 ≤ N+20（物理 move O(N)——重建 ~5N 对账）', async () => {
  const reg = createComponentRegistry()
  const segs = new Map()
  const El = makeElComp('b')
  const N = 10000
  const oldT = h('ul', {}, Array.from({ length: N }, (_, i) => h(El, { key: 'k' + i }))) as never
  const newT = h('ul', {}, Array.from({ length: N }, (_, i) => h(El, { key: 'k' + (i + 1) }))) as never
  await drainStream(renderToStreamV2(oldT, {}, reg, segs))
  const d = await drainStream(diffToStreamV2(oldT, newT, {}, reg, segs))
  // A2 重建路径理论 ~5N（remove+create+insert+close+mount ×9999）——M2 物
  // 理 move = 9999 move + 新增/删除少量 = O(N)
  assert.ok(d.length <= N + 20, `10k 删头前移命令数 ${d.length} ≤ ${N + 20}（O(N)——基线登记 2027-10）`)
  const moves = d.filter((c: any) => c.op === 'move').length
  assert.ok(moves >= N - 5, `move ${moves} ≥ N-5（顺移主体——非重建）`)
  const mounts = d.filter((c: any) => c.op === 'mount').length
  assert.ok(mounts <= 2, `mount ${mounts} ≤ 2（仅新增项——生命周期零噪声）`)
})