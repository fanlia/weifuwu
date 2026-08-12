/**
 * ui-dom/context — ctx 组装层（vdom2 纯引擎之上）
 *
 * 分层（vdom2 方案）：vdom2/ = 纯渲染引擎（改 vdom 不影响其他）；
 * 本文件 = **context/hooks/中间件的组装**（改 hooks/ctx 不动 vdom 引擎）：
 * - createVdomContext：组装完整 ctx.ui（render/selfId/onUnmount/bumpCtxVersion +
 *   hooks 薄转发 + popup tracker + media registry）
 * - mountRoot：组装入口（context + vdom2 纯引擎挂载）
 *
 * hooks 实现已在 src/ui-dom/hooks/（独立模块）——此处仅组装 HookEnv + 转发。
 */

import { createRenderer, mountRoot as mountRootCore, createRegistry, type Registry, type Renderer, type MountHandle } from './vdom2/mount.ts'
import { onComponentUnmountFor } from './vdom2/registry.ts'
import { createPopupTrackerSystem } from './popup-tracker.ts'
import type { HookEnv } from './hooks/types.ts'
import { useChat, useMedia, useBreakpoint, usePopupPosition, useHoverCapable, useStableRef, useVisualViewport, usePopup, useLongPress, useInView, useScrollPosition, useAsync, useControlled, useControlledInput, useOpen, usePresence, useGlobalKey, useDrag, useDragDrop, useExternal, useReducedMotion, useAnimationEnd, useTween } from './hooks/index.ts'
import type { BrowserEnv } from './types.ts'

export interface MountOptions {
  browser: BrowserEnv
  root: HTMLElement
  registry?: Registry
  renderer?: Renderer
  onError?: (e: unknown) => void
}

export interface VdomContext {
  ctx: any
  registry: Registry
  renderer: Renderer
  rootUi: any
  destroyPopupListeners: () => void
}

