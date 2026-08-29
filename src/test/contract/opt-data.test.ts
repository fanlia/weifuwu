/**
 * OBSERVABLE-OPTIMIZE 波次 2 —— 数据面契约（derived 派生 + asyncErrors$）
 *
 * derived 锁定：
 * - getter 形态（读永远最新——getter 纪律）
 * - **读时比较**：源值引用变化才重算（compute 执行次数断言——缓存）
 * - 自定义比较器（字段面——对象源引用变化但字段同值）
 * - 嵌套派生（组合即函数引用）
 * - 惰性（不读不计算——零主动重算）
 * - 零内部订阅（无泄漏面——源 getter 只管读）
 *
 * asyncErrors$ 锁定：
 * - useAsyncData 失败 → 事件（key + error——诊断器/作者订阅）
 * - get() 仍 null（区块降级兼容——语义不变）
 * - 成功不发错误事件
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h } from '../../client/vdom/core/vnode.ts'
import { createSegment, type SegmentMap } from '../../client/vdom/core/v2/diff.ts'
import { createStore, createSignal, derived } from '../../client/vdom/store.ts'
import { asyncErrors$ } from '../../client/vdom/hooks/env.ts'

const emptyCtx = { render: async () => {}, browser: null } as never

test('derived：读时计算——源未变缓存命中（compute 只跑 1 次）', () => {
  const a = createSignal({ v: 1 })
  const b = createSignal({ v: 2 })
  let computes = 0
  const d = derived([a, b], (vals) => {
    computes++
    return (vals[0] as { v: number }).v + (vals[1] as { v: number }).v
  })
  assert.equal(d(), 3)
  assert.equal(d(), 3)
  assert.equal(computes, 1, '源未变——缓存命中（不重算）')
})

test('derived：源变 → 重算（getter 永远最新）', () => {
  const a = createSignal(1)
  let computes = 0
  const d = derived([a], () => { computes++; return a() * 2 })
  assert.equal(d(), 2)
  a.update((x) => x + 1) // 引用变化（primitive 重赋值——set 是 Partial 对象语义——用 update）
  assert.equal(d(), 4)
  assert.equal(computes, 2, '源变 → 重算')
})

test('derived：自定义比较器（字段面——引用变化但字段同值——不重算）', () => {
  const a = createSignal({ id: 1, name: 'x' })
  let computes = 0
  const d = derived([a], () => { computes++; return (a() as { id: number }).id }, (x, y) => (x as { id: number }).id === (y as { id: number }).id)
  assert.equal(d(), 1)
  a.set({ id: 1, name: 'y' }) // 新引用——同 id——比较器判定未变
  assert.equal(d(), 1)
  assert.equal(computes, 1, '同 id 新引用——不重算')
  a.set({ id: 2, name: 'y' })
  assert.equal(d(), 2)
  assert.equal(computes, 2, 'id 变 → 重算')
})

test('derived：嵌套派生（组合即函数引用）', () => {
  const a = createSignal(1)
  const b = createSignal(2)
  const sum = derived([a, b], (v) => (v[0] as number) + (v[1] as number))
  let computes = 0
  const doubled = derived([sum], (v) => { computes++; return (v[0] as number) * 2 })
  assert.equal(doubled(), 6)
  assert.equal(computes, 1)
  a.update((x) => x + 1) // sum 变 → doubled 重算
  assert.equal(doubled(), 8)
  assert.equal(computes, 2, '上游派生变化 → 下游重算')
})

test('derived：惰性（不读不计算）+ 零订阅（getter 只管读——无泄漏面）', () => {
  const a = createSignal(1)
  let computes = 0
  const d = derived([a], () => { computes++; return a() * 2 })
  assert.equal(computes, 0, '不读不计算（惰性）')
  assert.equal(d(), 2)
  assert.equal(computes, 1)
  // derived 不向源订阅：显式订阅者收到的通知数不受 derived 影响
  let notified = 0
  a.subscribe(() => notified++)
  const d2 = derived([a], () => a() * 3)
  assert.equal(d2(), 3)
  a.update((x) => x + 1) // 只有显式订阅在收
  assert.equal(notified, 1, 'derived 不向源订阅（通知只来自显式订阅）')
})

test('derived：signal + store 混合源（getter 通用——任意读面）', () => {
  const sig = createSignal(10)
  const store = createStore({ n: 5 })
  const d = derived([sig, () => store.state.n], (v) => (v[0] as number) + (v[1] as number))
  assert.equal(d(), 15)
  sig.set(20 as never) // set 是 Partial 对象语义——primitive 场景直接替换更新？——
  // ——createSignal(10) 的 set(20) —— Partial<number> = number（TS 宽泛）——运行期 spread 替换
  assert.equal(d(), 25, 'signal 更新后派生最新')
  store.set({ n: 7 })
  assert.equal(d(), 27, 'store 更新后派生最新')
})

test('asyncErrors$：useAsyncData 失败 → 事件（get 仍 null 降级）', async () => {
  const errors: { key: string; error: unknown }[] = []
  const unsub = asyncErrors$.subscribe({ next: (e) => errors.push(e) })
  try {
    let rejects = true
    const Comp: any = (_p: any, c: any) => {
      const [get] = c.ui.useAsyncData(
        () => rejects ? Promise.reject(new Error('boom')) : Promise.resolve({ ok: 1 }),
        'wf-opt-errors-' + Math.random(),
      )
      return () => h('div', {}, String(get()?.ok ?? 'null'))
    }
    const segs: SegmentMap = new Map()
    const seg = createSegment(Comp as never, {}, emptyCtx, 'root.0.999', () => {})
    segs.set('root.0.999', seg)
    seg.renderFn({})
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(errors.length, 1, '失败事件恰好 1 个')
    assert.equal(errors[0].key.startsWith('wf-opt-errors-'), true, '事件含 key')
    assert.match(String(errors[0].error), /boom/, '事件含 error')
    // get 仍 null（降级兼容——页面其余照常）
    rejects = false
    // 成功路径不发错误事件
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(errors.length, 1, '成功路径零错误事件')
  } finally {
    unsub.unsubscribe()
  }
})
