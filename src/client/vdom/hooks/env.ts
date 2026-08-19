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
import { useStableRef, useOpen, useGlobalKey } from './basic.ts'
import { usePopup } from './popup.ts'

/** hooks 环境（per 组件实例——renderComponent 注入） */
export interface HookEnv {
  /** 组件级渲染触发（store 变化/事件驱动 hooks → 重渲染） */
  requestRender(): void
  /** 卸载注册（useExternal 退订等清理） */
  onUnmount(fn: () => void): void
  /** 浏览器环境（全局监听等——零全局直接访问） */
  getBrowser(): import('../browser/Browser.ts').Browser | null
  /** hook 状态缓存（渲染期调用——按调用顺序 index——per-instance） */
  nextHookIndex(): number
  getHookState<T>(idx: number): T | undefined
  setHookState<T>(idx: number, v: T): void
}

/** hooks 注入面（ctx.ui） */
export interface Ui {
  /** 共享状态订阅（store 变化 → 组件重渲染——unmount 自动退订） */
  useExternal<T>(store: ExternalStore<T>): T
  /** 稳定引用容器（跨渲染保持——hooks 内部传递） */
  useStableRef<T>(initial: T): import('./basic.ts').StableRef<T>
  /** 受控/非受控开关（受控缺回调 warn——静默不可用防护） */
  useOpen(init: boolean, controlled?: { open?: boolean; onOpenChange?: (v: boolean) => void }): import('./basic.ts').OpenState
  /** 全局键盘监听（Escape 关闭等——unmount 自动清理） */
  useGlobalKey(match: string | ((e: KeyboardEvent) => boolean), handler: (e: KeyboardEvent) => void): void
  /** 浮层弹窗（portal/定位/外部点击/Escape——28 浮层组件核心依赖） */
  usePopup(opts: import('./popup.ts').PopupOptions): import('./popup.ts').Popup
}

/** 创建 ctx.ui 面（env 绑定当前组件实例） */
export function createUi(env: HookEnv): Ui {
  return {
    useExternal<T>(store: ExternalStore<T>): T {
      // 订阅——store 变化 → 组件重渲染——unmount 自动退订
      env.onUnmount(store.subscribe(() => env.requestRender()))
      return store.state
    },
    useStableRef: <T>(initial: T) => useStableRef(env, initial),
    useOpen: (init: boolean, controlled?: { open?: boolean; onOpenChange?: (v: boolean) => void }) =>
      useOpen(env, init, controlled),
    useGlobalKey: (match: string | ((e: KeyboardEvent) => boolean), handler: (e: KeyboardEvent) => void) =>
      useGlobalKey(env, match, handler),
    usePopup: (opts) => usePopup(env, opts),
  }
}
