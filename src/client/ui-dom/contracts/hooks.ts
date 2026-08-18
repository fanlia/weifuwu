/**
 * contracts/hooks — Hook 运行时上下文契约（引擎无关——vdom4 端口化 UI-3）
 *
 * hooks（useExternal/usePopup/useMedia...）只消费本接口——引擎（engines/）
 * 经 services/hook-env.ts 创建实现——v5 换引擎时本文件与 hooks 零改动。
 *
 * 与 vdom2 时代 HookEnv 的差异（UI-3 重构）：
 *  - selfId() → compId（引擎分配——恒有——无 undefined 分支）
 *  - render(ids) → requestRender()（组件级渲染请求——「跨组件 render(['id'])」
 *    语义上移为 services 的语义 id 服务——引擎只懂 compId）
 *  - registry.idRegistry → registerSemanticId（语义 id 注册——定位表在服务层）
 *  - isMounting 删除（渲染保护由调度器语义保证——无暴露面）
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

/** Hook 运行时上下文（引擎无关形状——hooks 唯一依赖） */
export interface HookEnv {
  /** 当前组件 id（引擎分配——实例唯一——恒有） */
  compId: string
  /** 渲染请求（组件级——render-only 唯一触发）——引擎无关 */
  requestRender(): void
  /** 组件卸载回调注册（hooks 清理用——返回退订函数） */
  onUnmount(fn: () => void): () => void
  /** 语义化 id 注册（render(['id']) 跨组件精准渲染的定位基础——冲突抛错） */
  registerSemanticId(name: string): void
  /** 浏览器环境（ctx.browser） */
  browser: BrowserEnv
  /** 跨组件共享：媒体查询注册表 */
  mediaRegistry: Map<string, MediaRegistryItem>
  /** 跨组件共享：popup 定位 tracker */
  popupTrackers: Map<string, PopupTracker>
  /** 跨组件共享：scroll tracker */
  scrollTrackers: Map<string, ScrollTracker>
  /** 受控缺回调 warn 去重（跨组件按 name 幂等） */
  warned: Set<string>
  /** useControlled 非受控内部值（按 compId） */
  uncontrolledValues: Map<string, any>
  /** useControlledInput 内部输入态（按 compId） */
  inputStates: Map<string, { keyword: string; selectedLabel: string }>
  /** useOpen 非受控内部打开态（按 compId） */
  openStates: Map<string, boolean>
  /** 惰性挂载全局 scroll/resize 监听（幂等） */
  ensurePopupListeners(): void
}
