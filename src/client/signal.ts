/**
 * weifuwu/client signal — 响应式系统核心
 *
 * signal(value)   声明响应式数据
 * effect(fn)      自动追踪依赖，变化时重跑 fn
 * computed(fn)    衍生信号
 */

type Listener = () => void

let currentEffect: Listener | null = null

export class Signal<T = unknown> {
  #value: T
  #listeners = new Set<Listener>()

  constructor(value: T) {
    this.#value = value
  }

  get value(): T {
    if (currentEffect) this.#listeners.add(currentEffect)
    return this.#value
  }

  set value(v: T) {
    if (v !== this.#value) {
      this.#value = v
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
  const wrapper = () => {
    const prev = currentEffect
    currentEffect = wrapper
    try { fn() } finally { currentEffect = prev }
  }
  wrapper()
  return () => {}
}

export function computed<T>(fn: () => T): Signal<T> {
  const s = new Signal(undefined as T)
  effect(() => { s.value = fn() })
  return s
}
