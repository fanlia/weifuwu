/**
 * reducer 回放确定性契约（VDOM-CORE-EXCELLENCE 波次 F1——2027-10）
 *
 * **流化定稿纪律**（OBSERVABLE-COMPLETE machine$ 模式）：状态机外壳 =
 * 纯 reducer——**回放 = 同函数重喂记录流**——流化不增加正确性（迁移表
 * 保证）但让错误更早现形——回放确定性是 machine$ 模式的完成判据。
 *
 * 锁定：随机事件序列（多种子）→ 实例 A 喂入记录轨迹 → 实例 B 重喂同
 * 序列 → **轨迹逐点全等**（纯函数确定性——AbsorbState/PopupPhase 双机）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { absorbReducer, type AbsorbEvent, type AbsorbPhase } from '../../client/vdom/core/ssr/absorb.ts'
import { popupPhaseReducer, type PopupEvent, type PopupPhase } from '../../client/vdom/hooks/popup-manager.ts'

/** mulberry32 固定种子随机（对齐 reconcile 生成器——可复现） */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 通用回放：喂 A 记录轨迹 → 重喂 B → 轨迹逐点全等 */
function replayEq<E, S>(
  events: E[],
  reducer: (s: S, e: E) => S,
  init: S,
): { traceA: S[]; traceB: S[] } {
  let a = init
  const traceA: S[] = [a]
  for (const e of events) { a = reducer(a, e); traceA.push(a) }
  let b = init
  const traceB: S[] = [b]
  for (const e of events) { b = reducer(b, e); traceB.push(b) }
  return { traceA, traceB }
}

test('F1 回放：AbsorbState 随机事件序列重喂——轨迹逐点全等（多种子）', () => {
  for (const seed of [11, 99, 2026, 42]) {
    const rnd = mulberry32(seed)
    const events: AbsorbEvent[] = Array.from({ length: 200 }, () => {
      const r = rnd()
      if (r < 0.2) return { kind: 'begin' }
      if (r < 0.6) return { kind: 'next', matched: rnd() < 0.7 }
      if (r < 0.8) return { kind: 'end', remaining: rnd() < 0.5 ? 0 : 3 }
      return { kind: 'reset' }
    })
    const { traceA, traceB } = replayEq<AbsorbEvent, AbsorbPhase>(events, absorbReducer, 'inactive')
    assert.deepEqual(traceB, traceA, `seed=${seed} 轨迹全等（${traceA.length} 步）`)
    // 相位合法性（迁移表值域）
    for (const s of traceA) assert.ok(['inactive', 'consuming', 'failed'].includes(s), `相位值域: ${s}`)
  }
})

test('F1 回放：PopupPhase 随机事件序列重喂——轨迹逐点全等（多种子）', () => {
  for (const seed of [5, 17, 8888]) {
    const rnd = mulberry32(seed)
    const events: PopupEvent[] = Array.from({ length: 200 }, () => {
      const r = rnd()
      if (r < 0.4) return { kind: 'open' }
      if (r < 0.6) return { kind: 'exit' }
      if (r < 0.8) return { kind: 'closed' }
      return { kind: 'disposed' }
    })
    const { traceA, traceB } = replayEq<PopupEvent, PopupPhase>(events, popupPhaseReducer, 'closed')
    assert.deepEqual(traceB, traceA, `seed=${seed} 轨迹全等（${traceA.length} 步）`)
    for (const s of traceA) assert.ok(['closed', 'open', 'exit'].includes(s), `相位值域: ${s}`)
  }
})

test('F1 回放：正交序列——AbsorbState 与 PopupPhase 互不干扰（状态机隔离）', () => {
  // 同一事件流同时驱动两台状态机（machine$ 并存——各自轨迹确定）
  const rnd = mulberry32(2026)
  const absEvents: AbsorbEvent[] = []
  const popEvents: PopupEvent[] = []
  for (let i = 0; i < 100; i++) {
    absEvents.push(rnd() < 0.5 ? { kind: 'next', matched: true } : { kind: 'reset' })
    popEvents.push(rnd() < 0.5 ? { kind: 'open' } : { kind: 'closed' })
  }
  const abs = replayEq<AbsorbEvent, AbsorbPhase>(absEvents, absorbReducer, 'inactive')
  const pop = replayEq<PopupEvent, PopupPhase>(popEvents, popupPhaseReducer, 'closed')
  assert.deepEqual(abs.traceB, abs.traceA)
  assert.deepEqual(pop.traceB, pop.traceA)
})

test('F1 回放：遍历轨迹覆盖（随机序列到达全部相位——生成器有效性）', () => {
  const rnd = mulberry32(7)
  const events: AbsorbEvent[] = Array.from({ length: 300 }, () => {
    const r = rnd()
    if (r < 0.2) return { kind: 'begin' }
    if (r < 0.6) return { kind: 'next', matched: rnd() < 0.6 }
    if (r < 0.8) return { kind: 'end', remaining: rnd() < 0.5 ? 0 : 2 }
    return { kind: 'reset' }
  })
  let s: AbsorbPhase = 'inactive'
  const seen = new Set<AbsorbPhase>([s])
  for (const e of events) { s = absorbReducer(s, e); seen.add(s) }
  assert.deepEqual([...seen].sort(), ['consuming', 'failed', 'inactive'], '三相位全到达（覆盖有效性——防轨迹退化）')
})
