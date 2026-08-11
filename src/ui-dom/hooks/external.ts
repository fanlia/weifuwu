/**
 * useExternal — 订阅共享状态（render-only 共享原语，见 design/render-only-plan.md）
 *
 * 与 useInView/useScrollPosition 同构（mount 阶段注册，生命周期框架管）：
 * - mount 注册：订阅 store（任何变化 → 自身重渲染）
 * - unmount 自动退订（onComponentUnmountFor——无手动退订纪律，无 §4.6 __watch 泄漏）
 * - 返回 store 本身（活引用）——渲染函数里读最新值：
 *     createStore 产物 → store.state.xxx
 *     useChat handle  → handle.messages（handle 就是活 state）
 *
 * 参数契约：任何「可订阅状态」——{ subscribe(cb): unsub } 即可（结构化类型）。
 * SSR 无害：createSsrUi 的 useExternal shim 只返回 store 不订阅。
 */

import type { HookEnv } from './types.ts'

/** 可订阅状态（useExternal 入参——结构化类型，不要求专用 store） */
export interface Subscribable {
  subscribe(cb: () => void): () => void
  [key: string]: any
}

export function useExternal(env: HookEnv, store: Subscribable): Subscribable {
  const id = env.selfId()
  let unsub: (() => void) | undefined
  if (id) {
    unsub = store.subscribe(() => env.render([id]))
    env.onUnmount(() => unsub?.())
  }
  return store
}
