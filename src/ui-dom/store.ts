/**
 * createStore — 共享状态工厂（render-only 方案，见 design 归档）
 *
 * state 是**普通对象（非 Proxy）**——渲染是显式 render()，状态只是数据，
 * 无响应式引擎（无深度代理/Set/Map 绑定/isMounting 保护——§6.4 整节不需要）。
 *
 * 订阅：任何状态变化 → notify() → 所有订阅者（useExternal 注册的组件）重渲染。
 * 作用域由创建位置决定：模块级（全局共享）/ 组件工厂（局部共享）/ ctx 注入（请求级）。
 */

/** 可订阅状态契约（结构化类型——任何带 state+subscribe 的对象都可被 useExternal 订阅） */
export interface ExternalStore<T = unknown> {
  /** 渲染期读最新值（普通对象，读什么就是什么） */
  state: T
  /** 订阅状态变化（返回退订） */
  subscribe(cb: () => void): () => void
  /** 合并赋值（自动通知订阅者）——推荐写路径 */
  set(partial: Partial<T>): void
  /** 函数式变更（自动通知订阅者）——推荐写路径（如 push） */
  update(fn: (s: T) => void): void
  /** 手动通知（逃生口：直接改 state 后调用） */
  notify(): void
}

/** 创建共享状态（state 普通对象 + 订阅表 + 写路径） */
export function createStore<T extends object>(init: T): ExternalStore<T> {
  const state: T = { ...init }
  const subs = new Set<() => void>()
  const notify = () => {
    for (const cb of [...subs]) cb()
  }
  return {
    state,
    subscribe(cb) {
      subs.add(cb)
      return () => {
        subs.delete(cb)
      }
    },
    set(partial) {
      Object.assign(state, partial)
      notify()
    },
    update(fn) {
      fn(state)
      notify()
    },
    notify,
  }
}
