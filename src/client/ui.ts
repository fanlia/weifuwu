/**
 * weifuwu/client ctx.ui 工厂 — createApp 注入的 UI 能力
 *
 * 从 app.ts 拆出（P2 结构拆分）。createUi(deps) 返回完整 ui 对象：
 * render / dirty / $ / useChat / useMedia / useBreakpoint / usePopupPosition / selfId
 *
 * 内部状态（_selfId/_selfVNode/_dirtySet/_ctxVersion）集中建模为 UiInternal，
 * 消除 app.ts 中散落的 `as any`——跨模块状态误用由编译器拦截。
 */

import type { WfuiContext, PopupPositionOptions, PopupPosition, UseAsyncHandle, UseInViewOptions, UseInViewHandle, UseScrollPositionOptions, UseScrollPositionHandle, UsePopupOptions, UsePopupHandle, UseLongPressOptions, UseLongPressHandle, VisualViewportHandle } from './types.ts'
import type { VNode } from './vnode.ts'
import { idRegistry, onComponentUnmount } from './registry.ts'
import { lockScroll, unlockScroll } from './scroll-lock.ts'
import { trapFocus } from './focus-trap.ts'
import { createReactiveState } from './reactive.ts'
import { aiStream } from './ai.ts'
import { createChatSession, type UseChatHandle, type UseChatOptions, type UseChatState } from './use-chat.ts'
import { clampToViewport, computeFixedPosRect } from './popup.ts'
import { createPortal } from './vnode.ts'

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
}

/** 受控组件缺回调 warn 去重（按 name） */
const warnedControlled = new Set<string>()
/** 非受控内部值缓存（按 selfId，卸载时回收） */
const uncontrolledValues = new Map<string, any>()

