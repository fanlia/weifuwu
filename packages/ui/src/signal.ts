/**
 * Signal system — ref, computed, effect
 *
 * Minimal reactive primitives based on the "signal" pattern.
 * ref = reactive value container
 * computed = derived value (readonly ref)
 * effect = auto-tracking side effect
 */

type EffectFn = () => void

let activeEffect: EffectFn | null = null
const effectStack: EffectFn[] = []

export class Signal<T = unknown> {
  #value: T
  #subs = new Set<EffectFn>()

  constructor(value: T) {
    this.#value = value
  }

  get value(): T {
    // Track dependency if called inside an effect
    if (activeEffect) this.#subs.add(activeEffect)
    return this.#value
  }

  set value(newVal: T) {
    if (Object.is(newVal, this.#value)) return
    this.#value = newVal
    // Notify subscribers (run in batch via microtask)
    const subs = [...this.#subs]
    for (const fn of subs) fn()
  }

  /** Internal: peek value without tracking */
  peek(): T {
    return this.#value
  }

  /** Internal: subscribe directly */
  _addSub(fn: EffectFn) {
    this.#subs.add(fn)
  }

  /** Internal: unsubscribe */
  _removeSub(fn: EffectFn) {
    this.#subs.delete(fn)
  }
}

export class Computed<T = unknown> {
  #fn: () => T
  #cache!: T
  #dirty = true
  #effect: EffectFn | null = null
  #subs = new Set<EffectFn>()

  constructor(fn: () => T) {
    this.#fn = fn
    // Create internal effect to track deps and mark dirty
    const compute = () => {
      this.#dirty = true
      const subs = [...this.#subs]
      for (const fn of subs) fn()
    }
    this.#effect = compute
  }

  get value(): T {
    if (activeEffect) this.#subs.add(activeEffect)
    if (this.#dirty) {
      this.#dirty = false
      // Run fn with dependency tracking
      const prev = activeEffect
      activeEffect = this.#effect
      this.#cache = this.#fn()
      activeEffect = prev
    }
    return this.#cache
  }

  peek(): T {
    if (this.#dirty) {
      this.#dirty = false
      this.#cache = this.#fn()
    }
    return this.#cache
  }
}

/**
 * Create a reactive reference.
 */
export function ref<T>(initial: T): Signal<T> {
  return new Signal(initial)
}

/**
 * Create a derived reactive value.
 * Re-evaluates when any dependency changes.
 */
export function computed<T>(fn: () => T): Computed<T> {
  return new Computed(fn)
}

/**
 * Run a function and automatically re-run when any Signal read inside it changes.
 * Returns a cleanup function.
 */
export function effect(fn: () => (() => void) | void): () => void {
  let cleanup: (() => void) | void

  const run: EffectFn = () => {
    // Run previous cleanup
    if (cleanup) cleanup()

    const prev = activeEffect
    activeEffect = run
    cleanup = fn()
    activeEffect = prev
  }

  run()
  return () => {
    if (cleanup) cleanup()
    // Can't easily unsubscribe from all signals without tracking them
    // For now, we just run cleanup
  }
}
