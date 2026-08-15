/**
 * vdom3 signal — 细粒度响应式原语
 *
 * 状态是唯一事实源：signal 变化 → 订阅者（effect/绑定）触发更新。
 * 值相同不触发（防无意义指令）；effect 内读取自动订阅（依赖追踪）。
 */

import type { Signal } from './types.ts'
import { emitSignal } from './events.ts'

/** 当前 effect 上下文栈（依赖追踪——effect 内 signal() 读取自动订阅） */
interface EffectCtx { deps: Set<Signal<any>> }
const effectStack: EffectCtx[] = []

let uid = 0

export function signal<T>(initial: T, name = ''): Signal<T> {
  let value = initial
  const subs = new Set<(v: T, p: T) => void>()
  const id = name || `sig${++uid}`
  const s: Signal<T> = Object.assign(
    function read(this: unknown): T {
      const top = effectStack[effectStack.length - 1]
      if (top) top.deps.add(s) // 依赖追踪
      return value
    },
    {
      get value() { return value },
      set value(v: T) { s.set(v) },
      set(next: T): void {
        if (Object.is(next, value)) return // 值相同不触发（防无意义指令）
        const prev = value
        value = next
        emitSignal(id, next, prev) // 事件流记录（可回放）
        for (const cb of [...subs]) cb(next, prev)
      },
      update(fn: (p: T) => T): void { s.set(fn(value)) },
      subscribe(cb: (v: T, p: T) => void): () => void {
        subs.add(cb)
        return () => { subs.delete(cb) }
      },
    },
  )
  return s
}

/** 派生状态（computed——依赖 signal 自动追踪，变化时重算） */
export function computed<T>(fn: () => T): Signal<T> {
  const s = signal<T>(undefined as T, 'computed')
  effect(() => { s.set(fn()) }) // effect 追踪 fn 内依赖——变化 → 重算
  return s
}

/**
 * 副作用（signal 变化 → 自动重跑——渲染绑定/指令生成入口）。
 * 依赖收集：execute 时读取的 signal 自动加入依赖——变化重跑并重新收集。
 */
export function effect(fn: () => void | (() => void)): () => void {
  let cleanup: (() => void) | undefined
  let unsubs: Array<() => void> = []
  const execute = () => {
    for (const u of unsubs) u() // 退订旧依赖
    unsubs = []
    cleanup?.()
    const ctx: EffectCtx = { deps: new Set() }
    effectStack.push(ctx)
    try {
      const r = fn()
      if (typeof r === 'function') cleanup = r as () => void
    } finally {
      effectStack.pop()
    }
    // 订阅本轮依赖（变化 → 重跑）
    for (const d of ctx.deps) {
      unsubs.push(d.subscribe(() => execute()))
    }
  }
  execute()
  return () => { for (const u of unsubs) u() }
}

/** 在依赖追踪下执行（内部使用） */
export function track<T>(fn: () => T): T {
  const ctx: EffectCtx = { deps: new Set() }
  effectStack.push(ctx)
  try { return fn() } finally { effectStack.pop() }
}
