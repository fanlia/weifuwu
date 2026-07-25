/**
 * weifuwu/client signal — 响应式系统核心
 *
 * signal(value)   声明响应式数据
 * effect(fn)      自动追踪依赖，变化时重跑 fn
 * computed(fn)    衍生信号（惰性求值） 
 */

type Listener = () => void

let currentEffect: Listener | null = null
/** 追踪当前 effect 的依赖集合，用于清理旧监听器 */
let currentDeps: Set<Signal> | null = null
/** 批量更新计数器：>0 时延迟通知，直到计数器归零 */
let _batchDepth = 0
/** 批量更新中积攒的待通知 listener */
const _pendingBatch = new Set<Listener>()

/** 循环依赖检测深度 */
let _effectDepth = 0
const MAX_EFFECT_DEPTH = 100

// ── Signal ────────────────────────────────────────────────────

export class Signal<T = unknown> {
  #value: T
  #listeners = new Set<Listener>()

  constructor(value: T) {
    this.#value = value
  }

  /**
   * 读取信号值。在 effect 中调用时会自动注册依赖。
   */
  get value(): T {
    if (currentEffect) {
      this.#listeners.add(currentEffect)
      currentDeps?.add(this)
    }
    return this.#value
  }

  /**
   * 写入信号值。值变化时通知所有监听器。
   * 若新值与旧值相同（===），不触发通知。
   */
  set value(v: T) {
    if (v !== this.#value) {
      this.#value = v
      this.#notify()
    }
  }

  /**
   * 不追踪依赖地读取信号值。
   * 在 effect 中使用 peek() 读取的信号变化不会触发 effect 重跑。
   *
   * ```ts
   * effect(() => {
   *   console.log(count.value)    // 追踪 count
   *   console.log(count.peek())   // 不追踪
   * })
   * // count 变化时 effect 仍执行，但若 count 是唯一依赖则不重跑
   * ```
   */
  peek(): T {
    return this.#value
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
    this.#notify()
  }

  /** @internal 获取所有监听器（供子类 Computed 使用） */
  _getListeners(): Set<Listener> {
    return this.#listeners
  }

  /** 通知所有监听器 — 批量模式时积攒，否则立即执行 */
  #notify(): void {
    if (_batchDepth > 0) {
      for (const fn of this.#listeners) _pendingBatch.add(fn)
    } else {
      const fns = [...this.#listeners]
      for (const fn of fns) fn()
    }
  }
}

/**
 * 创建响应式数据容器。变化时自动通知依赖方。
 *
 * ```ts
 * const count = signal(0)
 * console.log(count.value) // 0
 * count.value = 1          // 触发依赖更新
 * ```
 */
export function signal<T>(initial: T): Signal<T> {
  return new Signal(initial)
}

/**
 * 判断值是否为 Signal 实例。
 */
export function isSignal(value: unknown): value is (Signal | Computed<any>) {
  return value instanceof Signal || value instanceof Computed
}

// ── Effect ────────────────────────────────────────────────────

/**
 * 自动追踪 signal 依赖，依赖变化时重跑回调。
 * 返回 dispose 函数用于取消订阅。
 *
 * ```ts
 * const dispose = effect(() => {
 *   console.log('count =', count.value)
 * })
 * // 立即打印当前值
 * // count.value = 1 时再次打印
 * dispose() // 停止追踪
 * ```
 */
export function effect(fn: Listener): () => void {
  const deps = new Set<Signal>()
  let disposed = false

  const run: Listener = () => {
    if (disposed) return

    // 循环依赖检测
    _effectDepth++
    if (_effectDepth > MAX_EFFECT_DEPTH) {
      _effectDepth--
      throw new Error('[weifuwu/client] 检测到循环依赖：effect → signal → effect。请检查是否在 effect 中修改了依赖的信号。')
    }

    // 1. 取消订阅所有旧依赖
    for (const dep of deps) dep._removeListener(run)
    deps.clear()

    // 2. 重新执行 fn，重新追踪依赖
    const prevEffect = currentEffect
    const prevDeps = currentDeps
    currentEffect = run
    currentDeps = deps
    try {
      fn()
    } finally {
      _effectDepth--
      currentEffect = prevEffect
      currentDeps = prevDeps
    }
  }

  // 首次执行
  run()

  // 返回 dispose 函数：取消所有订阅 + 清理依赖集
  return () => {
    if (disposed) return
    disposed = true
    for (const dep of deps) dep._removeListener(run)
    deps.clear()
  }
}

// ── Computed ──────────────────────────────────────────────────

/**
 * 基于其他 signal 的衍生值，自动缓存，惰性求值。
 *
 * ```ts
 * const a = signal(3)
 * const b = computed(() => a.value * 2)
 * console.log(b.value) // 6
 * a.value = 5
 * console.log(b.value) // 10
 * ```
 *
 * computed 只在被读取时才重新求值（惰性）。
 * 如果依赖变化但无人读取 computed，不会执行求值函数。
 *
 * Computed 继承自 Signal，可被 `isSignal()` 识别。
 * value getter 重写为：脏时重新求值，否则返回缓存值。
 */
export class Computed<T> extends Signal<T> {
  #fn: () => T
  #dirty = true
  #cached!: T
  #depsInternal = new Set<Signal>()
  #disposed = false

