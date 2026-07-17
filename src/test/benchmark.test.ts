/**
 * weifuwu/client 性能基准测试
 *
 * 测量信号系统核心操作的吞吐量，用于性能回归检测。
 * 所有数字仅供参考，实际性能取决于运行环境。
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ── 浏览器全局环境 ───────────────────────────────────────────

if (typeof document === 'undefined') {
  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' })
  const win = dom.window as any
  const g = globalThis as any
  for (const key of Object.getOwnPropertyNames(win)) {
    if (key === 'Object' || key === 'Array' || key === 'Function' ||
        key === 'String' || key === 'Number' || key === 'Boolean' ||
        key === 'Symbol' || key === 'Map' || key === 'Set' ||
        key === 'RegExp' || key === 'Promise' || key === 'Error' ||
        key === 'Date' || key === 'Math' || key === 'JSON' ||
        key === 'parseInt' || key === 'parseFloat' ||
        key === 'isNaN' || key === 'isFinite' ||
        key === 'undefined' || key === 'NaN' || key === 'Infinity') continue
    if (typeof g[key] === 'undefined') {
      try { g[key] = win[key] } catch { /* skip */ }
    }
  }
}

const { signal, computed, effect, batch } = await import('../client/signal.ts')
const { jsx, Show, For } = await import('../client/jsx-runtime.ts')

// ── 基准测试配置 ────────────────────────────────────────────

const N = 10000        // 多数测试的迭代次数
const THRESHOLD_S = 2  // 单次测试最大允许秒数（防止 CI 超时）

// ── 辅助 ────────────────────────────────────────────────────

function elapsedMs(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1e6
}

// ═════════════════════════════════════════════════════════════
// Signal 性能
// ═════════════════════════════════════════════════════════════

describe('signal throughput', () => {
  it(`创建 ${N} 个 signal`, () => {
    const start = process.hrtime.bigint()
    for (let i = 0; i < N; i++) signal(i)
    const ms = elapsedMs(start)
    console.log(`  ${N} 次创建: ${ms.toFixed(1)}ms (${(N / ms).toFixed(0)} ops/ms)`)
    assert.ok(ms < THRESHOLD_S * 1000, `创建 ${N} 个 signal 超过 ${THRESHOLD_S}s: ${ms}ms`)
  })

  it(`${N} 次读取和写入`, () => {
    const s = signal(0)
    const start = process.hrtime.bigint()
    for (let i = 0; i < N; i++) {
      s.value = i
      const v = s.value
    }
    const ms = elapsedMs(start)
    console.log(`  ${N} 次写入+读取: ${ms.toFixed(1)}ms (${(N / ms).toFixed(0)} ops/ms)`)
    assert.equal(s.value, N - 1)
  })

  it(`1 个 signal 通知 ${N} 个 effect`, () => {
    const s = signal(0)
    const disposes: (() => void)[] = []
    let count = 0

    for (let i = 0; i < N; i++) {
      disposes.push(effect(() => { count += s.value }))
    }

    const start = process.hrtime.bigint()
    s.value = 1
    const ms = elapsedMs(start)

    // 清理
    for (const d of disposes) d()

    console.log(`  通知 ${N} 个 effect: ${ms.toFixed(1)}ms (${(N / ms).toFixed(0)} ops/ms)`)
    assert.ok(ms < THRESHOLD_S * 1000)
  })

  it(`${N} 个独立 signal-read effect`, () => {
    const signals = Array.from({ length: N }, () => signal(0))
    let total = 0

    const start = process.hrtime.bigint()
    const disposes = signals.map(s => effect(() => { total += s.value }))
    const createMs = elapsedMs(start)

    // 单次更新所有
    const updateStart = process.hrtime.bigint()
    for (const s of signals) s.value = 1
    const updateMs = elapsedMs(updateStart)

    for (const d of disposes) d()

    console.log(`  创建 ${N} 个 effect: ${createMs.toFixed(1)}ms`)
    console.log(`  更新 ${N} 个 signal: ${updateMs.toFixed(1)}ms`)
    assert.equal(total, N) // 每个 effect 贡献 1
  })
})

