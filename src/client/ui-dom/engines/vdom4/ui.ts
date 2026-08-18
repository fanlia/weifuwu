/**
 * vdom4 ui — ctx.ui hooks 面（复用 services/hook-env——引擎无关契约——UI-3 资产）
 *
 * hooks（useExternal/usePopup/useMedia...）消费 contracts/hooks.ts 的 HookEnv——
 * vdom4 的 ctx.ui 经 createHookEnv 组装（注入 compId/renderComp/onUnmount——
 *  **立即渲染语义（无 schedule——2026-12 决策）**）——
 * hooks 零改动复用（组件库 192 处消费兼容——v5 换引擎 hooks 零改动）。
 */

import type { HookEnv } from '../../contracts/hooks.ts'
import { createHookEnv, renderSemanticIds } from '../../services/hook-env.ts'
import { useExternal } from '../../hooks/external.ts'
import { useControlled, useControlledInput, useAsync } from '../../hooks/input.ts'
import { usePresence, useStableRef, useHoverCapable, useReducedMotion, useLongPress, useTween } from '../../hooks/stable.ts'
import { useOpen, usePopupPosition, usePopup } from '../../hooks/popup.ts'
import { useMedia, useBreakpoint, useVisualViewport, useInView, useScrollPosition } from '../../hooks/media.ts'
import { useGlobalKey, useDrag, useDragDrop } from '../../hooks/events.ts'
import { useChat } from '../../hooks/chat.ts'

/** 去掉 HookEnv 首参（组件内调用签名） */
type WithoutEnv<F> = F extends (env: HookEnv, ...args: infer A) => infer R ? (...args: A) => R : never

/** ctx.ui 面（vdom4——hooks 转发——组件库零改动消费） */
export interface V4Ui {
  render(ids?: string[]): void
  onUnmount(fn: () => void): (() => void) | undefined
  selfId(name: string): void
  useExternal: WithoutEnv<typeof useExternal>
  useControlled: WithoutEnv<typeof useControlled>
  useControlledInput: WithoutEnv<typeof useControlledInput>
  useOpen: WithoutEnv<typeof useOpen>
  usePopup: WithoutEnv<typeof usePopup>
  usePopupPosition: WithoutEnv<typeof usePopupPosition>
  useTween: WithoutEnv<typeof useTween>
  useInView: WithoutEnv<typeof useInView>
  useScrollPosition: WithoutEnv<typeof useScrollPosition>
  useGlobalKey: WithoutEnv<typeof useGlobalKey>
  useDrag: WithoutEnv<typeof useDrag>
  useDragDrop: WithoutEnv<typeof useDragDrop>
  useMedia: WithoutEnv<typeof useMedia>
  useBreakpoint: WithoutEnv<typeof useBreakpoint>
  useReducedMotion: WithoutEnv<typeof useReducedMotion>
  useStableRef: WithoutEnv<typeof useStableRef>
  usePresence: WithoutEnv<typeof usePresence>
  useLongPress: WithoutEnv<typeof useLongPress>
  useHoverCapable: WithoutEnv<typeof useHoverCapable>
  useVisualViewport: WithoutEnv<typeof useVisualViewport>
  useAsync: WithoutEnv<typeof useAsync>
  useChat: WithoutEnv<typeof useChat>
}

/** 组装 ctx.ui（组件实例级——引擎注入调度/卸载） */
export function createV4Ui(compId: string, renderComp: () => void | Promise<void>, onUnmountCb: (fn: () => void) => void): V4Ui {
  const env: HookEnv = createHookEnv(compId, renderComp, onUnmountCb)
  // 实现宽松（TS 推断）——接口严格（组件库调用处类型检查）
  const ui = {
    render: (ids?: string[]): Promise<void> => {
      if (!ids || ids.length === 0) return Promise.resolve(env.requestRender())
      const others = ids.filter((i) => i !== compId)
      const own = others.length < ids.length ? Promise.resolve(env.requestRender()) : undefined
      if (others.length > 0) renderSemanticIds(others)
      return own ?? Promise.resolve()
    },
    onUnmount: (fn: () => void) => { onUnmountCb(fn); return undefined },
    selfId: (name: string) => env.registerSemanticId(name),
    useExternal: (store: Parameters<typeof useExternal>[1]) => useExternal(env, store),
    useControlled: (options: Parameters<typeof useControlled>[1]) => useControlled(env, options),
    useControlledInput: (options: Parameters<typeof useControlledInput>[1]) => useControlledInput(env, options),
    useOpen: (options: Parameters<typeof useOpen>[1]) => useOpen(env, options),
    usePopup: (options: Parameters<typeof usePopup>[1]) => usePopup(env, options),
    usePopupPosition: (options: Parameters<typeof usePopupPosition>[1]) => usePopupPosition(env, options),
    useTween: (target: Parameters<typeof useTween>[1], opts: Parameters<typeof useTween>[2]) => useTween(env, target, opts),
    useInView: (options: Parameters<typeof useInView>[1]) => useInView(env, options),
    useScrollPosition: (options: Parameters<typeof useScrollPosition>[1]) => useScrollPosition(env, options),
    useGlobalKey: (handler: Parameters<typeof useGlobalKey>[1]) => useGlobalKey(env, handler),
    useDrag: (options: Parameters<typeof useDrag>[1]) => useDrag(env, options),
    useDragDrop: (options: Parameters<typeof useDragDrop>[1]) => useDragDrop(env, options),
    useMedia: (query: Parameters<typeof useMedia>[1], cb: Parameters<typeof useMedia>[2]) => { useMedia(env, query, cb) },
    useBreakpoint: (bps: Parameters<typeof useBreakpoint>[1], cb: Parameters<typeof useBreakpoint>[2]) => { useBreakpoint(env, bps, cb) },
    useReducedMotion: () => useReducedMotion(env),
    useStableRef: (init: Parameters<typeof useStableRef>[1], cleanup: Parameters<typeof useStableRef>[2]) => useStableRef(env, init, cleanup),
    usePresence: (options: Parameters<typeof usePresence>[1]) => usePresence(env, options),
    useLongPress: (options: Parameters<typeof useLongPress>[1]) => useLongPress(env, options),
    useHoverCapable: () => useHoverCapable(env),
    useVisualViewport: () => useVisualViewport(env),
    useAsync: (fetcher: Parameters<typeof useAsync>[1]) => useAsync(env, fetcher),
    useChat: (options: Parameters<typeof useChat>[1]) => useChat(env, options),
  }
  return ui as unknown as V4Ui
}
