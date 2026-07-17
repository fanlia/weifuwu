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
      const fns = [...this.#listeners]
      for (const fn of fns) fn()
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