  constructor(fn: () => T) {
    super(undefined as unknown as T)
    this.#fn = fn
    // 首次求值 + 建立依赖追踪
    this.#evaluate()
  }

  get value(): T {
    // 在 effect 中追踪 Computed 作为依赖（通过 Signal 的 listener 机制）
    // 调用 super.value 注册依赖
    if (currentEffect) {
      super.value
    }
    // 脏时重新求值（惰性）
    if (this.#dirty) this.#evaluate()
    return this.#cached
  }

  // 重写 getter 后必须提供 setter，否则父类 setter 丢失
  // computed 是只读的，赋值无效果
  set value(_v: T) {
    // 静默忽略 — computed 是只读衍生值
  }

  /**
   * 不追踪依赖地读取计算值。
   * 不会重新求值，返回当前缓存值。
   */
  peek(): T {
    if (this.#dirty) this.#evaluate()
    return this.#cached
  }

  #evaluate() {
    if (this.#disposed) return

    // 循环依赖检测
    _effectDepth++
    if (_effectDepth > MAX_EFFECT_DEPTH) {
      _effectDepth--
      throw new Error('[weifuwu/client] 检测到循环依赖：computed → signal → computed。请检查依赖链中是否有环。')
    }

    // 清理旧依赖
    for (const dep of this.#depsInternal) dep._removeListener(this.#onDirty)
    this.#depsInternal.clear()

    // 重新求值 + 追踪新依赖
    const prevEffect = currentEffect
    const prevDeps = currentDeps
    currentEffect = this.#onDirty
    currentDeps = this.#depsInternal
    try {
      this.#cached = this.#fn()
    } finally {
      _effectDepth--
      currentEffect = prevEffect
      currentDeps = prevDeps
    }
    this.#dirty = false
  }

  #onDirty = () => {
    if (this.#disposed) return
    this.#dirty = true
    // 通知所有监听器值可能变了（监听器读取时会重新求值）
    // 必须创建快照，避免遍历中 listener 增删导致死循环
    const fns = [...this._getListeners()]
    for (const fn of fns) fn()
  }

  /** @internal 释放所有资源 */
  dispose() {
    if (this.#disposed) return
    this.#disposed = true
    for (const dep of this.#depsInternal) dep._removeListener(this.#onDirty)
    this.#depsInternal.clear()
  }

  /** @internal 当 computed 作为 effect 的依赖时被通知 */
  _removeListener(fn: Listener) {
    // 委托给 Signal 的 listener 管理
    super._removeListener(fn)
  }
}

/**
 * 创建衍生信号（惰性求值 + 自动缓存）。
 *
 * 与 Signal 不同，computed 不会在依赖变化时立即重新求值，
 * 而是在被读取时检查脏标记。如果脏，重新求值并缓存结果。
 *
 * ```ts
 * const name = signal('Alice')
 * const greeting = computed(() => \`你好，${name.value}\`)
 * console.log(greeting.value) // "你好，Alice"
 * ```
 */
export function computed<T>(fn: () => T): Computed<T> {
  return new Computed(fn)
}

// ── Batch ────────────────────────────────────────────────────

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
 *
 * 注意：batch 内部 throw 时会正常恢复 `_batchDepth` 计数器。
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

// ── Untrack ──────────────────────────────────────────────────

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
