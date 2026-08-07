/**
 * weifuwu/client ctx.ui 工厂 — createApp 注入的 UI 能力
 *
 * 从 app.ts 拆出（P2 结构拆分）。createUi(deps) 返回完整 ui 对象：
 * render / dirty / $ / useChat / useMedia / useBreakpoint / usePopupPosition / selfId
 *
 * 内部状态（_selfId/_selfVNode/_dirtySet/_ctxVersion）集中建模为 UiInternal，
 * 消除 app.ts 中散落的 `as any`——跨模块状态误用由编译器拦截。
 */

import type { WfuiContext, PopupPositionOptions, PopupPosition } from './types.ts'
import type { VNode } from './vnode.ts'
import { idRegistry } from './registry.ts'
import { createReactiveState } from './reactive.ts'
import { aiStream } from './ai.ts'
import { createChatSession, type UseChatHandle, type UseChatOptions, type UseChatState } from './use-chat.ts'

/** 内部 UI 状态（ctx.ui 扩展字段）——跨模块共享，编译器可检查 */
export interface UiInternal {
  _selfId?: string
  _selfVNode?: VNode
  _dirtySet: Set<string>
  _ctxVersion: number
  bumpCtxVersion(): void
  /** 异步批处理调度标记（dirty 微任务防重入） */
  _dirtyScheduled?: boolean
  /** ctx.ui.$() 的 WeakMap 缓存（每组件一个 $ 容器） */
  _$cache?: Record<string, any>
}

/** createUi 依赖（由 createApp 注入 app 级闭包状态） */
export interface UiDeps {
  ctx: WfuiContext
  renderByIds: (ids: string[]) => void
  getSelfId: (ui: any) => string | undefined
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
  schedulePopupRecompute: () => void
  /** 惰性挂载全局 scroll/resize 监听（幂等） */
  ensurePopupListeners: () => void
  destroyPopupListeners: () => void
  /** 渲染保护期（dirty 被忽略） */
  isRendering: () => boolean
}

