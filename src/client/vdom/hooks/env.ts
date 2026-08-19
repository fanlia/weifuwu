/**
 * vdom hooks — env（hooks 环境——per 组件实例）
 *
 * 设计（2026-12）：hooks 经 **ctx.ui 面**调用（`ctx.ui.useXXX`）——
 * instCtx.ui = createUi(env)——env 闭包绑定**当前组件实例**（compId 渲染
 * 触发/卸载注册）——无全局状态（零全局依赖——测试隔离天然）。
 *
 * requestRender = 组件级重渲染触发（当前实现：页面级 render——组件复用
 * 保持状态——组件级精准渲染为后续优化）。
 */

import type { ExternalStore } from '../store.ts'

/** hooks 环境（per 组件实例——renderComponent 注入） */
export interface HookEnv {
  /** 组件级渲染触发（store 变化/事件驱动 hooks → 重渲染） */
  requestRender(): void
  /** 卸载注册（useExternal 退订等清理） */
  onUnmount(fn: () => void): void
}

/** hooks 注入面（ctx.ui） */
export interface Ui {
  /** 共享状态订阅（store 变化 → 组件重渲染——unmount 自动退订） */
  useExternal<T>(store: ExternalStore<T>): T
}

/** 创建 ctx.ui 面（env 绑定当前组件实例） */
export function createUi(env: HookEnv): Ui {
  return {
    useExternal<T>(store: ExternalStore<T>): T {
      // 订阅——store 变化 → 组件重渲染——unmount 自动退订
      env.onUnmount(store.subscribe(() => env.requestRender()))
      return store.state
    },
  }
}
