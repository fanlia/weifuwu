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

/** 组件 ctx.ui（vdom2 兼容面）——组件库零改动运行 */
export interface V3Ui {
  render(ids?: string[]): void
  onUnmount(fn: () => void): (() => void) | undefined
  selfId(name: string): void
  useExternal(store: any): any
  useControlled(options: any): any
  useControlledInput(options: any): any
  useOpen(options: any): any
  usePopup(options: any): any
  usePopupPosition(options: any): any
  useTween(target: number, opts?: any): any
  useInView(options?: any): any
  useScrollPosition(options?: any): any
  useGlobalKey(handler: (e: KeyboardEvent) => void): () => void
  useDrag(options?: any): any
  useDragDrop(options?: any): any
  useMedia(query: string, callback: (matches: boolean) => void): void
  useBreakpoint(bps: any, callback?: any): void
  useReducedMotion(): boolean
  useStableRef(init: any, cleanup?: any): any
  useAnimationEnd(cb: any, opts?: any): any
  usePresence(options?: any): any
  useLongPress(options?: any): any
  useHoverCapable(): boolean
  useVisualViewport(): any
  useAsync(fetcher: any): any
  useChat(options: any): any
  [key: string]: any
}

/** 组装 HookEnv + ctx.ui（组件实例级——id 绑定） */
export function createV3Ui(compId: string, render: () => void, onUnmountCb: (fn: () => void) => void): V3Ui {
  const warned = new Set<string>()
  const uncontrolledValues = new Map<string, any>()
  const inputStates = new Map<string, { keyword: string; selectedLabel: string }>()
  const openStates = new Map<string, boolean>()

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
    mediaRegistry: new Map(),
    popupTrackers: new Map(),
    scrollTrackers: new Map(),
    isMounting: () => false,
    warned,
    uncontrolledValues,
    inputStates,
    openStates,
    ensurePopupListeners: () => { /* popup 全局监听——阶段 2 usePopup 时实现 */ },
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
    useExternal: (store: any) => useExternal(env, store),
    useControlled: (options: any) => useControlled(env, options),
    useControlledInput: (options: any) => useControlledInput(env, options),
    useOpen: (options: any) => useOpen(env, options),
    usePopup: (options: any) => usePopup(env, options),
    usePopupPosition: (options: any) => usePopupPosition(env, options),
    useTween: (target: number, opts?: any) => useTween(env, target, opts),
    useInView: (options?: any) => useInView(env, options),
    useScrollPosition: (options?: any) => useScrollPosition(env, options),
    useGlobalKey: (handler: (e: KeyboardEvent) => void) => useGlobalKey(env, handler),
    useDrag: (options?: any) => useDrag(env, options),
    useDragDrop: (options?: any) => useDragDrop(env, options),
    useMedia: (query: string, cb: (m: boolean) => void) => { useMedia(env, query, cb) },
    useBreakpoint: (bps: any, cb?: any) => { useBreakpoint(env, bps, cb) },
    useReducedMotion: () => useReducedMotion(env),
    useStableRef: (init: any, cleanup?: any) => useStableRef(env, init, cleanup),
    useAnimationEnd: (cb: any, opts?: any) => useAnimationEnd(env, cb, opts),
    usePresence: (options?: any) => usePresence(env, options),
    useLongPress: (options?: any) => useLongPress(env, options),
    useHoverCapable: () => useHoverCapable(env),
    useVisualViewport: () => useVisualViewport(env),
    useAsync: (fetcher: any) => useAsync(env, fetcher),
    useChat: (options: any) => useChat(env, options),
  }
  return ui
}