export function createUi(deps: UiDeps): WfuiContext['ui'] & UiInternal {
  const { ctx, renderByIds, getSelfId, dirtyBatch, dirtySet, mediaRegistry, popupTrackers, schedulePopupRecompute, ensurePopupListeners, isRendering } = deps

  const ui: WfuiContext['ui'] & UiInternal = {
    _selfId: '_wf_root',

    // ── ctx 版本号（供三态 skip 判定） ──
    _ctxVersion: 0,
    _dirtySet: dirtySet,
    bumpCtxVersion: function () { this._ctxVersion++ },

    /** 同步刷新（无参 = 当前组件，传参 = 指定组件列表） */
    render: function (ids?: string[]) {
      if (!ids || ids.length === 0) {
        const selfId = getSelfId(this)
        if (selfId) ids = [selfId]
        else return
      }
      renderByIds(ids)
    },

    /** 异步刷新（微任务批处理，无参 = 当前组件） */
    dirty: function (ids?: string[]) {
      if (isRendering()) return
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
      if (!(this as any)._dirtyScheduled) {
        ;(this as any)._dirtyScheduled = true
        queueMicrotask(() => {
          ;(this as any)._dirtyScheduled = false
          const batch = [...dirtyBatch]
          dirtyBatch.clear()
          if (batch.length > 0) renderByIds(batch)
        })
      }
    },

    /** 创建响应式状态容器：$.x = val 自动触发 dirty() */
    $: function () {
      const uiThis = this as any
      if (!uiThis._$cache) {
        const selfId = getSelfId(this)
        uiThis._$cache = createReactiveState(() => ctx.ui!.dirty(selfId ? [selfId] : undefined))
      }
      return uiThis._$cache
    },

    /**
     * AI 对话会话（会话语义 + 工具调用内嵌 + HITL 审批）
     *
     * 用法（mount 阶段）：
     *   const $ = ctx.ui.useChat({ url: '/api/chat', approveUrl: '/api/approve' })
     *   // 状态：$.messages / $.input / $.streaming / $.error / $.usage / $.step
     *   // 操作：$.send() / $.stop() / $.retry() / $.clear() / $.approve('approved', note?)
     *   // agent：msg.toolCalls（ToolCallCard 直接消费） / msg.approval（ApprovalCard）
     *
     * 返回组件同一个 $（WeakMap 缓存复用）：chat 状态与页面状态共处一个容器。
     * 卸载时调用 $.dispose()（或经 ref cleanup）中止流，防泄漏。
     */
    useChat: function (options: UseChatOptions): UseChatHandle {
      const state = this.$() as UseChatState
      const api = createChatSession(state, aiStream, options)
      Object.assign(state, {
        send: api.send,
        stop: api.stop,
        retry: api.retry,
        clear: api.clear,
        approve: api.approve,
        dispose: api.dispose,
      })
      return state as unknown as UseChatHandle
    },

    /**
     * 响应式媒体查询：注册监听，值变化时自动 dirty
     *
     * 用法：
     *   const $ = ctx.ui.$()
     *   ctx.ui.useMedia('(max-width: 640px)', (v) => { $.isMobile = v })
     *
     * callback 会立即执行一次（取当前值），之后在变化时再次执行
     */
    useMedia: function (query: string, callback: (matches: boolean) => void) {
      const selfId = getSelfId(this)
      const key = `media:${selfId}:${query}`
      if (!mediaRegistry.has(key)) {
        const mql = window.matchMedia(query)
        // 立即回调当前值
        callback(mql.matches)
        // 注册变化监听
        const handler = (e: MediaQueryListEvent) => callback(e.matches)
        mql.addEventListener('change', handler)
        mediaRegistry.set(key, { mql, handler })
      }
    },

    /**
     * 响应式断点：注册命名断点监听，值变化时自动 dirty
     *
     * 用法：
     *   const $ = ctx.ui.$()
     *   ctx.ui.useBreakpoint((vp) => { $.vp = vp })
     *   // vp: 'mobile' | 'tablet' | 'desktop'
     */
    useBreakpoint: function (
      bpsOrCallback: Record<string, string> | ((vp: string) => void),
      callback?: (vp: string) => void,
    ) {
      const bps: Record<string, string> =
        typeof bpsOrCallback === 'function'
          ? { mobile: '(max-width: 639px)', tablet: '(min-width: 640px) and (max-width: 1023px)', desktop: '(min-width: 1024px)' }
          : bpsOrCallback
      const cb = typeof bpsOrCallback === 'function' ? bpsOrCallback : callback!
      const selfId = getSelfId(this)
      const key = `bp:${selfId}`

      function evaluate(): string {
        for (const [name, query] of Object.entries(bps)) {
          if (window.matchMedia(query).matches) return name
        }
        return Object.keys(bps)[0] ?? ''
      }

      if (!mediaRegistry.has(key)) {
        // 立即回调当前值
        cb(evaluate())
        // 为每个断点注册 change 监听，变化时重新求值（卸载时逐个退订）
        const mqls: Array<{ mql: MediaQueryList; handler: () => void }> = []
        for (const query of Object.values(bps)) {
          const mql = window.matchMedia(query)
          const handler = () => cb(evaluate())
          mql.addEventListener('change', handler)
          mqls.push({ mql, handler })
        }
        mediaRegistry.set(key, { mqls })
      }
    },

    /**
     * 弹层位置跟踪：滚动/resize 时自动重算 fixed 坐标
     *
     * 用法（mount 阶段）：
     *   const pos = ctx.ui.usePopupPosition({
     *     el: () => inputEl,                    // ref 保存的锚定元素
     *     isOpen: () => show,                   // 弹层是否显示
     *     compute: (r) => ({ top: r.bottom + 4, left: r.left }),
     *   })
     *
     * pos 是稳定对象，render 闭包直接读取 top/left；
     * 滚动/resize 时自动重算并定向刷新；打开弹层瞬间调用 pos.refresh()。
     */
    usePopupPosition: function (options: PopupPositionOptions): PopupPosition {
      const selfId = getSelfId(this)
      const pos: PopupPosition = { top: 0, left: 0, refresh: () => {} }
      if (!selfId) return pos

      const tracker = {
        pos,
        getEl: options.el,
        isOpen: options.isOpen,
        compute: options.compute,
      }
      popupTrackers.set(selfId, tracker)
      // 惰性挂载全局单例监听（第一个组件注册时）
      ensurePopupListeners()

      // 手动重算：只更新坐标，不触发渲染（调用方负责 render）
      pos.refresh = () => {
        const el = tracker.getEl()
        if (!el) return
        Object.assign(pos, tracker.compute(el.getBoundingClientRect()))
      }
      return pos
    },

    /** 注册组件实例的自定义 ID（用于跨组件精准刷新） */
    selfId: function (name: string) {
      if (typeof name !== 'string' || !name) {
        throw new Error(`[weifuwu] selfId requires a non-empty string, got ${typeof name}`)
      }
      if (idRegistry.has(name)) {
        throw new Error(
          `[weifuwu] Duplicate component ID: "${name}". ` +
          `Each component must have a unique custom ID.`
        )
      }
      const vnode = (this as any)._selfVNode
      if (!vnode) return
      vnode._customId = name
      idRegistry.set(name, vnode)
    },
  }

  return ui as WfuiContext['ui'] & UiInternal
}
