/**
 * vdom hooks — useSignal（局部状态原语——setter 自动重渲染）
 *
 * 设计（2027-09——分层抽象 W1）：组件层 260 处手动 `ctx.render()` 实证——
 * 状态变更必须手动触发渲染（忘了 = 界面不动——`setter` 自动重渲染消灭
 * 该类 bug）。心智对齐主流（useState 半同构）但保持 getter 纪律：
 * `get()` 任意位置读最新（getter 规则同 useMedia/useBreakpoint——
 * mount 闭包持有永远最新）。
 *
 * 形态：`useSignal(init) → { get, set }`
 * - set(v)：v 为值或函数（(prev) => next——函数式更新）
 * - set 自动 requestRender（组件重渲染——get 读到新值）
 * - 跨渲染保持（hook 状态缓存——mount 闭包同先例）
 * - **语义**：signal 是**增量原语**（不取代 ctx.render() 的既有用法——
 *   新组件/维护组件推荐；存量保留）
 */
import type { HookEnv } from './env.ts'

export interface SignalHandle<T> {
  /** 读最新（任意位置——getter 纪律） */
  get(): T
  /** 写（值或函数式更新）——自动重渲染 */
  set(v: T | ((prev: T) => T)): void
}

/** 局部状态原语（mount 期调用一次——hook 状态缓存保持） */
export function useSignal<T>(env: HookEnv, init: T): SignalHandle<T> {
  const idx = env.nextHookIndex()
  let st = env.getHookState<{ v: T }>(idx)
  if (st === undefined) {
    st = { v: init }
    env.setHookState(idx, st)
  }
  return {
    get: () => st!.v,
    set: (v) => {
      st!.v = typeof v === 'function' ? (v as (prev: T) => T)(st!.v) : v
      env.requestRender()
    },
  }
}
