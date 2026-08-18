/**
 * vdom3 ui — ctx.ui 兼容面（vdom4 UI-3：createHookEnv 引擎无关实现——V3Ui 形状保持）
 *
 * 组件库零改动：V3Ui 的 useXXX 转发 hooks（签名 useXXX(env, ...)——env 是新形状）；
 * render(ids) 语义补全：含自身 → requestRender（组件级——引擎实现：vdom3 调度）；其他 id → 语义 id 服务
 * （selfId 注册——跨组件精准渲染——vdom3 此前 warn 降级的能力现已实现）。
 */

import type { HookEnv } from '../contracts/hooks.ts'
import { useExternal } from '../hooks/external.ts'
import { useControlled, useControlledInput, useAsync } from '../hooks/input.ts'
import { usePresence, useStableRef, useHoverCapable, useReducedMotion, useLongPress, useTween } from '../hooks/stable.ts'
import { useOpen, usePopupPosition, usePopup } from '../hooks/popup.ts'
import { useMedia, useBreakpoint, useVisualViewport, useInView, useScrollPosition } from '../hooks/media.ts'
import { useGlobalKey, useDrag, useDragDrop } from '../hooks/events.ts'
import { useChat } from '../hooks/chat.ts'
import { createHookEnv, renderSemanticIds } from '../services/hook-env.ts'

/** 组件 ctx.ui（vdom2 兼容面——V3Ui 类型定义在 types.ts（hooks 契约继承）） */
import type { V3Ui } from './types.ts'
export type { V3Ui } from './types.ts'

/** 组装 HookEnv + ctx.ui（组件实例级——引擎注入调度；共享态在 services/hook-env） */
export function createV3Ui(compId: string, render: () => void, onUnmountCb: (fn: () => void) => void): V3Ui {
  const env: HookEnv = createHookEnv(compId, render, onUnmountCb)

  const ui: V3Ui = {
    // 实例标记（debug：ctx.ui 来源审计——双实例/compId 错位定位）
    __v3ui: true,
    __compId: compId,
    render: (ids?: string[]) => {
      // 含自身 → 组件级渲染；其他 id → 语义 id 服务（跨组件精准渲染——UI-3 补全）
      if (!ids || ids.length === 0) { env.requestRender(); return }
      const others = ids.filter((i) => i !== compId)
      if (others.length < ids.length) env.requestRender()
      if (others.length > 0) renderSemanticIds(others)
    },
    onUnmount: (fn) => {
      onUnmountCb(fn)
      return undefined
    },
    selfId: (name: string) => env.registerSemanticId(name),
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
    usePresence: (options) => usePresence(env, options),
    useLongPress: (options) => useLongPress(env, options),
    useHoverCapable: () => useHoverCapable(env),
    useVisualViewport: () => useVisualViewport(env),
    useAsync: (fetcher) => useAsync(env, fetcher),
    useChat: (options) => useChat(env, options),
  }
  return ui
}