describe('computed performance', () => {
  it(`链式 computed (深度 ${N})`, () => {
    let cur = signal(1)
    const start = process.hrtime.bigint()

    // 创建一条链: a → computed → computed → ...
    for (let i = 0; i < 100; i++) {
      cur = computed(() => cur.value * 2)
    }
    const createMs = elapsedMs(start)

    const readStart = process.hrtime.bigint()
    const final = cur.value
    const readMs = elapsedMs(readStart)

    console.log(`  创建链 100 层: ${createMs.toFixed(1)}ms`)
    console.log(`  读取最底层: ${readMs.toFixed(5)}ms`)
    console.log(`  结果: ${final}`)
  })
})

// ═════════════════════════════════════════════════════════════
// Effect 性能
// ═════════════════════════════════════════════════════════════

describe('effect performance', () => {
  it(`effect 动态依赖切换 ${N} 次`, () => {
    const flag = signal(true)
    const a = signal(1)
    const b = signal(2)
    let result = 0

    effect(() => { result = flag.value ? a.value : b.value })

    const start = process.hrtime.bigint()
    for (let i = 0; i < 1000; i++) {
      flag.value = !flag.value
      a.value = i
      b.value = i * 2
    }
    const ms = elapsedMs(start)

    console.log(`  1000 次依赖切换: ${ms.toFixed(1)}ms (${(1000 / ms).toFixed(0)} ops/ms)`)
  })
})

// ═════════════════════════════════════════════════════════════
// batch 性能
// ═════════════════════════════════════════════════════════════

describe('batch performance', () => {
  it(`batch 合并 ${N} 次写入为 1 次通知`, () => {
    const s = signal(0)
    let effectCalls = 0
    const dispose = effect(() => { effectCalls++; s.value })

    const start = process.hrtime.bigint()
    batch(() => {
      for (let i = 0; i < N; i++) s.value = i
    })
    const ms = elapsedMs(start)

    dispose()
    console.log(`  合并 ${N} 次写入: ${ms.toFixed(1)}ms, effect 调用: ${effectCalls} 次`)
    // 1 次初始调用 + 1 次 batch 通知 = 2
    assert.equal(effectCalls, 2)
  })
})

// ═════════════════════════════════════════════════════════════
// JSX 渲染性能
// ═════════════════════════════════════════════════════════════

describe('JSX rendering throughput', () => {
  it(`创建 ${N} 个 div`, () => {
    const start = process.hrtime.bigint()
    for (let i = 0; i < N; i++) jsx('div', { class: 'test' }, 'hello')
    const ms = elapsedMs(start)
    console.log(`  ${N} 个 div: ${ms.toFixed(1)}ms (${(N / ms).toFixed(0)} ops/ms)`)
  })

  it(`创建 ${N} 个深层嵌套结构`, () => {
    const start = process.hrtime.bigint()
    function deep(n: number): any {
      if (n <= 0) return jsx('span', null, 'leaf')
      return jsx('div', { class: 'level-' + n }, deep(n - 1))
    }
    deep(100)
    const ms = elapsedMs(start)
    console.log(`  100 层嵌套: ${ms.toFixed(1)}ms`)
  })

  it(`For 渲染 ${N} 项列表`, () => {
    const items = Array.from({ length: N }, (_, i) => ({ id: i, name: `item-${i}` }))
    const start = process.hrtime.bigint()
    const node = For({
      each: items,
      children: (item: any) => jsx('div', { class: 'item' }, item.name),
    })
    const ms = elapsedMs(start)
    console.log(`  渲染 ${N} 项: ${ms.toFixed(1)}ms (${(N / ms).toFixed(0)} ops/ms)`)
    assert.equal(node.querySelectorAll('div').length, N)
  })
})
