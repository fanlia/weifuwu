/**
 * Signal system — ref, computed, effect
 *
 * ref = reactive value container
 * computed = derived value (readonly ref, subscribable)
 * effect = auto-tracking side effect with proper cleanup
 */

type EffectFn = () => void

let activeEffect: EffectFn | null = null

// Track which signals each effect subscribes to (for cleanup)
const effectSubs = new WeakMap<EffectFn, Set<Signal | Computed>>()

export class Signal<T = unknown> {
  #value: T
  #subs = new Set<EffectFn>()

  constructor(value: T) {
    this.#value = value
  }

  get value(): T {
    if (activeEffect) {
      this.#subs.add(activeEffect)
      // Track subscription for effect cleanup
      let subs = effectSubs.get(activeEffect)
      if (!subs) {
        subs = new Set()
        effectSubs.set(activeEffect, subs)
      }
      subs.add(this)
    }
    return this.#value
  }

  set value(newVal: T) {
    if (Object.is(newVal, this.#value)) return
    this.#value = newVal
    const subs = [...this.#subs]
    for (const fn of subs) fn()
  }

  peek(): T {
    return this.#value
  }

  _addSub(fn: EffectFn) {
    this.#subs.add(fn)
  }

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
    const notify = () => {
      this.#dirty = true
      const subs = [...this.#subs]
      for (const fn of subs) fn()
    }
    this.#effect = notify
  }

  get value(): T {
    if (activeEffect) {
      this.#subs.add(activeEffect)
      let subs = effectSubs.get(activeEffect)
      if (!subs) {
        subs = new Set()
        effectSubs.set(activeEffect, subs)
      }
      subs.add(this)
    }
    if (this.#dirty) {
      this.#dirty = false
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

  _addSub(fn: EffectFn) {
    this.#subs.add(fn)
  }

  _removeSub(fn: EffectFn) {
    this.#subs.delete(fn)
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
 * Supports _addSub / _removeSub for direct subscription.
 */
export function computed<T>(fn: () => T): Computed<T> {
  return new Computed(fn)
}

/**
 * Run a function and automatically re-run when any Signal read inside it changes.
 *
 * Tracks all Signal/Computed dependencies and unsubscribes on cleanup.
 * Returns a dispose function that:
 * 1. Runs the effect's cleanup callback
 * 2. Unsubscribes from all tracked Signal/Computed dependencies
 */
export function effect(fn: () => (() => void) | void): () => void {
  let cleanup: (() => void) | void
  let oldSubs = new Set<Signal | Computed>()

  const run: EffectFn = () => {
    // Run previous cleanup
    if (cleanup) cleanup()

    // Unsubscribe from old tracked signals
    for (const sig of oldSubs) {
      sig._removeSub(run)
    }
    oldSubs.clear()

    // Clear previous effect tracking
    effectSubs.delete(run)

    // Run with dependency tracking
    const prev = activeEffect
    activeEffect = run
    cleanup = fn()
    activeEffect = prev

    // Capture new subscriptions
    const newSubs = effectSubs.get(run)
    if (newSubs) {
      oldSubs = newSubs
    }
  }

  run()

  return () => {
    if (cleanup) cleanup()
    // Unsubscribe from all tracked signals
    for (const sig of oldSubs) {
      sig._removeSub(run)
    }
    effectSubs.delete(run)
  }
}
