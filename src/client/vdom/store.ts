/**
 * vdom store — createStore（共享状态原语——跨组件状态）
 *
 * 设计（设计规则 §4.5——render-only 无响应式引擎）：
 * - state = 普通对象（**非 Proxy**——无 set trap 无隐式 dirty）
 * - set(partial) 合并写 + notify；update(fn) 可变写 + notify；notify() 手动
 * - subscribe(cb) → 退订函数（useExternal 订阅——unmount 自动退订）
 * - **触发渲染**：订阅方（useExternal——store 变化 → 组件重渲染）——
 *   写者不直接渲染（高频 notify 由写者控制频率）
 */

export interface ExternalStore<T> {
  /** 当前状态（普通对象——getter 读最新——非快照） */
  readonly state: T
  /** 订阅（变化通知——返回退订函数） */
  subscribe(cb: () => void): () => void
  /** 合并写（partial → {...state, ...partial}）+ notify */
  set(partial: Partial<T>): void
  /** 可变写（fn 原地改 state）+ notify */
  update(fn: (state: T) => void): void
  /** 手动通知（高频场景由写者控制频率） */
  notify(): void
}

export function createStore<T>(init: T): ExternalStore<T> {
  const subs = new Set<() => void>()
  let state = init

  const notify = (): void => {
    for (const cb of [...subs]) cb()
  }

  return {
    get state(): T {
      return state
    },
    subscribe(cb: () => void): () => void {
      subs.add(cb)
      return () => { subs.delete(cb) }
    },
    set(partial: Partial<T>): void {
      state = { ...state, ...partial }
      notify()
    },
    update(fn: (state: T) => void): void {
      fn(state)
      notify()
    },
    notify,
  }
}
