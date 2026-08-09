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
  /** mount 阶段标记（内部——mountComponent 包裹） */
  setMounting: (v: boolean) => void
  endMounting: () => void
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
  /** mount 阶段（组件工厂执行——$ 初始化赋值丢弃） */
  isMounting: () => boolean
  /** mount 阶段标记置位/恢复（mountComponent 包裹） */
  setMounting: (v: boolean) => void
  endMounting: () => void
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
  const { ctx, renderByIds, getSelfId, dirtyBatch, dirtySet, mediaRegistry, popupTrackers, scrollTrackers, schedulePopupRecompute, ensurePopupListeners, isRendering, isMounting, setMounting, endMounting } = deps

  const ui: WfuiContext['ui'] & UiInternal = {
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
        if (!(this as any)._pendingRender) {
          ;(this as any)._pendingRender = true
          queueMicrotask(() => {
            ;(this as any)._pendingRender = false
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
      // mount 阶段（组件工厂初始化赋值）：丢弃（旧行为正确——初始化不需渲染）
      if (isMounting()) return
      // 渲染期调用（组件 render 内调父层 setState）：推迟到渲染完成后微任务，
      // 而非丢弃——否则 onXxx 回调通知父层的模式（Anchor 滚动高亮等）静默失效
      if (isRendering()) {
        if (!(this as any)._pendingDirty) {
          ;(this as any)._pendingDirty = true
          queueMicrotask(() => {
            ;(this as any)._pendingDirty = false
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
        // dirty 回调动态解析 selfId（而非 mount 一次性捕获）：
        // 优先 _selfVNode._id（vnode 复用时 id 稳定且正确）——避免组件在
        // 无状态包裹/重挂载场景下 $ 状态赋值渲染孤儿实例（交互静默失效）
        uiThis._$cache = createReactiveState(() => {
          const id = uiThis._selfVNode?._id ?? getSelfId(uiThis)
          if (id) ctx.ui!.dirty([id])
        })
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
        const r = el.getBoundingClientRect()
        // 0 rect 防护：元素替换中/未布局/隐藏时 rect 全 0——跳过刷新
        // （保留上一坐标——否则 popup 被覆盖为 0，弹层飞到视口左上角——
        // TreeSelect 真实 bug：scroll 时 ref 更新间隙读到 0 rect）
        if (r.width === 0 && r.height === 0) return
        const p = tracker.compute(r)
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

      // trigger 动态化（Popover 悬停失效根因）：wrapProps 在 mount 时创建一次——
      // 若按当时 triggerOf() 分支（如初始 'click'）则 hover 分支永不建立。
      // 统一挂全部 handler，内部分派（triggerOf() 每次调用读最新）——
      // trigger 从 click 切 hover 也生效；click 组件挂 mouseover 无害（分派 return）。
      const hoverOpen = (e: any) => {
        if (isDisabled()) return
        const wrap = e.currentTarget as HTMLElement
        const rt = e.relatedTarget as Node | null
        if (wrap.contains(rt)) return // 内部移动
        clearTimeout(closeTimer); closeTimer = undefined
        openTimer = setTimeout(() => { openTimer = undefined; setOpen(true) }, openDelay())
      }
      const hoverClose = (e: any) => {
        if (isDisabled()) return
        const wrap = e.currentTarget as HTMLElement
        const rt = e.relatedTarget as Node | null
        if (wrap.contains(rt)) return // 移到内部
        clearTimeout(openTimer); openTimer = undefined
        closeTimer = setTimeout(() => { closeTimer = undefined; setOpen(false) }, closeDelay())
      }
      const focusOpen = () => { if (!isDisabled()) { clearTimeout(closeTimer); closeTimer = undefined; openTimer = setTimeout(() => { openTimer = undefined; setOpen(true) }, openDelay()) } }
      const blurClose = () => { if (!isDisabled()) { clearTimeout(openTimer); openTimer = undefined; closeTimer = setTimeout(() => { closeTimer = undefined; setOpen(false) }, closeDelay()) } }
      const isHover = () => triggerOf() === 'hover'

      // 全部 handler 无条件挂（内部分派——trigger 动态变化生效）
      wrapProps.onMouseOver = (e: any) => { if (isHover()) hoverOpen(e) }
      wrapProps.onMouseOut = (e: any) => { if (isHover()) hoverClose(e) }
      wrapProps.onClick = () => {
        if (isHover()) {
          if (!canHover) setOpen(!isOpen()) // 触屏 tap 退化
        } else if (triggerOf() === 'click') {
          // 只开不关（Select 教训）：trigger 点击只打开——关闭交外部点击/
          // Escape/选中。toggle 会与自定义 trigger 的 onClick 双触发净零
          // （Dropdown demo：Button 开 + wrapProps 关 = 永远关）。
          setOpen(true)
        }
      }
      wrapProps.onFocus = () => { if (isHover()) focusOpen() }
      wrapProps.onBlur = () => { if (isHover()) blurClose() }

      if (triggerOf() === 'longpress') {
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

      // ── portal：定位 + 宽度 clamp + 打开/锚点变化瞬间重算坐标 ──
      // 锚点感知：打开状态下切换锚点（hover 导航项切换）也自动重算——
      // 否则 prevOpen 已 true 不刷新，弹层停留在旧锚点（NavMenu 教训）
      // el-null fallback：嵌套弹层首帧锚点 ref 在 patch 后设置（render 内
      // el() 为 null）——微任务推迟重试，render 完成后再取坐标
      let lastEl: HTMLElement | null = null
      // 稳定 portal ref（渲染器内联 ref 检测：内联箭头每次渲染新引用 → ≥3 次警告）。
      // content 的 ref（prevRef）动态——闭包变量，每次 portal 调用更新
      let latestContentRef: ((el: any) => void) | null = null
      const portalPanelRef = (el: HTMLElement | null) => {
        panelRef(el)
        if (latestContentRef) latestContentRef(el)
      }
      const portal = (content: VNode, portalKey = 'popover'): VNode | null => {
        if (isDisabled()) return null
        const now = isOpen()
        if (!now) { prevOpen = false; lastEl = null; return null }
        const el = options.el()
        if (!prevOpen || el !== lastEl) {
          if (el) {
            pos.refresh()
          } else {
            queueMicrotask(() => { if (isOpen()) pos.refresh() })
          }
          prevOpen = true
          lastEl = el
        }
        const props = (content.props ?? {}) as Record<string, any>
        latestContentRef = (props.ref as ((el: any) => void) | null) ?? null
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
            ref: portalPanelRef,
          },
        } as VNode
        return createPortal(panel, portalKey)
      }

      return {
        // open 必须是 getter（渲染期读取永远最新）——创建时快照会让
        // popup.open 永远 false（Popconfirm 气泡 --exit 的真实 bug：
        // 组件读 popup.open 判类永远错）
        get open() { return isOpen() },
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
     * 受控输入原语（C3）：useControlled + 内部输入态/选中态。
     * 输入期间 value 由 keyword 管理（不依赖受控 value 回流——父 render 会
     * 重挂 input → 焦点丢失）；选中回填 selectedLabel（Select/AutoComplete 教训）。
     * mount 层调用一次；keyword/selectedLabel 闭包保持跨渲染。
     */
    useControlledInput: function (options: {
      value?: string
      onChange?: (v: string) => void
      name?: string
    }) {
      const selfId = getSelfId(this)
      const ctrl = this.useControlled({ value: options.value, onChange: options.onChange, name: options.name })
      // render 阶段调用（读最新 props）——内部态 Map 缓存跨渲染保持
      if (selfId && !inputStates.has(selfId)) {
        inputStates.set(selfId, { keyword: '', selectedLabel: '' })
        onComponentUnmount((id) => { inputStates.delete(id) })
      }
      const state = selfId ? inputStates.get(selfId)! : { keyword: '', selectedLabel: '' }
      const dirty = () => {
        if (selfId) ctx.ui?.dirty([selfId])
        else ctx.ui?.render()
      }
      return {
        ...ctrl,
        get keyword() { return state.keyword },
        setKeyword(v: string) { state.keyword = v; dirty() },
        get selectedLabel() { return state.selectedLabel },
        setSelectedLabel(v: string) { state.selectedLabel = v; dirty() },
      }
    },

    /**
     * 显隐打开状态机（C4）：trigger/focus/blur 协调——组件层各自造轮子
     * 会踩 focus 开 + click toggle 关的冲突（Select 真实 bug）。默认只开不关
     * （关闭交外部点击/Escape/选中——组件业务语义）；openOnFocus 可选。
     */
    useOpen: function (options: {
      open?: boolean
      onOpenChange?: (open: boolean) => void
      openOnFocus?: boolean
      /** warn 名称（受控缺回调时提示——弹层/受控组件统一） */
      name?: string
    }) {
      const selfId = getSelfId(this)
      // render 阶段调用——非受控内部态 Map 缓存跨渲染保持
      if (selfId && !openStates.has(selfId)) {
        openStates.set(selfId, false)
        onComponentUnmount((id) => { openStates.delete(id) })
      }
      const controlled = options.open !== undefined
      // 受控缺回调 warn：模块级按 name 幂等（对齐 useControlled——受控纪律自动化）
      if (controlled && !options.onOpenChange && options.name && !warnedControlled.has(options.name)) {
        warnedControlled.add(options.name)
        console.warn(
          `[weifuwu/${options.name}] 受控模式（open 已传）但未提供 onOpenChange，交互无法生效。\n` +
          `非受控：去掉 open；受控：传入 onOpenChange={(o) => setOpen(o)}`
        )
      }
      const isOpen = () => (controlled ? !!options.open : (selfId ? openStates.get(selfId) ?? false : false))
      const dirty = () => {
        if (selfId) ctx.ui?.dirty([selfId])
        else ctx.ui?.render()
      }
      const setOpen = (v: boolean) => {
        if (controlled) { options.onOpenChange?.(v); return }
        if (selfId) openStates.set(selfId, v)
        dirty()
      }
      return {
        get open() { return isOpen() },
        setOpen,
        // 弹层/受控双向场景：open getter + setOpen（受控走 onOpenChange）
        // trigger 协调：onClick 只开（focus 开 + click 关冲突教训——关闭交外部）
        triggerProps: {
          onClick: () => setOpen(true),
          onFocus: () => { if (options.openOnFocus) setOpen(true) },
        },
      }
    },

    /**
     * 全屏对话框组合器：退场状态机（open → exit → closed）+ 滚动锁 + 焦点 trap。
     * mount 创建 handle；render 阶段 sync(open) 驱动。Escape 语义留组件层。
     */
    /**
     * 通用显隐状态机：open → exit → closed（animationend 延迟卸载）。
     * useDialog 基于它（+ lock/trap）——状态机单点实现。
     */
    usePresence: function (options?: { name?: string }) {
      const selfId = getSelfId(this)
      let phase: 'closed' | 'open' | 'exit' = 'closed'
      let animEndHandler: (() => void) | undefined

      const finishExit = () => {
        phase = 'closed'
        if (ctx.ui) {
          if (selfId) ctx.ui.dirty([selfId])
          else ctx.ui.render()
        }
      }

      const ref = (el: any) => {
        if (el) {
          // 挂载期挂一次 animationend：enter 结束忽略，exit 结束才真正卸载
          if (!animEndHandler) {
            animEndHandler = () => { if (phase === 'exit') finishExit() }
            el.addEventListener('animationend', animEndHandler)
          }
        } else {
          el?.removeEventListener('animationend', animEndHandler as any)
          animEndHandler = undefined
        }
      }

      return {
        get phase() { return phase },
        ref,
        sync: (open: boolean) => {
          if (open) phase = 'open'
          else if (phase === 'open') phase = 'exit'
          return phase
        },
      }
    },

    useDialog: function (options?: { name?: string }) {
      const selfId = getSelfId(this)
      let focusCleanup: (() => void) | undefined
      let panelEl: HTMLElement | null = null
      // 状态机复用 usePresence（open → exit → closed + animationend 卸载）
      const presence = this.usePresence(options)

      const rootRef = (el: any) => {
        if (el) {
          lockScroll()
          if (panelEl) focusCleanup = trapFocus(panelEl as HTMLElement)
          presence.ref(el)
        } else {
          unlockScroll()
          focusCleanup?.()
          presence.ref(null)
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
        get phase() { return presence.phase },
        rootRef,
        panelRef,
        sync: (open: boolean) => presence.sync(open),
      }
    },

    /**
     * 全局键盘监听：window keydown，mount 注册 + 卸载清理。返回退订函数。
     */
    useGlobalKey: function (handler: (e: KeyboardEvent) => void) {
      const selfId = getSelfId(this)
      if (typeof window === 'undefined') return () => {}
      window.addEventListener('keydown', handler)
      if (selfId) {
        onComponentUnmount((id) => { if (id === selfId) window.removeEventListener('keydown', handler) })
      }
      return () => window.removeEventListener('keydown', handler)
    },

    /**
     * 指针拖拽：pointerdown 捕获 → window pointermove（delta）/pointerup（释放）。
     */
    useDrag: function (options: {
      onStart?: (e: PointerEvent) => void
      onMove: (e: PointerEvent, delta: { x: number; y: number }) => void
      onEnd?: (e: PointerEvent) => void
    }) {
      let startX = 0
      let startY = 0
      let active = false
      const onPointerMove = (e: PointerEvent) => {
        if (!active) return
        options.onMove(e, { x: e.clientX - startX, y: e.clientY - startY })
      }
      const onPointerUp = (e: PointerEvent) => {
        if (!active) return
        active = false
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        options.onEnd?.(e)
      }
      const onPointerDown = (e: PointerEvent) => {
        if (active) return
        // preventDefault：防拖拽期间文本选中（真实鼠标 down 的默认选择行为）
        e.preventDefault()
        active = true
        startX = e.clientX
        startY = e.clientY
        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerUp)
        options.onStart?.(e)
      }
      return { onPointerDown }
    },

    /**
     * 原生 DnD：drop/dragover/dragleave（dragover 自动 preventDefault——否则 drop 不触发）。
     * 返回 dropProps spread 到容器（VNode props，渲染器绑定/卸载自动清理）。
     */
    useDragDrop: function (options: {
      onDrop?: (e: DragEvent) => void
      onDragOver?: (e: DragEvent) => void
      onDragLeave?: (e: DragEvent) => void
      onDragStart?: (e: DragEvent) => void
      onDragEnd?: (e: DragEvent) => void
    }) {
      const dropProps: Record<string, any> = {}
      if (options.onDrop) {
        dropProps.onDrop = (e: DragEvent) => {
          e.preventDefault() // drop 默认行为是打开文件——必须阻止
          options.onDrop!(e)
        }
      }
      if (options.onDragOver) {
        dropProps.onDragOver = (e: DragEvent) => {
          e.preventDefault()
          options.onDragOver!(e)
        }
      }
      if (options.onDragLeave) dropProps.onDragLeave = (e: DragEvent) => options.onDragLeave!(e)

      // 拖拽源侧：draggable + onDragStart/onDragEnd（HTML5 DnD 源元素 props）
      // 注意：拖拽进行中禁止重渲染（渲染替换源元素会中断拖拽）——组件负责遵守
      const dragProps: Record<string, any> = { draggable: true }
      if (options.onDragStart) {
        const userStart = options.onDragStart
        dragProps.onDragStart = (e: DragEvent) => {
          // 全局防文本选中：拖动过程中禁用 user-select（Kanban 教训——
          // 拖拽时浏览器默认选中文本干扰 drop 目标判定）
          if (typeof document !== 'undefined') document.body.classList.add('wf-dragging')
          userStart(e)
        }
      }
      if (options.onDragEnd) {
        const userEnd = options.onDragEnd
        dragProps.onDragEnd = (e: DragEvent) => {
          if (typeof document !== 'undefined') document.body.classList.remove('wf-dragging')
          userEnd(e)
        }
      }
      return { dropProps, dragProps }
    },

    /**
     * 响应式系统偏好（prefers-reduced-motion）。mount 期一次判定（偏好变化极罕见）。
     */
    useReducedMotion: function (): boolean {
      return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    },

    /**
     * 元素动画完成回调（animationend）：stableRef——ref 挂载绑定、卸载清理、引用恒定。
     * { once }：入场 settle（一次性）；默认常驻（退场判断）。
     */
    useAnimationEnd: function (cb: () => void, opts?: { once?: boolean }) {
      let el: HTMLElement | null = null
      const handler = () => {
        cb()
        if (opts?.once && el) el.removeEventListener('animationend', handler)
      }
      const ref = (node: any) => {
        if (node) {
          el = node
          node.addEventListener('animationend', handler)
        } else if (el) {
          el.removeEventListener('animationend', handler)
          el = null
        }
      }
      return ref
    },

    /**
     * 数值补间：rAF + ease + reduced-motion 直落终值。目标变化自动补间。
     */
    useTween: function (target: number, opts?: { duration?: number; ease?: 'linear' | 'easeOutCubic' }) {
      const selfId = getSelfId(this)
      const reduced = this.useReducedMotion()
      const duration = opts?.duration ?? 400
      const easeFn = opts?.ease === 'linear'
        ? (p: number) => p
        : (p: number) => 1 - Math.pow(1 - p, 3) // easeOutCubic
      let rafId: number | undefined
      let currentTarget = target
      const handle: { value: number; reset: (to: number) => void } = {
        value: reduced ? target : 0,
        reset: () => {},
      }
      // 每帧渲染（rAF 只更新闭包 value，不触发渲染则 DOM 冻结——真实浏览器暴露）
      const rerender = () => {
        if (ctx.ui) {
          if (selfId) ctx.ui.dirty([selfId])
          else ctx.ui.render()
        }
      }

      const tweenTo = (to: number) => {
        currentTarget = to
        if (reduced) { handle.value = to; rerender(); return }
        if (to === handle.value) return // 同值不启动（value=0 首帧无动画）
        if (rafId) cancelAnimationFrame(rafId)
        const from = handle.value
        const t0 = performance.now()
        const step = (t: number) => {
          const p = Math.min(1, (t - t0) / duration)
          handle.value = Math.round(from + (to - from) * easeFn(p))
          if (p < 1) {
            rafId = requestAnimationFrame(step)
            rerender()
          } else {
            rafId = undefined
            rerender()
          }
        }
        rafId = requestAnimationFrame(step)
      }

      // 幂等 reset：目标相同且动画运行中 → 不重启（render 每帧调用安全；
      // StatCard animating 守卫的收敛——动画运行中重渲染不打断现有循环）
      handle.reset = (to: number) => {
        if (to === currentTarget && rafId) return
        tweenTo(to)
      }

      // 首次补间（mount 后微任务启动——避免 render 期 rAF 累积）
      queueMicrotask(() => tweenTo(target))

      return handle
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
