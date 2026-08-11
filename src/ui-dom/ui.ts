/**
 * weifuwu/ui-dom ctx.ui 工厂 — createApp 注入的 UI 能力
 *
 * hooks 重构：所有 ctx.ui.useXXX 的实现已移到 src/ui-dom/hooks/（独立模块，
 * 签名 `useXXX(env, ...args)`）——本文件只做：
 *   1. 核心原语：render / dirty / $ / selfId / bumpCtxVersion
 *   2. 组装 HookEnv（闭包状态 → env）
 *   3. 薄转发：ctx.ui.useXXX → hooks/useXXX(env, ...)（组件库 API 兼容，实现已在 hooks/）
 *
 * 内部状态（_selfId/_selfVNode/_dirtySet/_ctxVersion）集中建模为 UiInternal。
 */

import { createClientBrowser } from './browser.ts'
import type { WfuiContext, PopupPositionOptions, PopupPosition, UseAsyncHandle, UseInViewOptions, UseInViewHandle, UseScrollPositionOptions, UseScrollPositionHandle, UsePopupOptions, UsePopupHandle, UseLongPressOptions, UseLongPressHandle, VisualViewportHandle, BrowserEnv } from './types.ts'
import type { VNode } from './vnode.ts'
import { getRegistry, onComponentUnmountFor } from './registry.ts'
import { createReactiveState } from './reactive.ts'
import { uiLog } from './debug.ts'
import type { UseChatHandle, UseChatOptions } from './use-chat.ts'
import type { HookEnv } from './hooks/types.ts'
import {
  useChat, useMedia, useBreakpoint, usePopupPosition, useHoverCapable,
  useStableRef, useVisualViewport, usePopup, useLongPress, useInView,
  useScrollPosition, useAsync, useControlled, useControlledInput, useOpen,
  usePresence, useDialog, useGlobalKey, useDrag, useDragDrop,
  useReducedMotion, useAnimationEnd, useTween,
} from './hooks/index.ts'

/** 内部 UI 状态（ctx.ui 扩展字段）——跨模块共享，编译器可检查 */
export interface UiInternal {
  _selfId?: string
  _selfVNode?: VNode
  _dirtySet: Set<string>
  _ctxVersion: number
  bumpCtxVersion(): void
  /** 异步批处理调度标记（dirty 微任务防重入） */
  _dirtyScheduled?: boolean
  /** 渲染期调 render() 的推迟标记（防重入） */
  _pendingRender?: boolean
  /** 渲染期调 dirty() 的推迟标记（防重入） */
  _pendingDirty?: boolean
  /** ctx.ui.$() 的 WeakMap 缓存（每组件一个 $ 容器） */
  _$cache?: Record<string, any>
  /** mount 阶段标记（内部——mountComponent 包裹） */
  setMounting: (v: boolean) => void
  endMounting: () => void
  /** ErrorBoundary 注入的错误处理器（子组件 render 抛错时调用） */
  _errorHandler?: (err: unknown) => void
}

/** createUi 依赖（由 createApp 注入 app 级闭包状态） */
export interface UiDeps {
  ctx: WfuiContext
  renderByIds: (ids: string[]) => void
  getSelfId: (ui: WfuiContext['ui'] | undefined) => string | undefined
  dirtyBatch: Set<string>
  dirtySet: Set<string>
  mediaRegistry: Map<string, {
    mql?: MediaQueryList
    handler?: (e: MediaQueryListEvent) => void
    mqls?: Array<{ mql: MediaQueryList; handler: () => void }>
  }>
  popupTrackers: Map<string, {
    pos: PopupPosition
    getEl: () => HTMLElement | null
    isOpen: () => boolean
    compute: (rect: DOMRect) => { top: number; left: number; width?: number }
  }>
  scrollTrackers: Map<string, {
    handle: { y: number }
    getScroller: () => HTMLElement | Window
  }>
  schedulePopupRecompute: () => void
  /** 惰性挂载全局 scroll/resize 监听（幂等） */
  ensurePopupListeners: () => void
  destroyPopupListeners: () => void
  /** 渲染保护期（dirty 被忽略） */
  isRendering: () => boolean
  /** mount 阶段（组件工厂执行——$ 初始化赋值丢弃） */
  isMounting: () => boolean
  /** mount 阶段标记置位/恢复（mountComponent 包裹） */
  setMounting: (v: boolean) => void
  endMounting: () => void
  /** 注册表实例（serve 注入局部；缺省 ctx.__registry） */
  registry?: import('./registry.ts').Registry
}

