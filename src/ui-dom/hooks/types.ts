/**
 * hooks/types — Hook 运行时上下文（HookEnv）
 *
 * hooks 重构：所有 `ctx.ui.useXXX` 的实现从 createUi 移到 src/ui-dom/hooks/，
 * 签名统一为 `useXXX(env, ...args)`——显式接收 HookEnv（封装 ui 内部能力），
 * 不再依赖 `this`（ui 对象）与 createUi 闭包。
 *
 * ui.ts 的 createUi 组装 env + 薄转发（ctx.ui.useXXX 兼容组件库，实现已在 hooks/）。
 */

import type { BrowserEnv } from '../types.ts'

/** 媒体查询注册表项（跨组件共享——useMedia/useBreakpoint 按 key 去重注册） */
export interface MediaRegistryItem {
  mql?: MediaQueryList
  handler?: (e: MediaQueryListEvent) => void
  mqls?: Array<{ mql: MediaQueryList; handler: () => void }>
}

/** popup 定位 tracker（跨组件共享——全局 scroll/resize 监听重算） */
export interface PopupTracker {
  pos: { top: number; left: number }
  getEl: () => HTMLElement | null
  isOpen: () => boolean
  compute: (rect: DOMRect) => { top: number; left: number; width?: number }
  panel?: () => HTMLElement | null
  margin?: number
}

/** scroll tracker（跨组件共享——useScrollPosition） */
export interface ScrollTracker {
  handle: { y: number }
  getScroller: () => HTMLElement | Window
}

export interface HookEnv {
  /** 当前组件 id（ui._selfId / _selfVNode._id 解析） */
  selfId(): string | undefined
  /** 触发渲染（render-only 唯一触发） */
  render(ids?: string[]): void
  /** 浏览器环境（ctx.browser） */
  browser: BrowserEnv
  /** 组件卸载回调注册（hooks 清理用——onComponentUnmountFor）——返回退订函数 */
  onUnmount(fn: (id: string) => void): () => void
  /** 注册表实例（selfId 注册/查询）——结构兼容（第 1 代/vdom 均含 idRegistry） */
  registry: { idRegistry: Map<string, any> }
  /** 跨组件共享：媒体查询注册表 */
  mediaRegistry: Map<string, MediaRegistryItem>
  /** 跨组件共享：popup 定位 tracker */
  popupTrackers: Map<string, PopupTracker>
  /** 跨组件共享：scroll tracker */
  scrollTrackers: Map<string, ScrollTracker>
  /** 渲染保护期（渲染请求被跳过） */
  isMounting(): boolean
  isRendering(): boolean
  /** 受控缺回调 warn 去重（跨组件按 name 幂等） */
  warned: Set<string>
  /** useControlled 非受控内部值（按 selfId） */
  uncontrolledValues: Map<string, any>
  /** useControlledInput 内部输入态（按 selfId） */
  inputStates: Map<string, { keyword: string; selectedLabel: string }>
  /** useOpen 非受控内部打开态（按 selfId） */
  openStates: Map<string, boolean>
  /** 惰性挂载全局 scroll/resize 监听（幂等） */
  ensurePopupListeners(): void
}
