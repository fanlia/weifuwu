/**
 * weifuwu/client signal — 响应式系统核心
 *
 * signal(value)   声明响应式数据
 * effect(fn)      自动追踪依赖，变化时重跑 fn
 * computed(fn)    衍生信号
 */

type Listener = () => void

let currentEffect: Listener | null = null
/** 追踪当前 effect 的依赖集合，用于清理旧监听器 */
let currentDeps: Set<Signal> | null = null
/** 批量更新计数器：>0 时延迟通知，直到计数器归零 */
let _batchDepth = 0
/** 批量更新中积攒的待通知 listener */
const _pendingBatch = new Set<Listener>()

export class Signal<T = unknown> {
  #value: T
  #listeners = new Set<Listener>()

  constructor(value: T) {
    this.#value = value
  }

  get value(): T {
    if (currentEffect) {
      this.#listeners.add(currentEffect)
      currentDeps?.add(this)
    }
    return this.#value
  }

  set value(v: T) {
    if (v !== this.#value) {
      this.#value = v
      if (_batchDepth > 0) {
        // 批量模式：积攒通知，不立即执行
        for (const fn of this.#listeners) _pendingBatch.add(fn)
      } else {
        const fns = [...this.#listeners]
        for (const fn of fns) fn()
      }
    }
  }

  /** @internal 移除监听器（由 effect dispose 调用） */
  _removeListener(fn: Listener) {
    this.#listeners.delete(fn)
  }
}

export function signal<T>(initial: T): Signal<T> {
  return new Signal(initial)
}

export function isSignal(value: unknown): value is Signal {
  return value instanceof Signal
}

export function effect(fn: Listener): () => void {
  const deps = new Set<Signal>()

  const run: Listener = () => {
    // 1. 取消订阅所有旧依赖
    for (const dep of deps) dep._removeListener(run)
    deps.clear()

    // 2. 重新执行 fn，重新追踪依赖
    const prevEffect = currentEffect
    const prevDeps = currentDeps
    currentEffect = run
    currentDeps = deps
    try { fn() } finally {
      currentEffect = prevEffect
      currentDeps = prevDeps
    }
  }

  // 首次执行
  run()

  // 返回 dispose 函数：取消所有订阅 + 清理依赖集
  return () => {
    for (const dep of deps) dep._removeListener(run)
    deps.clear()
  }
}

export function computed<T>(fn: () => T): Signal<T> {
  // 先计算初始值（不追踪依赖），Signal 创建时就有正确类型
  const s = signal(fn())
  // effect 追踪后续依赖变化
  effect(() => { s.value = fn() })
  return s
}

/**
 * 批量更新 — 合并多个信号写入为一次通知。
 *
 * 当多个信号需要在同一逻辑步骤中更新时，用 batch() 包裹：
 * 所有信号写入积攒到队列，batch 结束时统一触发一次 effect。
 *
 * ```ts
 * batch(() => {
 *   firstName.value = 'Alice'
 *   lastName.value = 'Bob'
 *   age.value = 30
 * })
 * // 只触发一次 effect 运行，而非三次
 * ```
 */
export function batch(fn: () => void): void {
  _batchDepth++
  try {
    fn()
  } finally {
    _batchDepth--
    if (_batchDepth === 0 && _pendingBatch.size > 0) {
      const fns = [..._pendingBatch]
      _pendingBatch.clear()
      for (const fn of fns) fn()
    }
  }
}
