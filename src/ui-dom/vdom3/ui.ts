/**
 * vdom3 ui — ctx.ui 兼容面（hooks shim——阶段 2）
 *
 * 迁移策略 D1：vdom2 hooks 源码复用（与引擎解耦）——vdom3 实现 HookEnv
 * （12 字段）+ 薄转发 ctx.ui.useXXX——组件库零改动。
 *
 * 当前实现（最小闭环）：useExternal/useControlled/useOpen——按组件库依赖
 * 排序逐步扩展（usePopup 等引擎耦合 hooks 单独攻坚）。
 * render(ids) 语义：含自身 id → vdom3 ctx.render()（组件自身重渲染）；
 * 其他 id → vdom3 无跨组件 render（诚实 warn——后续补 registry 级 render）。
 */

import type { HookEnv } from '../hooks/types.ts'
import { useExternal } from '../hooks/external.ts'
import { useControlled, useControlledInput, useAsync } from '../hooks/input.ts'
import { usePresence, useAnimationEnd, useStableRef, useHoverCapable, useReducedMotion, useLongPress, useTween } from '../hooks/stable.ts'
import { useOpen, usePopupPosition, usePopup } from '../hooks/popup.ts'
import { useMedia, useBreakpoint, useVisualViewport, useInView, useScrollPosition } from '../hooks/media.ts'
import { useGlobalKey, useDrag, useDragDrop } from '../hooks/events.ts'
import { useChat } from '../hooks/chat.ts'
import { createClientBrowser } from '../browser.ts'

/** 组件 ctx.ui（vdom2 兼容面——V3Ui 类型定义在 types.ts（hooks 契约继承）） */
import type { V3Ui } from './types.ts'
export type { V3Ui } from './types.ts'

// ── 模块级共享状态（HookEnv 契约：mediaRegistry/popupTrackers 等跨组件共享） ──
const mediaRegistry = new Map<string, import('../hooks/types.ts').MediaRegistryItem>()
const popupTrackers = new Map<string, import('../hooks/types.ts').PopupTracker>()
const scrollTrackers = new Map<string, import('../hooks/types.ts').ScrollTracker>()
const warned = new Set<string>()
const uncontrolledValues = new Map<string, unknown>()
const inputStates = new Map<string, { keyword: string; selectedLabel: string }>()
const openStates = new Map<string, boolean>()

/** 惰性全局 scroll/resize 监听（幂等）——popup 定位跟随（usePopupPosition/usePopup 依赖） */
let popupListenersReady = false
function ensurePopupListeners(): void {
  if (popupListenersReady) return
  popupListenersReady = true
  const browser = createClientBrowser()
  const schedule = () => {
    for (const tracker of popupTrackers.values()) {
      try {
        if (tracker.isOpen()) {
          const el = tracker.getEl()
          const rect = el?.getBoundingClientRect()
          if (rect && rect.width > 0) tracker.compute(rect)
        }
      } catch { /* 定位失败隔离 */ }
    }
  }
  browser.addEventListener?.('scroll', schedule, { capture: true, passive: true } as AddEventListenerOptions)
  browser.addEventListener?.('resize', schedule)
}

/** 组装 HookEnv + ctx.ui（组件实例级——id 绑定；共享态模块级） */
export function createV3Ui(compId: string, render: () => void, onUnmountCb: (fn: () => void) => void): V3Ui {
  const env: HookEnv = {
    selfId: () => compId,
    render: (ids?: string[]) => {
      if (!ids || ids.length === 0 || ids.includes(compId)) render()
      else console.warn(`[vdom3/ui] render([${ids.join(',')}]) 跨组件渲染暂未实现（vdom3 当前仅组件自身 render）`)
    },
    browser: createClientBrowser(),
    onUnmount: (fn) => {
      onUnmountCb(() => fn(compId))
      return () => { /* 退订由卸载钩子管理 */ }
    },
    registry: { idRegistry: new Map() },
    mediaRegistry,
    popupTrackers,
    scrollTrackers,
    isMounting: () => false,
    warned,
    uncontrolledValues,
    inputStates,
    openStates,
    ensurePopupListeners,
  }

  const ui: V3Ui = {
    render: (ids?: string[]) => env.render(ids),
    onUnmount: (fn) => {
      onUnmountCb(fn)
      return undefined
    },
    selfId: (name: string) => {
      // 语义化 ID 注册（跨组件 render(['id']) 的基础——当前仅记录）
      env.registry.idRegistry.set(name, compId)
    },
    // 转发（参数/返回类型继承 V3Ui（hooks 契约）——上下文推断）
    useExternal: (store) => useExternal(env, store),
    useControlled: (options) => useControlled(env, options),
    useControlledInput: (options) => useControlledInput(env, options),
    useOpen: (options) => useOpen(env, options),
    usePopup: (options) => usePopup(env, options),
    usePopupPosition: (options) => usePopupPosition(env, options),
    useTween: (target, opts) => useTween(env, target, opts),
    useInView: (options) => useInView(env, options),
    useScrollPosition: (options) => useScrollPosition(env, options),
    useGlobalKey: (handler) => useGlobalKey(env, handler),
    useDrag: (options) => useDrag(env, options),
    useDragDrop: (options) => useDragDrop(env, options),
    useMedia: (query, cb) => { useMedia(env, query, cb) },
    useBreakpoint: (bps, cb) => { useBreakpoint(env, bps, cb) },
    useReducedMotion: () => useReducedMotion(env),
    useStableRef: (init, cleanup) => useStableRef(env, init, cleanup),
    useAnimationEnd: (cb, opts) => useAnimationEnd(env, cb, opts),
    usePresence: (options) => usePresence(env, options),
    useLongPress: (options) => useLongPress(env, options),
    useHoverCapable: () => useHoverCapable(env),
    useVisualViewport: () => useVisualViewport(env),
    useAsync: (fetcher) => useAsync(env, fetcher),
    useChat: (options) => useChat(env, options),
  }
  return ui
}
