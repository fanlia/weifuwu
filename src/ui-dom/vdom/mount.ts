/**
 * vdom/mount — 挂载入口（首帧 + ctx/ui 组装）
 *
 * 渲染管线：buildVNode（async 预构建）→ renderValue（同步落地）。
 * ctx.ui：render/dirty/$/setMounting/endMounting——$ 绑定创建时的组件 id。
 */

import type { VNode, VNodeChild, Component } from '../vnode.ts'
import type { WfuiContext } from '../types.ts'
import type { BrowserEnv } from '../types.ts'
import { buildVNode } from './build.ts'
import { renderValue } from './render.ts'
import { createScheduler, type Scheduler } from './scheduler.ts'
import { createRegistry, type Registry, onComponentUnmountFor } from './registry.ts'
import { createReactiveState } from './state.ts'
import type { HookEnv } from '../hooks/types.ts'
import { createPopupTrackerSystem } from '../popup-tracker.ts'
import {
  useChat, useMedia, useBreakpoint, usePopupPosition, useHoverCapable,
  useStableRef, useVisualViewport, usePopup, useLongPress, useInView,
  useScrollPosition, useAsync, useControlled, useControlledInput, useOpen,
  usePresence, useDialog, useGlobalKey, useDrag, useDragDrop,
  useReducedMotion, useAnimationEnd, useTween,
} from '../hooks/index.ts'

export interface MountOptions {
  browser: BrowserEnv
  root: HTMLElement
  registry?: Registry
  scheduler?: Scheduler
  onError?: (e: unknown) => void
}

export interface MountHandle {
  ctx: WfuiContext
  registry: Registry
  scheduler: Scheduler
  /** 挂载根组件 */
  mount(comp: Component | VNodeChild): Promise<void>
  /** 卸载（清理 DOM） */
  unmount(): void
}

export interface VdomContext {
  ctx: WfuiContext
  registry: Registry
  scheduler: Scheduler
  rootUi: any
  destroyPopupListeners: () => void
}

/** 组装 vdom 渲染上下文（ctx/registry/scheduler/rootUi——含完整 hooks 转发） */
export function createVdomContext(opts: MountOptions): VdomContext {
  const registry = opts.registry ?? createRegistry()
  const rootUi: any = {
    _selfId: '_wf_root',
    _mounting: false,
    _rendering: false,
    _ctxVersion: 0,
  }
  const ctx: WfuiContext = {
    browser: opts.browser,
    __registry: registry,
  } as any

  const scheduler = opts.scheduler ?? createScheduler({ registry, ctx, rootEl: opts.root })

  rootUi.render = function (this: any, ids?: string[]) {
    // this = 调用者的 childCtx.ui（组件 ctx.ui.render() → this._selfId = 组件 id）
    if (ids == null) { const self = this._selfId ?? '_wf_root'; if (self) scheduler.render([self]) }
    else scheduler.render(ids)
  }
  rootUi.dirty = function (this: any, ids?: string[]) {
    if (ids == null) { const self = this._selfId ?? '_wf_root'; if (self) scheduler.dirty([self]) }
    else scheduler.dirty(ids)
  }
  rootUi.$ = function (this: any) {
    const selfId = this._selfId ?? '_wf_root'
    return createReactiveState(() => scheduler.dirty([selfId]), {
      isMounting: () => rootUi._mounting === true,
    })
  }
  rootUi.setMounting = (v: boolean) => { rootUi._mounting = v }
  rootUi.endMounting = () => { rootUi._mounting = false }

;(ctx as any).ui = rootUi

  // ── 弹层/滚动跟踪系统（scroll/resize 重算 → 渲染） ──
  const tracker = createPopupTrackerSystem((ids: string[]) => { for (const id of ids) scheduler.dirty([id]) })
  const { mediaRegistry, popupTrackers, scrollTrackers, ensurePopupListeners, destroyPopupListeners } = tracker as any

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
    dirty: (ids) => scheduler.dirty(ids),
    render: (ids) => scheduler.render(ids),
    browser: opts.browser,
    onUnmount: (fn) => onComponentUnmountFor(registry, fn),
    registry,
    mediaRegistry,
    popupTrackers,
    scrollTrackers,
    isMounting: () => rootUi._mounting === true,
    isRendering: () => rootUi._rendering === true,
    $: () => (self ?? rootUi).$(),
    warned,
    uncontrolledValues,
    inputStates,
    openStates,
    ensurePopupListeners,
  })

  // ── ctx.ui 完整能力（核心原语 + hooks 薄转发——实现已在 hooks/） ──
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
  rootUi.useDialog = function (this: any, o?: any) { return useDialog(makeEnv(this), o) }
  rootUi.useGlobalKey = function (this: any, h: (e: KeyboardEvent) => void) { return useGlobalKey(makeEnv(this), h) }
  rootUi.useDrag = function (this: any, o: any) { return useDrag(makeEnv(this), o) }
  rootUi.useDragDrop = function (this: any, o: any) { return useDragDrop(makeEnv(this), o) }
  rootUi.useReducedMotion = function (this: any) { return useReducedMotion(makeEnv(this)) }
  rootUi.useAnimationEnd = function (this: any, cb: () => void, o?: { once?: boolean }) { return useAnimationEnd(makeEnv(this), cb, o) }
  rootUi.useTween = function (this: any, t: number, o?: any) { return useTween(makeEnv(this), t, o) }
  rootUi.destroyPopupListeners = destroyPopupListeners

  return { ctx, registry, scheduler, rootUi, destroyPopupListeners }
}

export function mountRoot(opts: MountOptions): MountHandle {
  const { ctx, registry, scheduler, rootUi, destroyPopupListeners } = createVdomContext(opts)

  const handle: MountHandle = {
    ctx,
    registry,
    scheduler,
    async mount(input) {
      // 首帧：buildVNode（await 全部工厂）→ renderValue（同步落地）
      const built = await buildVNode(input as VNodeChild, ctx, undefined, registry)
      opts.root.innerHTML = ''
      const node = renderValue(built, ctx, opts.browser)
      if (node != null) opts.root.appendChild(node)
    },
    unmount() {
      opts.root.innerHTML = ''
      registry.idRegistry.clear()
      destroyPopupListeners()
    },
  }
  return handle
}
