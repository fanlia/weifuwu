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

  /**
   * 可变更新 — 原地修改信号值并触发通知。
   *
   * 适用于数组/对象等引用类型：无需创建新引用即可触发更新。
   *
   * ```ts
   * const items = signal([1, 2, 3])
   * items.mutate(arr => arr.push(4))  // 数组原地修改
   * // items.value === [1, 2, 3, 4]
   * ```
   */
  mutate(fn: (value: T) => void): void {
    fn(this.#value)
    if (_batchDepth > 0) {
      for (const fn of this.#listeners) _pendingBatch.add(fn)
    } else {
      const fns = [...this.#listeners]
      for (const fn of fns) fn()
    }
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

/**
 * 不追踪依赖地读取信号值。
 *
 * 在 effect 中调用 untrack() 读取的信号变化不会触发 effect 重跑。
 * 适用于读取「一次性」或「不关心变化」的信号。
 *
 * ```ts
 * effect(() => {
 *   console.log(count.value)          // 追踪 count
 *   console.log(untrack(() => theme.value))  // 不追踪 theme
 * })
 * // count 变化 → effect 重跑
 * // theme 变化 → 不触发
 * ```
 */
export function untrack<T>(fn: () => T): T {
  const prevEffect = currentEffect
  const prevDeps = currentDeps
  currentEffect = null
  currentDeps = null
  try {
    return fn()
  } finally {
    currentEffect = prevEffect
    currentDeps = prevDeps
  }
}

// ── 响应式数组 ──────────────────────────────────────────────

/**
 * 响应式数组 — 提供便捷的可变数组方法。
 *
 * 所有方法内部调用 mutate() 在修改后触发通知。
 *
 * ```ts
 * const items = reactiveArray([1, 2, 3])
 *
 * items.push(4)        // [1, 2, 3, 4]
 * items.pop()          // [1, 2, 3]
 * items.unshift(0)     // [0, 1, 2, 3]
 * items.remove(1)      // [0, 2, 3]
 * items.sort()         // [0, 2, 3]
 * items.clear()        // []
 * items.replace([7,8]) // [7, 8]
 * ```
 */
export type ReactiveArray<T> = Signal<T[]> & {
  push(...items: T[]): void
  pop(): void
  shift(): void
  unshift(...items: T[]): void
  /** 按索引移除元素 */
  remove(index: number): void
  /** 全量替换 */
  replace(items: T[]): void
  /** 清空 */
  clear(): void
  sort(compareFn?: (a: T, b: T) => number): void
  reverse(): void
}

/**
 * 创建响应式数组。
 * 返回的 ReactiveArray 拥有便捷的可变方法。
 */
export function reactiveArray<T>(initial: T[] = []): ReactiveArray<T> {
  const sig = new Signal(initial)
  const methods = {
    push(...items: T[]) { sig.mutate(arr => arr.push(...items)) },
    pop() { sig.mutate(arr => arr.pop()) },
    shift() { sig.mutate(arr => arr.shift()) },
    unshift(...items: T[]) { sig.mutate(arr => arr.unshift(...items)) },
    remove(index: number) { sig.mutate(arr => { if (index >= 0 && index < arr.length) arr.splice(index, 1) }) },
    replace(items: T[]) { sig.mutate(arr => { arr.length = 0; arr.push(...items) }) },
    clear() { sig.mutate(arr => arr.length = 0) },
    sort(compareFn?: (a: T, b: T) => number) { sig.mutate(arr => arr.sort(compareFn)) },
    reverse() { sig.mutate(arr => arr.reverse()) },
  }
  return Object.assign(sig, methods) as ReactiveArray<T>
}