export function createUi(deps: UiDeps): WfuiContext['ui'] & UiInternal {
  const { ctx, renderByIds, getSelfId, dirtyBatch, dirtySet, mediaRegistry, popupTrackers, scrollTrackers, schedulePopupRecompute, ensurePopupListeners, isRendering } = deps

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
        panel: options.panel,
        margin: options.margin ?? 8,
      }
      popupTrackers.set(selfId, tracker)
      // 惰性挂载全局单例监听（第一个组件注册时）
      ensurePopupListeners()

      // 手动重算：只更新坐标，不触发渲染（调用方负责 render）
      pos.refresh = () => {
        const el = tracker.getEl()
        if (!el) return
        const p = tracker.compute(el.getBoundingClientRect())
        // 视口夹紧：面板超高/超宽时平移回视口（确定/取消按钮不可点问题）
        Object.assign(pos, clampToViewport(p, tracker.panel?.(), tracker.margin))
      }
      return pos
    },

    /**
     * 当前设备是否支持 hover（matchMedia '(hover: hover)'，mount 期一次判定）
     * 用途：hover 触发的交互在触屏降级为 tap（Tooltip/HoverCard/Popover hover 模式）。
     */
    useHoverCapable: function (): boolean {
      return typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover)').matches
    },

    /**
     * 稳定 ref 引用：mount 作用域持有，跨渲染引用恒等，
     * 根治内联 ref 陷阱（ref-diff 在引用变化时调用旧 ref(null)）。
     */
    useStableRef: function (init: (el: any) => void, cleanup?: () => void) {
      const ref = (el: any) => {
        if (el) init(el)
        else cleanup?.()
      }
      return ref
    },

    /**
     * 可视视口跟踪（visualViewport）：键盘弹起/缩放时自动更新 + dirty。
     * 无 visualViewport（桌面/旧浏览器）降级 innerHeight。
     * 用途：fixed 底部栏（AiChat 输入区/底部抽屉）被虚拟键盘遮挡时抬升。
     */
    useVisualViewport: function (): VisualViewportHandle {
      const selfId = getSelfId(this)
      const handle: VisualViewportHandle = {
        height: window.innerHeight,
        offsetTop: 0,
        keyboardOpen: false,
      }
      const dirty = () => {
        if (!ctx.ui) return // destroy 后：静默忽略
        ctx.ui!.dirty(selfId ? [selfId] : undefined)
      }
      const update = () => {
        const vv = (window as any).visualViewport as { height?: number; offsetTop?: number } | undefined
        handle.height = vv?.height ?? window.innerHeight
        handle.offsetTop = vv?.offsetTop ?? 0
        handle.keyboardOpen = handle.height < window.innerHeight * 0.9
        dirty()
      }
      const vv = (window as any).visualViewport as
        | { addEventListener?: (t: string, cb: () => void) => void; removeEventListener?: (t: string, cb: () => void) => void }
        | undefined
      if (vv?.addEventListener) {
        vv.addEventListener('resize', update)
        vv.addEventListener('scroll', update)
      } else {
        window.addEventListener('resize', update)
      }
      if (selfId) {
        onComponentUnmount((id) => {
          if (id !== selfId) return
          if (vv?.removeEventListener) {
            vv.removeEventListener('resize', update)
            vv.removeEventListener('scroll', update)
          } else {
            window.removeEventListener('resize', update)
          }
        })
      }
      return handle
    },

    /**
     * 弹层组合器：收敛 open 状态 + 触发（hover/tap 降级/longpress）+ Escape +
     * 外部点击 + 定位/视口 clamp + portal。移动端友好由构造保证（CS-05 诚实裁剪：
     * Modal/Drawer 等全屏对话框不进本原语，focus-trap/scroll-lock 各自实现）。
     */
    usePopup: function (options: UsePopupOptions): UsePopupHandle {
      const selfId = getSelfId(this)
      const canHover = this.useHoverCapable()
      const triggerOf = () => (typeof options.trigger === 'function' ? options.trigger() : options.trigger)
      const controlled = options.open !== undefined
      const isDisabled = () => !!options.disabled?.()
      const isOpen = () => {
        if (!controlled) return options.isOpen()
        return typeof options.open === 'function' ? !!options.open() : !!options.open
      }
      const setOpen = (v: boolean) => {
        if (isDisabled()) return
        if (controlled) {
          options.onOpenChange?.(v)
        } else {
          options.setOpen(v)
        }
      }
      const placementOf = () => {
        const p = options.placement
        return typeof p === 'function' ? p() : (p ?? 'bottom')
      }

      // ── 定位（复用 usePopupPosition：滚动/resize 自动重算 + 视口夹紧） ──
      let panelEl: HTMLElement | null = null
      let prevOpen = false
      const pos = ctx.ui!.usePopupPosition({
        el: options.el,
        isOpen: () => isOpen(),
        compute: (r) => {
          if (options.position) {
            // 自由定位（右键菜单光标处）：position getter 提供坐标，忽略 placement
            const p = options.position()
            return { top: p.y, left: p.x }
          }
          return computeFixedPosRect(r, placementOf(), options.gap ?? 6, options.center !== false)
        },
        panel: () => panelEl,
        margin: options.margin ?? 8,
      })

      // ── 外部点击关闭（document 级，卸载退订） ──
      const onDocMouseDown = (e: Event) => {
        if (options.closeOnOutside === false) return
        if (!isOpen()) return
        const target = e.target
        if (!(target instanceof Node)) return
        const el = options.el()
        if (el && el.contains(target)) return
        if (panelEl && panelEl.contains(target)) return
        setOpen(false)
      }
      // ── Escape 关闭（document 级：弹层在 portal 中，焦点在弹层内按 Escape 不会冒泡到 wrap） ──
      const onDocKeyDown = (e: KeyboardEvent) => {
        if (options.closeOnEscape === false) return
        if (e.key !== 'Escape' || !isOpen()) return
        setOpen(false)
      }
      document.addEventListener('mousedown', onDocMouseDown)
      document.addEventListener('keydown', onDocKeyDown)
      if (selfId) {
        onComponentUnmount((id) => {
          if (id === selfId) {
            document.removeEventListener('mousedown', onDocMouseDown)
            document.removeEventListener('keydown', onDocKeyDown)
          }
        })
      }

      // ── 触发 props（hover 门控 + tap 降级 + longpress + Escape） ──
      const wrapProps: Record<string, any> = {}
      const delayOf = (d: number | (() => number) | undefined) => (typeof d === 'function' ? d() : (d ?? 0))
      const openDelay = () => delayOf(options.openDelay)
      const closeDelay = () => delayOf(options.closeDelay)
      let openTimer: ReturnType<typeof setTimeout> | undefined
      let closeTimer: ReturnType<typeof setTimeout> | undefined
      const clearHoverTimers = () => { clearTimeout(openTimer); clearTimeout(closeTimer); openTimer = undefined; closeTimer = undefined }
      if (triggerOf() === 'hover') {
        if (canHover) {
          wrapProps.onMouseEnter = () => {
            if (isDisabled()) return
            clearTimeout(closeTimer); closeTimer = undefined
            openTimer = setTimeout(() => { openTimer = undefined; setOpen(true) }, openDelay())
          }
          wrapProps.onMouseLeave = () => {
            if (isDisabled()) return
            clearTimeout(openTimer); openTimer = undefined
            closeTimer = setTimeout(() => { closeTimer = undefined; setOpen(false) }, closeDelay())
          }
        } else {
          // 触屏：tap 切换 + 点外部关闭（外部关闭已在 document 层处理）
          wrapProps.onClick = () => setOpen(!isOpen())
        }
        // 键盘可达（两端一致）
        wrapProps.onFocus = () => { if (!isDisabled()) { clearTimeout(closeTimer); closeTimer = undefined; openTimer = setTimeout(() => { openTimer = undefined; setOpen(true) }, openDelay()) } }
        wrapProps.onBlur = () => { if (!isDisabled()) { clearTimeout(openTimer); openTimer = undefined; closeTimer = setTimeout(() => { closeTimer = undefined; setOpen(false) }, closeDelay()) } }
      } else if (triggerOf() === 'click') {
        wrapProps.onClick = () => setOpen(!isOpen())
      } else if (triggerOf() === 'longpress') {
        let timer: ReturnType<typeof setTimeout> | undefined
        let startX = 0
        let startY = 0
        const clear = () => { clearTimeout(timer); timer = undefined }
        wrapProps.onPointerDown = (e: any) => {
          if (isDisabled()) return
          startX = e.clientX ?? 0
          startY = e.clientY ?? 0
          clear()
          timer = setTimeout(() => {
            timer = undefined
            options.onTrigger?.({ clientX: startX, clientY: startY })
            setOpen(true)
          }, options.longPressDuration ?? 500)
        }
        wrapProps.onPointerUp = clear
        wrapProps.onPointerLeave = clear
        wrapProps.onPointerMove = (e: any) => {
          const dx = Math.abs((e.clientX ?? 0) - startX)
          const dy = Math.abs((e.clientY ?? 0) - startY)
          if (dx > 10 || dy > 10) clear() // 位移 > 10px 视为滚动/拖动，取消
        }
        wrapProps.onContextMenu = (e: any) => {
          e.preventDefault()
          options.onTrigger?.({ clientX: e.clientX ?? 0, clientY: e.clientY ?? 0 })
          setOpen(true)
        } // 桌面右键兼容
      }

      wrapProps.onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && options.closeOnEscape !== false) setOpen(false)
      }
      // 组件卸载时清理悬停计时器
      if (selfId) {
        onComponentUnmount((id) => { if (id === selfId) clearHoverTimers() })
      }

      // ── 面板元素捕获（视口夹紧用；动画结束后重算坐标，DatePicker 同款） ──
      const panelRef = (el: HTMLElement | null) => {
        if (el) {
          panelEl = el
          const settle = () => pos.refresh()
          el.addEventListener('animationend', settle, { once: true })
        } else {
          panelEl = null
        }
      }

      // ── portal：定位 + 宽度 clamp + 打开瞬间重算坐标 ──
      const portal = (content: VNode, portalKey = 'popover'): VNode | null => {
        if (isDisabled()) return null
        const now = isOpen()
        if (!now) { prevOpen = false; return null }
        if (!prevOpen) {
          pos.refresh()
          prevOpen = true
        }
        const props = (content.props ?? {}) as Record<string, any>
        const prevRef = props.ref
        const cls = ['wf-popup', props.class].filter(Boolean).join(' ')
        const style = {
          ...(props.style ?? {}),
          position: 'fixed',
          top: `${pos.top}px`,
          left: `${pos.left}px`,
          maxWidth: options.width !== undefined
            ? `min(${options.width}px, calc(100vw - 32px))`
            : 'calc(100vw - 32px)',
        }
        const panel = {
          ...content,
          props: {
            ...props,
            class: cls,
            style,
            ref: (el: HTMLElement | null) => { panelRef(el); if (prevRef) prevRef(el) },
          },
        } as VNode
        return createPortal(panel, portalKey)
      }

      return {
        open: isOpen(),
        setOpen,
        wrapProps,
        portal,
        refresh: () => pos.refresh(),
      }
    },

    /**
     * 长按手势：pointerdown 按住 duration 触发，提前松开/位移取消，桌面右键兼容。
     * 返回的 props spread 到目标元素（ContextMenu 移动端触发用）。
     */
    useLongPress: function (options: UseLongPressOptions): UseLongPressHandle {
      const { onLongPress, duration = 500 } = options
      let timer: ReturnType<typeof setTimeout> | undefined
      let startX = 0
      let startY = 0
      let startEvent: any = null
      const clear = () => { clearTimeout(timer); timer = undefined }
      return {
        onPointerDown: (e: any) => {
          startX = e.clientX ?? 0
          startY = e.clientY ?? 0
          startEvent = e
          clear()
          timer = setTimeout(() => { timer = undefined; onLongPress(startEvent) }, duration)
        },
        onPointerUp: clear,
        onPointerLeave: clear,
        onPointerMove: (e: any) => {
          const dx = Math.abs((e.clientX ?? 0) - startX)
          const dy = Math.abs((e.clientY ?? 0) - startY)
          if (dx > 10 || dy > 10) clear()
        },
        onContextMenu: (e: any) => { e.preventDefault(); onLongPress(e) },
      }
    },

    /**
     * 可见性观察（IntersectionObserver 封装）：替代组件自建 scroll 监听。
     * IO 在合成器线程评估，滚动/尺寸变化自动触发，无 scroll-linked 定位警告。
     * isIn 响应式——变化自动 dirty 当前组件（与 usePopupPosition 的 pos 同模式）。
     */
    useInView: function (options: UseInViewOptions): UseInViewHandle {
      const selfId = getSelfId(this)
      const handle: UseInViewHandle = {
        isIn: false,
        ready: false,
        observe,
        refresh,
        disconnect,
      }

      let el: HTMLElement | null = null
      let io: IntersectionObserver | null = null

      const dirty = () => {
        if (!ctx.ui) return // destroy 后：静默忽略
        ctx.ui!.dirty(selfId ? [selfId] : undefined)
      }

      function createIO() {
        io?.disconnect()
        io = null
        if (!el) return
        const rm = typeof options.rootMargin === 'function' ? options.rootMargin() : options.rootMargin
        const th = typeof options.threshold === 'function' ? options.threshold() : options.threshold
        io = new IntersectionObserver((entries) => {
          const entry = entries[entries.length - 1]
          if (!entry) return
          const next = entry.isIntersecting
          const changed = next !== handle.isIn
          const wasFirst = !handle.ready
          handle.isIn = next
          handle.ready = true
          // 先给调用方同步最新状态（如宽度/rect），再触发渲染
          options.onChange?.(entry, next)
          if (changed || wasFirst) dirty()
        }, {
          root: options.root ? options.root() : null,
          rootMargin: rm ?? '0px',
          threshold: th ?? 0,
        })
        io.observe(el)
      }

      function observe(target: HTMLElement | null) {
        el = target
        if (target) {
          createIO()
        } else {
          io?.disconnect()
          io = null
          handle.isIn = false
        }
      }

      function refresh() {
        createIO()
      }

      function disconnect() {
        io?.disconnect()
        io = null
      }

      return handle
    },

    /**
     * 滚动位置跟踪（全局 scroll 监听 + rAF 节流，仿 usePopupPosition）：
     * 返回响应式 scrollY/scrollTop，变化自动 dirty 当前组件。
     * 替代组件自建 scroll 监听（Affix/VirtualList 统一使用）。
     */
    useScrollPosition: function (options: UseScrollPositionOptions): UseScrollPositionHandle {
      const selfId = getSelfId(this)
      const handle: UseScrollPositionHandle = {
        y: 0,
        refresh() {
          const scroller = tracker.getScroller()
          handle.y = scroller instanceof Window
            ? (document.scrollingElement?.scrollTop ?? (scroller as Window).scrollY ?? 0)
            : (scroller as HTMLElement).scrollTop ?? 0
        },
      }
      const tracker = {
        handle,
        getScroller: options.getScroller ?? (() => window),
      }
      if (!selfId) {
        handle.refresh()
        return handle
      }
      scrollTrackers.set(selfId, tracker)
      ensurePopupListeners() // 复用全局 scroll/resize 监听（rAF 节流）
      handle.refresh() // 初始值
      return handle
    },

    /**
     * 异步取数工具（mount 阶段调用）：loading/error 自动管理 + 数据就绪自动渲染。
     *
     * 用法：
     *   const list = ctx.ui.useAsync(() => ctx.api.get<User[]>('/users'))
     *   return () => list.loading ? h(Loading) : list.data?.map(...)
     *
     * 返回 handle 的 data/loading/error 是响应式的（内部独立状态容器，赋值自动 dirty 当前组件）；
     * reload() 重跑取数；组件卸载后旧 Promise resolve 不再触发渲染（idRegistry 查无此组件，安全忽略）。
     */
    useAsync: function <T>(fetcher: () => Promise<T>): UseAsyncHandle<T> {
      const selfId = getSelfId(this)
      const state = createReactiveState(() => {
        if (!ctx.ui) return // destroy 后：静默忽略（应用已销毁）
        ctx.ui!.dirty(selfId ? [selfId] : undefined)
      }) as any
      state.loading = true
      // stale-close 保护：每次 reload 递增 token，过期 Promise resolve 静默丢弃
      let token = 0
      const run = () => {
        const cur = ++token
        state.loading = true
        state.error = null
        Promise.resolve()
          .then(() => fetcher())
          .then((d) => { if (token === cur) { state.data = d; state.loading = false } })
          .catch((e) => { if (token === cur) { state.error = e; state.loading = false } })
      }
      run()
      state.reload = run
      return state as UseAsyncHandle<T>
    },

    /**
     * 受控/非受控状态统一：value !== undefined → 受控（setValue 只走 onChange）；
     * 否则内部状态 + 自动 render。受控但缺 onChange 时 console.warn 一次（按 name 幂等）。
     */
    useControlled: function <T>(options: {
      value?: T
      onChange?: (v: T) => void
      name?: string
    }): { value: T | undefined; setValue: (v: T) => void; controlled: boolean } {
      const selfId = getSelfId(this)
      const controlled = options.value !== undefined
      // 受控缺回调 warn：模块级按 name 幂等（一次提示即可）
      if (controlled && !options.onChange && options.name) {
        if (!warnedControlled.has(options.name)) {
          warnedControlled.add(options.name)
          console.warn(
            `[weifuwu/${options.name}] 受控模式（value 已传）但未提供 onChange，交互无法生效。\n` +
            `非受控：去掉 value；受控：传入 onChange={(v) => setValue(v)}`
          )
        }
      }
      // 非受控内部值：首次用当前 value 初始化，后续跨渲染保持（render 阶段调用也稳定）
      if (!controlled && selfId && !uncontrolledValues.has(selfId)) {
        uncontrolledValues.set(selfId, options.value)
        onComponentUnmount((id) => { uncontrolledValues.delete(id) })
      }
      const setValue = (v: T) => {
        if (controlled) {
          options.onChange?.(v)
          return
        }
        if (selfId) uncontrolledValues.set(selfId, v)
        if (ctx.ui) {
          if (selfId) ctx.ui.dirty([selfId])
          else ctx.ui.render()
        }
      }
      return {
        value: controlled ? options.value : (selfId ? uncontrolledValues.get(selfId) : options.value),
        setValue,
        controlled,
      }
    },

    /**
     * 全屏对话框组合器：退场状态机（open → exit → closed）+ 滚动锁 + 焦点 trap。
     * mount 创建 handle；render 阶段 sync(open) 驱动。Escape 语义留组件层。
     */
    useDialog: function (options?: { name?: string }) {
      const selfId = getSelfId(this)
      let phase: 'closed' | 'open' | 'exit' = 'closed'
      let focusCleanup: (() => void) | undefined
      let animEndHandler: (() => void) | undefined
      let panelEl: HTMLElement | null = null

      const finishExit = () => {
        phase = 'closed'
        if (ctx.ui) {
          if (selfId) ctx.ui.dirty([selfId])
          else ctx.ui.render()
        }
      }

      const rootRef = (el: any) => {
        if (el) {
          lockScroll()
          if (panelEl) focusCleanup = trapFocus(panelEl as HTMLElement)
          // 挂载期挂一次 animationend：enter 结束忽略，exit 结束才真正卸载
          if (!animEndHandler) {
            animEndHandler = () => { if (phase === 'exit') finishExit() }
            el.addEventListener('animationend', animEndHandler)
          }
        } else {
          unlockScroll()
          focusCleanup?.()
          el?.removeEventListener('animationend', animEndHandler as any)
          animEndHandler = undefined
        }
      }

      const panelRef = (el: any) => {
        panelEl = el
        // panel 后挂（root 先连）时补 trap
        if (el && !focusCleanup) {
          focusCleanup = trapFocus(el as HTMLElement)
        }
      }

      return {
        get phase() { return phase },
        rootRef,
        panelRef,
        sync: (open: boolean) => {
          if (open) phase = 'open'
          else if (phase === 'open') phase = 'exit'
          return phase
        },
      }
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