/** 受控组件缺回调 warn 去重（按 name） */
const warnedControlled = new Set<string>()
/** 非受控内部值缓存（按 selfId，卸载时回收） */
const uncontrolledValues = new Map<string, any>()
/** useControlledInput 内部输入态（keyword/selectedLabel——render 阶段调用跨渲染保持） */
const inputStates = new Map<string, { keyword: string; selectedLabel: string }>()
/** useOpen 非受控内部打开态（render 阶段调用跨渲染保持） */
const openStates = new Map<string, boolean>()

export function createUi(deps: UiDeps): WfuiContext['ui'] & UiInternal {
  const { ctx, renderByIds, getSelfId, dirtyBatch, dirtySet, mediaRegistry, popupTrackers, scrollTrackers, ensurePopupListeners, isRendering, isMounting, setMounting, endMounting } = deps
  const b = (ctx.browser ?? createClientBrowser()) as BrowserEnv
  // 注册表实例：serve 注入局部（隔离）；缺省回退 ctx.__registry
  const reg = deps.registry ?? getRegistry(ctx)
  const unmount = (hook: (id: string) => void) => onComponentUnmountFor(reg, hook)

  // ui 先用宽松类型（hooks 转发放 env 组装后挂载）——返回时断言完整类型
  const ui: any = {
    _selfId: '_wf_root',

    // ── ctx 版本号（供三态 skip 判定） ──
    _ctxVersion: 0,
    _dirtySet: dirtySet,
    setMounting: setMounting,
    endMounting: endMounting,
    bumpCtxVersion: function () { this._ctxVersion++ },

    /** 同步刷新（无参 = 当前组件，传参 = 指定组件列表） */
    render: function (ids?: string[]) {
      // 渲染期调用（render 内调父层 render）：推迟到微任务补渲染——
      // renderByIds 的 _rendering 保护会静默丢弃，父层状态更新丢失
      if (isRendering()) {
        if (isMounting()) return
        if (!this._pendingRender) {
          this._pendingRender = true
          queueMicrotask(() => {
            this._pendingRender = false
            this.render(ids)
          })
        }
        return
      }
      if (!ids || ids.length === 0) {
        const selfId = getSelfId(this)
        if (selfId) ids = [selfId]
        else return
      }
      renderByIds(ids)
    },

    /** 异步刷新（微任务批处理，无参 = 当前组件） */
    dirty: function (ids?: string[]) {
      // debug：谁在反复 dirty（死循环定位——uiLog 节流）
      const selfId = this._selfId ?? ''
      const n = (this as any)._debugDirty = ((this as any)._debugDirty ?? 0) + 1
      uiLog('dirty', 'self=' + String(selfId).slice(0, 20) + ' ids=' + JSON.stringify(ids) + ' n=' + n + ' mounting=' + isMounting() + ' rendering=' + isRendering(), { throttle: 200 })
      // mount 阶段（组件工厂初始化赋值）：丢弃（初始化不需渲染）
      if (isMounting()) return
      // 渲染期调用（组件 render 内调父层 setState）：推迟到渲染完成后微任务，
      // 而非丢弃——否则 onXxx 回调通知父层的模式（Anchor 滚动高亮等）静默失效
      if (isRendering()) {
        if (!this._pendingDirty) {
          this._pendingDirty = true
          queueMicrotask(() => {
            this._pendingDirty = false
            this.dirty(ids)
          })
        }
        return
      }
      if (!ids || ids.length === 0) {
        const selfId = getSelfId(this)
        if (selfId) ids = [selfId]
        else return
      }
      for (const id of ids) {
        if (id) {
          dirtyBatch.add(id)
          dirtySet.add(id)
        }
      }
      if (!this._dirtyScheduled) {
        this._dirtyScheduled = true
        queueMicrotask(() => {
          this._dirtyScheduled = false
          const batch = [...dirtyBatch]
          dirtyBatch.clear()
          if (batch.length > 0) renderByIds(batch)
        })
      }
    },

    /** 创建响应式状态容器：$.x = val 自动触发 dirty() */
    $: function () {
      const uiThis = this
      // 必须 own property——childCtx.ui = Object.create(ctx.ui) 继承 root 的
      // _$cache，若用 truthy 判断子组件会拿到 root 的 $（原型链污染——AppShell
      // 折叠不工作根因）。每组件实例独立 $。
      if (!Object.prototype.hasOwnProperty.call(uiThis, '_$cache')) {
        const cache = createReactiveState(() => {
          const id = uiThis._selfVNode?._id ?? getSelfId(uiThis)
          if (id) ctx.ui!.dirty([id])
        })
        uiThis._$cache = cache
      }
      return uiThis._$cache!
    },

    /** 注册组件实例的自定义 ID（用于跨组件精准刷新） */
    selfId: function (name: string) {
      if (typeof name !== 'string' || !name) {
        throw new Error(`[weifuwu] selfId requires a non-empty string, got ${typeof name}`)
      }
      if (reg.idRegistry.has(name)) {
        throw new Error(
          `[weifuwu] Duplicate component ID: "${name}". ` +
          `Each component must have a unique custom ID.`
        )
      }
      const vnode = this._selfVNode
      if (!vnode) return
      vnode._customId = name
      reg.idRegistry.set(name, vnode)
    },
  }

  // ── HookEnv 组装（hooks 实现依赖的运行时上下文——见 hooks/types.ts） ──
  const env: HookEnv = {
    selfId: () => getSelfId(ui),
    dirty: (ids) => ui.dirty(ids),
    render: (ids) => ui.render(ids),
    browser: b,
    onUnmount: unmount,
    registry: reg,
    mediaRegistry: mediaRegistry as HookEnv['mediaRegistry'],
    popupTrackers: popupTrackers as HookEnv['popupTrackers'],
    scrollTrackers: scrollTrackers as HookEnv['scrollTrackers'],
    isMounting,
    isRendering,
    $: () => ui.$(),
    warned: warnedControlled,
    uncontrolledValues,
    inputStates,
    openStates,
    ensurePopupListeners,
  }

  // ── hooks 薄转发（实现已移到 src/ui-dom/hooks/） ──
  // 关键：转发用 function(this) 保留调用者语义——hooks 的 selfId 必须解析为
  // **调用组件**（childCtx.ui._selfVNode._id），而非 root ui。per-call env 浅拷贝
  //（selfId 动态绑定 this，其余字段共享）。
  const makeEnv = (self: any): HookEnv => ({ ...env, selfId: () => getSelfId(self ?? ui), $: () => (self ?? ui).$() })
  ui.useChat = function (this: any, o: UseChatOptions) { return useChat(makeEnv(this), o) }
  ui.useMedia = function (this: any, q: string, cb: (m: boolean) => void) { return useMedia(makeEnv(this), q, cb) }
  ui.useBreakpoint = function (this: any, b1: any, cb?: any) { return useBreakpoint(makeEnv(this), b1, cb) }
  ui.usePopupPosition = function (this: any, o: PopupPositionOptions) { return usePopupPosition(makeEnv(this), o) }
  ui.useHoverCapable = function (this: any) { return useHoverCapable(makeEnv(this)) }
  ui.useStableRef = function (this: any, init: any, cleanup?: any) { return useStableRef(makeEnv(this), init, cleanup) }
  ui.useVisualViewport = function (this: any) { return useVisualViewport(makeEnv(this)) }
  ui.usePopup = function (this: any, o: UsePopupOptions) { return usePopup(makeEnv(this), o) }
  ui.useLongPress = function (this: any, o: UseLongPressOptions) { return useLongPress(makeEnv(this), o) }
  ui.useInView = function (this: any, o: UseInViewOptions) { return useInView(makeEnv(this), o) }
  ui.useScrollPosition = function (this: any, o: UseScrollPositionOptions) { return useScrollPosition(makeEnv(this), o) }
  ui.useAsync = function <T>(this: any, f: () => Promise<T>) { return useAsync<T>(makeEnv(this), f) }
  ui.useControlled = function <T>(this: any, o: { value?: T; onChange?: (v: T) => void; name?: string }) { return useControlled<T>(makeEnv(this), o) }
  ui.useControlledInput = function (this: any, o: { value?: string; onChange?: (v: string) => void; name?: string }) { return useControlledInput(makeEnv(this), o) }
  ui.useOpen = function (this: any, o: any) { return useOpen(makeEnv(this), o) }
  ui.usePresence = function (this: any, o?: any) { return usePresence(makeEnv(this), o) }
  ui.useDialog = function (this: any, o?: any) { return useDialog(makeEnv(this), o) }
  ui.useGlobalKey = function (this: any, h: (e: KeyboardEvent) => void) { return useGlobalKey(makeEnv(this), h) }
  ui.useDrag = function (this: any, o: any) { return useDrag(makeEnv(this), o) }
  ui.useDragDrop = function (this: any, o: any) { return useDragDrop(makeEnv(this), o) }
  ui.useReducedMotion = function (this: any) { return useReducedMotion(makeEnv(this)) }
  ui.useAnimationEnd = function (this: any, cb: () => void, o?: { once?: boolean }) { return useAnimationEnd(makeEnv(this), cb, o) }
  ui.useTween = function (this: any, t: number, o?: any) { return useTween(makeEnv(this), t, o) }

  return ui as WfuiContext['ui'] & UiInternal
}
