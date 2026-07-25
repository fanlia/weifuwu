/**
 * weifuwu/client signal 增强测试
 *
 * 覆盖：computed 惰性求值、循环依赖、Signal edge cases、batch 异常恢复
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { signal, computed, effect, batch, untrack, isSignal } = await import('../../client/signal.ts')

// ═════════════════════════════════════════════════════════════
// Signal edge cases
// ═════════════════════════════════════════════════════════════

describe('signal edge cases', () => {
  it('接受 undefined', () => {
    const s = signal(undefined)
    assert.equal(s.value, undefined)
  })

  it('接受 null', () => {
    const s = signal(null)
    assert.equal(s.value, null)
  })

  it('写入相同值不触发', () => {
    const s = signal(42)
    let calls = 0
    effect(() => { calls++; s.value })
    calls = 0
    s.value = 42  // 相同值
    assert.equal(calls, 0)
  })

  it('mutate 空操作通知（无法检测深层次变化）', () => {
    const s = signal({ a: 1 })
    let calls = 0
    effect(() => { calls++; s.value })
    calls = 0
    s.mutate(() => {})  // mutate 总是通知（无法检测值是否真的变了）
    assert.equal(calls, 1)  // notify 总是触发
  })

  it('dispose 后 set 不触发', () => {
    const s = signal(0)
    let calls = 0
    const dispose = effect(() => { calls++; s.value })
    calls = 0
    dispose()
    s.value = 1
    assert.equal(calls, 0)
  })

  it('dispose 后 mutate 不触发', () => {
    const s = signal([1])
    let calls = 0
    const dispose = effect(() => { calls++; s.value })
    calls = 0
    dispose()
    s.mutate(arr => arr.push(2))
    assert.equal(calls, 0)
  })

  it('dispose 两次安全', () => {
    const s = signal(0)
    let calls = 0
    const dispose = effect(() => { calls++; s.value })
    dispose()
    dispose()  // 第二次不报错
    assert.equal(calls, 1)
  })

  it('peek 不追踪依赖', () => {
    const s = signal(0)
    let calls = 0
    effect(() => {
      s.peek()  // 不追踪
      calls++
    })
    calls = 0
    s.value = 1   // effect 不触发
    assert.equal(calls, 0)
  })

  it('peek 返回当前值', () => {
    const s = signal(42)
    assert.equal(s.peek(), 42)
    s.value = 100
    assert.equal(s.peek(), 100)
  })

  it('isSignal 正确识别', () => {
    assert.equal(isSignal(signal(0)), true)
    assert.equal(isSignal(computed(() => 1)), true)
    assert.equal(isSignal(42), false)
    assert.equal(isSignal('hello'), false)
    assert.equal(isSignal(null), false)
    assert.equal(isSignal(undefined), false)
    assert.equal(isSignal({}), false)
  })
})

// ═════════════════════════════════════════════════════════════
// Computed 惰性求值
// ═════════════════════════════════════════════════════════════

describe('computed 惰性求值', () => {
  it('首次求值建立依赖，后续脏时惰性', () => {
    const a = signal(1)
    let evalCalls = 0
    const c = computed(() => { evalCalls++; return a.value * 2 })
    // 构造函数中首次求值以建立依赖追踪
    assert.equal(evalCalls, 1)

    assert.equal(c.value, 2)  // 命中缓存
    assert.equal(evalCalls, 1)

    // 依赖变化后无人读取时不重新求值
    a.value = 5
    assert.equal(evalCalls, 1)

    // 读取时重新求值
    assert.equal(c.value, 10)
    assert.equal(evalCalls, 2)
  })

  it('依赖变化后无人读取时不求值', () => {
    const a = signal(1)
    let evalCalls = 0
    const c = computed(() => { evalCalls++; return a.value * 2 })

    c.value  // 首次，evalCalls=1
    evalCalls = 0

    a.value = 5  // 标记脏，但无人读
    assert.equal(evalCalls, 0)  // 不应求值
  })

  it('依赖变化后读取时重新求值', () => {
    const a = signal(1)
    const c = computed(() => a.value * 2)

    assert.equal(c.value, 2)  // 首次
    a.value = 5
    assert.equal(c.value, 10)  // 重新求值
  })

  it('链式 computed 仅叶子求值', () => {
    const a = signal(2)
    let aCalls = 0, bCalls = 0, cCalls = 0

    const b = computed(() => { aCalls++; return a.value * 3 })
    const c = computed(() => { bCalls++; return b.value + 1 })
    const d = computed(() => { cCalls++; return c.value })

    // 读取 d → 触发 c → 触发 b
    assert.equal(d.value, 7)
    assert.equal(aCalls, 1)
    assert.equal(bCalls, 1)
    assert.equal(cCalls, 1)

    // a 变化
    a.value = 4
    // 无人读 b/c/d → 都不求值
    assert.equal(aCalls, 1)

    // 读取 d → 触发 c → 触发 b
    assert.equal(d.value, 13)
    assert.equal(aCalls, 2)
    assert.equal(bCalls, 2)
    assert.equal(cCalls, 2)
  })

  it('在 effect 中追踪', () => {
    const a = signal(3)
    const b = computed(() => a.value * 2)

    let result = 0
    effect(() => { result = b.value })

    assert.equal(result, 6)
    a.value = 10
    assert.equal(result, 20)
  })

  it('computed 的依赖变化时 effect 触发', () => {
    const a = signal(1)
    const c = computed(() => a.value > 5)
    let lastVal = false
    let effectCalls = 0

    effect(() => {
      effectCalls++
      lastVal = c.value
    })

    assert.equal(lastVal, false)
    assert.equal(effectCalls, 1)

    a.value = 10  // c 变为 true
    assert.equal(lastVal, true)
    assert.equal(effectCalls, 2)
  })

  it('computed 在 effect dispose 后不响应', () => {
    const a = signal(1)
    const c = computed(() => a.value * 2)

    let result = 0
    const dispose = effect(() => { result = c.value })
    dispose()

    a.value = 100
    assert.equal(result, 2)  // effect 不再追踪
  })

  it('链式 computed 中间值无人读时不求值', () => {
    const a = signal(5)
    let bCalls = 0, cCalls = 0

    const b = computed(() => { bCalls++; return a.value * 10 })
    const c = computed(() => { cCalls++; return b.value + 1 })

    // 读取 c → b 被隐式读取 → 但只有 c 被 effect 追踪
    effect(() => { c.value })

    assert.equal(bCalls, 1)
    assert.equal(cCalls, 1)

    a.value = 10  // b 脏→c 脏
    assert.equal(bCalls, 2)  // b 被重新求值（因为 c 读它）
    assert.equal(cCalls, 2)  // c 重新求值
  })
})

// ═════════════════════════════════════════════════════════════
// Computed edge cases
// ═════════════════════════════════════════════════════════════

describe('computed edge cases', () => {
  it('返回 undefined', () => {
    const c = computed(() => undefined)
    assert.equal(c.value, undefined)
  })

  it('返回 null', () => {
    const c = computed(() => null)
    assert.equal(c.value, null)
  })

  it('依赖 undefined signal', () => {
    const s = signal(undefined)
    const c = computed(() => s.value)
    assert.equal(c.value, undefined)

    s.value = 42
    assert.equal(c.value, 42)
  })

  it('动态依赖追踪（条件分支）', () => {
    const toggle = signal(true)
    const a = signal(10)
    const b = signal(20)
    let evalCalls = 0

    const c = computed(() => {
      evalCalls++
      return toggle.value ? a.value : b.value
    })

    assert.equal(c.value, 10)
    assert.equal(evalCalls, 1)

    // toggle 变化 → c 的依赖切换
    toggle.value = false
    assert.equal(c.value, 20)
    assert.equal(evalCalls, 2)

    // a 变化但 toggle 为 false → c 不重新求值
    a.value = 100
    assert.equal(evalCalls, 2)

    // b 变化 → c 重新求值
    b.value = 200
    assert.equal(c.value, 200)
    assert.equal(evalCalls, 3)
  })

  it('computed peek 在脏时重新求值', () => {
    const a = signal(5)
    const c = computed(() => a.value * 2)
    assert.equal(c.peek(), 10)  // 首次
    a.value = 10  // 脏了
    assert.equal(c.peek(), 20)  // peek 在脏时重新求值
  })

  it('computed readonly — set 无效', () => {
    const a = signal(1)
    const c = computed(() => a.value * 2)

    c.value = 100  // 不应生效
    assert.equal(c.value, 2)  // 仍是求值结果

    a.value = 5
    assert.equal(c.value, 10)  // 正常求值
  })
})

// ═════════════════════════════════════════════════════════════
// 循环依赖检测
// ═════════════════════════════════════════════════════════════

describe('循环依赖检测', () => {
  it('effect 修改自身追踪的 signal 报错', () => {
    const s = signal(0)
    assert.throws(() => {
      effect(() => { s.value = s.value + 1 })
    }, /循环依赖/)
  })

  it('computed 间接形成环报错', () => {
    const a = signal(1)
    const b = computed(() => a.value + 1)
    const c = computed(() => b.value + 1)
    // c → b → a，无环
    assert.equal(c.value, 3)

    // 形成环：d → e 且 e → d
    const d = signal(1)
    const e = computed(() => d.value + 1)
    // 修改 d 的 setter 引用 e → 环
    assert.throws(() => {
      effect(() => { d.value = e.value })  // d→e→d 环
    }, /循环依赖/)
  })

  it('正常 effect 嵌套不报错', () => {
    const a = signal(1)
    const b = signal(2)

    // 深度嵌套但不形成环
    let depth = 0
    effect(() => {
      if (a.value > 10) return
      depth++
      effect(() => {
        if (b.value > 10) return
      })
    })
    assert.equal(depth, 1)
  })
})

// ═════════════════════════════════════════════════════════════
// batch 异常恢复
// ═════════════════════════════════════════════════════════════

describe('batch 异常恢复', () => {
  it('batch 中 throw 后 _batchDepth 重置', () => {
    const a = signal(1)
    try {
      batch(() => {
        a.value = 2
        throw new Error('测试错误')
      })
    } catch {}
    // _batchDepth 应恢复为 0
    let calls = 0
    effect(() => { calls++; a.value; })
    assert.equal(calls, 1)
  })

  it('batch 嵌套 throw 后能继续使用', () => {
    const a = signal(1)
    try {
      batch(() => {
        throw new Error('错误')
      })
    } catch {}

    // batch 还能用
    batch(() => {
      a.value = 10
      a.value = 20
    })
    assert.equal(a.value, 20)
  })
})

// ═════════════════════════════════════════════════════════════
// isSignal 与类型检测
// ═════════════════════════════════════════════════════════════

describe('isSignal', () => {
  it('识别 Signal', () => {
    assert.equal(isSignal(signal(0)), true)
  })

  it('识别 Computed', () => {
    assert.equal(isSignal(computed(() => 1)), true)
  })

  it('排除普通值', () => {
    assert.equal(isSignal(undefined), false)
    assert.equal(isSignal(null), false)
    assert.equal(isSignal(0), false)
    assert.equal(isSignal(''), false)
    assert.equal(isSignal(false), false)
    assert.equal(isSignal({}), false)
    assert.equal(isSignal([]), false)
    assert.equal(isSignal(new Map()), false)
  })
})