/** 组装 vdom 渲染上下文（ctx.ui 完整能力 + hooks 转发 + popup tracker） */
export function createVdomContext(opts: MountOptions): VdomContext {
  const registry = opts.registry ?? createRegistry()
  const rootUi: any = {
    _selfId: '_wf_root',
    _mounting: false,
    _ctxVersion: 0,
    _rootVNodeId: null as string | null,
  }
  const ctx: any = {
    browser: opts.browser,
    __registry: registry,
  }
  // ctx.app.navigate（types.ts 已声明契约——08bc14c5 曾注入但 vdom 重构迁移时丢失：
  // agent-platform 全部 ctx.app?.navigate 静默失效 → 未登录卡 Loading / 注册不跳转）
  ctx.app = { navigate: (path: string) => opts.browser.navigate(path) }
  const renderer = opts.renderer ?? createRenderer({ registry, ctx, rootEl: opts.root, onError: opts.onError })

  // ── 弹层/滚动跟踪系统（scroll/resize 重算 → 渲染） ──
  const tracker = createPopupTrackerSystem((ids: string[]) => { for (const id of ids) renderer.render([id]) })
  // mediaRegistry 自建（useMedia/useBreakpoint 的 mql 注册表）
  const mediaRegistry = new Map<string, { mqls: Array<{ mql: MediaQueryList; handler: () => void }> }>()
  const { popupTrackers, scrollTrackers, ensurePopupListeners, destroyPopupListeners, cleanupTrackers } = tracker

  // 卸载钩子防御：hook 自身已注册清理，此处兜底清理跟踪条目
  onComponentUnmountFor(registry, (id: string) => {
    cleanupTrackers(id)
    if (popupTrackers.has(id)) popupTrackers.delete(id)
  })

  // hooks 共享内部态（跨组件按 selfId）
  const warned = new Set<string>()
  const uncontrolledValues = new Map<string, any>()
  const inputStates = new Map<string, { keyword: string; selectedLabel: string }>()
  const openStates = new Map<string, boolean>()

  // ── HookEnv 组装（hooks 实现依赖——见 hooks/types.ts） ──
  const makeEnv = (self: any): HookEnv => ({
    selfId: () => {
      const id = self?._selfVNode?._id ?? self?._selfId
      return typeof id === 'string' ? id : undefined
    },
    render: (ids) => renderer.render(ids),
    browser: opts.browser,
    onUnmount: (fn) => onComponentUnmountFor(registry, fn),
    registry,
    mediaRegistry,
    popupTrackers: popupTrackers as unknown as Map<string, import('./hooks/types.ts').PopupTracker>,
    scrollTrackers: scrollTrackers as unknown as Map<string, import('./hooks/types.ts').ScrollTracker>,
    isMounting: () => rootUi._mounting === true,
    warned,
    uncontrolledValues,
    inputStates,
    openStates,
    ensurePopupListeners,
  })

  // ── rootUi 核心原语（render-only） ──
  let warnedNoTarget = false
  rootUi.render = function (this: any, ids?: string[]): Promise<void> {
    // this = 调用者的 childCtx.ui（组件 ctx.ui.render() → this._selfId = 组件 id）
    if (ids == null) {
      const self = this._selfId !== '_wf_root' && this._selfId ? this._selfId : rootUi._rootVNodeId
      if (!self) {
        if (!warnedNoTarget) {
          warnedNoTarget = true
          console.warn('[weifuwu] render() 无参但无渲染目标：页面根是 native vnode（UIHandler 直接返回 vnode 的页面形态）。改用 async 组件形态（const Page: Component = async ... => (props) => ...）或 createStore + useExternal 共享状态。')
        }
        return Promise.resolve()
      }
      return renderer.render([self])
    }
    return renderer.render(ids)
  }
  rootUi.setMounting = (v: boolean) => { rootUi._mounting = v }
  rootUi.endMounting = () => { rootUi._mounting = false }
  rootUi.bumpCtxVersion = () => { rootUi._ctxVersion = (rootUi._ctxVersion ?? 0) + 1 }
  rootUi.selfId = function (this: any, name: string) {
    if (typeof name !== 'string' || !name) {
      throw new Error(`[weifuwu] selfId requires a non-empty string, got ${typeof name}`)
    }
    if (registry.idRegistry.has(name)) {
      throw new Error(`[weifuwu] Duplicate component ID: "${name}". Each component must have a unique custom ID.`)
    }
    const vnode = this._selfVNode
    if (!vnode) return
    vnode._customId = name
    registry.idRegistry.set(name, vnode)
  }
  rootUi.onUnmount = function (this: any, fn: () => void): (() => void) | undefined {
    const self = this?._selfVNode?._id ?? this?._selfId
    if (!self) return undefined
    return onComponentUnmountFor(registry, (id: string) => { if (id === self) fn() })
  }

  // ── hooks 薄转发（实现已在 hooks/——ctx.ui.useXXX 兼容组件库） ──
  rootUi.useChat = function (this: any, o: any) { return useChat(makeEnv(this), o) }
  rootUi.useMedia = function (this: any, q: string, cb: (m: boolean) => void) { return useMedia(makeEnv(this), q, cb) }
  rootUi.useBreakpoint = function (this: any, b1: any, cb?: any) { return useBreakpoint(makeEnv(this), b1, cb) }
  rootUi.usePopupPosition = function (this: any, o: any) { return usePopupPosition(makeEnv(this), o) }
  rootUi.useHoverCapable = function (this: any) { return useHoverCapable(makeEnv(this)) }
  rootUi.useStableRef = function (this: any, init: any, cleanup?: any) { return useStableRef(makeEnv(this), init, cleanup) }
  rootUi.useVisualViewport = function (this: any) { return useVisualViewport(makeEnv(this)) }
  rootUi.usePopup = function (this: any, o: any) { return usePopup(makeEnv(this), o) }
  rootUi.useLongPress = function (this: any, o: any) { return useLongPress(makeEnv(this), o) }
  rootUi.useInView = function (this: any, o: any) { return useInView(makeEnv(this), o) }
  rootUi.useScrollPosition = function (this: any, o: any) { return useScrollPosition(makeEnv(this), o) }
  rootUi.useAsync = function (this: any, f: () => Promise<any>) { return useAsync(makeEnv(this), f) }
  rootUi.useControlled = function (this: any, o: any) { return useControlled(makeEnv(this), o) }
  rootUi.useControlledInput = function (this: any, o: any) { return useControlledInput(makeEnv(this), o) }
  rootUi.useOpen = function (this: any, o: any) { return useOpen(makeEnv(this), o) }
  rootUi.usePresence = function (this: any, o?: any) { return usePresence(makeEnv(this), o) }
  rootUi.useGlobalKey = function (this: any, h: (e: KeyboardEvent) => void) { return useGlobalKey(makeEnv(this), h) }
  rootUi.useDrag = function (this: any, o: any) { return useDrag(makeEnv(this), o) }
  rootUi.useDragDrop = function (this: any, o: any) { return useDragDrop(makeEnv(this), o) }
  rootUi.useExternal = function (this: any, store: any) { return useExternal(makeEnv(this), store) }
  rootUi.useReducedMotion = function (this: any) { return useReducedMotion(makeEnv(this)) }
  rootUi.useAnimationEnd = function (this: any, cb: () => void, o?: { once?: boolean }) { return useAnimationEnd(makeEnv(this), cb, o) }
  rootUi.useTween = function (this: any, t: number, o?: any) { return useTween(makeEnv(this), t, o) }
  rootUi.destroyPopupListeners = destroyPopupListeners

  ;(ctx as any).ui = rootUi
  return { ctx, registry, renderer, rootUi, destroyPopupListeners }
}

/** 组装入口：createVdomContext + vdom2 纯引擎挂载 */
export function mountRoot(opts: MountOptions): MountHandle {
  const { ctx, registry, renderer } = createVdomContext(opts)
  return mountRootCore({
    root: opts.root,
    browser: opts.browser,
    ctx,
    registry,
    renderer,
    onError: opts.onError,
  })
}

// 命令式挂载（toast/notification/confirm——vdom2 引擎）
export { mountCommand, unmountCommand, createCommandContainer } from './vdom2/mount.ts'
