/**
 * weifuwu/client 类型定义
 */

import type { UseChatHandle, UseChatOptions } from './use-chat.ts'
import type { VNode } from './vnode.ts'
import type { Placement } from './popup.ts'

/** 弹层位置跟踪配置 — 供 ctx.ui.usePopupPosition 使用 */
export interface PopupPositionOptions {
  /** 锚定元素 getter（通常是 ref 保存的触发元素） */
  el: () => HTMLElement | null
  /** 弹层是否显示（getter，闭包读取最新状态） */
  isOpen: () => boolean
  /** rect → fixed 坐标（可返回 width 等附加属性） */
  compute: (rect: DOMRect) => { top: number; left: number; width?: number }
  /** 弹层面板元素 getter（可选）：提供后坐标自动夹紧到视口内（防超高/超宽时底部按钮不可点） */
  panel?: () => HTMLElement | null
  /** 视口边缘安全边距（px，默认 8） */
  margin?: number
}

/** 响应式状态容器（createReactiveState 返回值）——深度 Proxy：任意层级赋值触发 dirty */
export interface ReactiveState {
  /** 订阅状态变更（任意层级赋值/删除触发）；返回退订函数 */
  __watch: (cb: () => void) => () => void
  [key: string]: any
}

/** 异步取数工具返回值 — ctx.ui.useAsync()（data/loading/error 响应式，reload 重跑） */
export interface UseAsyncHandle<T = any> {
  data?: T
  loading: boolean
  error?: unknown
  reload: () => void
}

/** 弹层位置跟踪器 — usePopupPosition 的返回值 */
export interface PopupPosition {
  top: number
  left: number
  width?: number
  /** 立即重算一次坐标（不触发渲染，调用方负责 render） */
  refresh: () => void
}

/** 弹层触发方式 — usePopup 的 trigger */
export type PopupTrigger = 'hover' | 'click' | 'longpress'

/** 弹层组合器配置 — 供 ctx.ui.usePopup 使用 */
export interface UsePopupOptions {
  /** 触发方式（支持 getter——动态读最新 props；hover 在触屏环境自动降级为 tap） */
  trigger: PopupTrigger | (() => PopupTrigger)
  /** 弹出方向（支持 getter——动态读最新 props），默认 'bottom' */
  placement?: Placement | (() => Placement)
  /** 自由定位（支持 getter）：提供则忽略 placement，直接用坐标（如右键菜单光标处） */
  position?: () => { x: number; y: number }
  /** 水平对齐：center=居中于触发元素（默认），start=左对齐（Menubar 面板用） */
  center?: boolean
  /** 与触发元素间距（px，默认 6） */
  gap?: number
  /** 视口安全边距（px，默认 8） */
  margin?: number
  /** 锚定元素 getter（ref 保存的触发元素） */
  el: () => HTMLElement | null
  /** 是否打开（getter） */
  isOpen: () => boolean
  /** 非受控：设置打开状态（调用方负责 render/dirty） */
  setOpen: (open: boolean) => void
  /** 受控（可选，boolean 或 getter——动态读最新 props）：传了则组件内不直接改状态，只回调 onOpenChange */
  open?: boolean | (() => boolean)
  /** 受控回调（可选） */
  onOpenChange?: (open: boolean) => void
  /** 面板宽度（px，可选）：自动 clamp 到视口（≤ 100vw - 32px） */
  width?: number
  /** 点外部关闭（默认 true） */
  closeOnOutside?: boolean
  /** Escape 关闭（默认 true） */
  closeOnEscape?: boolean
  /** 长按触发时长（ms，仅 trigger='longpress'，默认 500） */
  longPressDuration?: number
  /** 打开触发回调（longpress 计时到/右键兼容时调用，携带光标坐标——右键菜单定位用） */
  onTrigger?: (e: { clientX: number; clientY: number }) => void
  /** hover 打开延迟（ms 或 getter——动态读最新 props，仅 trigger='hover'，默认 0） */
  openDelay?: number | (() => number)
  /** hover 关闭延迟（ms 或 getter，仅 trigger='hover'，默认 0） */
  closeDelay?: number | (() => number)
  /** 禁用（getter）：禁用时所有触发不生效且 portal 不渲染 */
  disabled?: () => boolean
}

/** 弹层组合器返回值 — usePopup */
export interface UsePopupHandle {
  /** 当前打开状态（渲染期读取） */
  open: boolean
  setOpen: (open: boolean) => void
  /** spread 到触发/包装元素：触发（hover 门控/tap 降级/longpress）+ Escape + focus */
  wrapProps: Record<string, any>
  /** 包装弹层内容：定位 + 视口/宽度 clamp + portal；关闭时返回 null */
  portal: (content: VNode, portalKey?: string) => VNode | null
  /** 立即重算坐标（打开/动画结束后调用） */
  refresh: () => void
}

/** 长按配置 — 供 ctx.ui.useLongPress 使用 */
export interface UseLongPressOptions {
  /** 长按时长（ms，默认 500） */
  duration?: number
  /** 长按触发回调（接收触发事件，含 clientX/clientY） */
  onLongPress: (e?: any) => void
}

/** 长按返回的触发 props — spread 到目标元素 */
export interface UseLongPressHandle {
  onPointerDown: (e: any) => void
  onPointerUp: (e: any) => void
  onPointerLeave: (e: any) => void
  onPointerMove: (e: any) => void
  /** 桌面右键兼容（移动端浏览器 contextmenu 也会触发） */
  onContextMenu: (e: any) => void
}

/** 可视视口（visualViewport）状态 — useVisualViewport 返回值 */
export interface VisualViewportHandle {
  /** 可视视口高度（visualViewport.height；无 visualViewport 时 = innerHeight） */
  height: number
  /** 可视视口相对布局视口顶部的偏移（键盘弹起时 > 0） */
  offsetTop: number
  /** 键盘是否弹起（height < 0.9 × innerHeight 近似） */
  keyboardOpen: boolean
}

/** 可见性观察配置 — 供 ctx.ui.useInView 使用（IntersectionObserver 封装，替代 scroll 监听） */
export interface UseInViewOptions {
  /** IO 根元素 getter（默认视口；滚动容器场景传 target） */
  root?: () => Element | null
  /** IO rootMargin（支持函数——动态读最新 props，observe 时求值） */
  rootMargin?: string | (() => string)
  /** IO threshold（默认 0；支持函数——动态读最新 props） */
  threshold?: number | number[] | (() => number | number[])
  /** IO 触发回调（entry.boundingClientRect 读取安全，非 scroll handler） */
  onChange?: (entry: IntersectionObserverEntry, isIn: boolean) => void
}

/** 可见性观察器 — useInView 的返回值 */
export interface UseInViewHandle {
  /** 是否在可见区（响应式：变化自动 dirty 当前组件） */
  isIn: boolean
  /** 是否已就绪（首次 IO 回调完成；未就绪时 isIn 为初始 false，组件应保守处理） */
  ready: boolean
  /** 观察元素（ref 挂载时调用；传 null 断开） */
  observe(el: HTMLElement | null): void
  /** 重建观察（rootMargin 等配置变化后调用） */
  refresh(): void
  /** 手动断开观察 */
  disconnect(): void
}

/** 滚动位置跟踪配置 — 供 ctx.ui.useScrollPosition 使用 */
export interface UseScrollPositionOptions {
  /** 滚动容器 getter（默认 window；内部滚动容器传 ref 元素） */
  getScroller?: () => HTMLElement | Window
}

/** 滚动位置跟踪器 — useScrollPosition 的返回值（y 响应式，变化自动 dirty 当前组件） */
export interface UseScrollPositionHandle {
  /** 滚动位置（px，scrollY/scrollTop） */
  y: number
  /** 手动重读一次滚动位置（不触发渲染） */
  refresh(): void
}

/** 应用上下文 */
/**
 * 浏览器环境抽象（ctx.browser）——组件不直接引用 window/document：
 * ① SSR 安全（shim 返回安全默认）② 测试可 mock（jsdom 无关）③ 复制等
 * 重复模式统一。客户端由 createClientBrowser 实现，SSR 由 createSsrContext 注入。
 */
export interface BrowserEnv {
  /** 当前焦点元素（键盘导航） */
  activeElement(): HTMLElement | null
  /** 按 id 查询元素 */
  byId(id: string): HTMLElement | null
  /** CSS 选择器查询元素 */
  query(sel: string): HTMLElement | null
  /** 创建元素 */
  createElement<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] | null
  /** body 追加/移除 */
  bodyAppend(el: Node): void
  bodyRemove(el: Node): void
  /** 复制文本（clipboard API + execCommand 降级，统一组件重复实现） */
  copyText(text: string): Promise<boolean>
  /** execCommand（富文本编辑器） */
  execCommand(cmd: string, value?: string): boolean
  /** 编辑器选区文本 */
  selectionText(): string | null
  /** 编辑器选区对象（完整 Selection——Editor 需要 range 操作） */
  getSelection(): Selection | null
  /** 视口高度 */
  viewportHeight(): number
  /** 滚动量（scrollingElement 优先） */
  scrollTop(): number
  /** location.hash */
  hash(): string
  setHash(h: string): void
  /** 定时器（SSR no-op） */
  timeout(fn: () => void, ms: number): number
  /** document.documentElement（主题应用） */
  rootElement(): HTMLElement | null
  /** localStorage 读取（SSR/隐私模式返回 null） */
  storageGet(key: string): string | null
  /** localStorage 写入（SSR/隐私模式 no-op） */
  storageSet(key: string, value: string): void
}

export interface WfuiContext {
  [key: string]: unknown

  /** 浏览器环境抽象（SSR shim 安全默认）——组件禁直接 window/document */
  browser?: BrowserEnv

  /** UI 框架能力（由 createApp.mount 注入） */
  ui: {
    /** 触发组件重渲染（同步，无参 = 当前组件） */
    render: (ids?: string[]) => void
    /** 异步触发组件重渲染（微任务批处理，无参 = 当前组件） */
    dirty: (ids?: string[]) => void
    /** 创建响应式状态容器：$.x = val 自动触发 dirty() */
    $: () => Record<string, any>
    /**
     * AI 对话会话：$ 超集（会话语义 + 工具调用内嵌 + HITL 审批）
     *
     * ```tsx
     * const $ = ctx.ui.useChat({ url: '/api/chat', approveUrl: '/api/approve' })
     * // $.messages / $.input / $.streaming / $.error / $.usage / $.step
     * // $.send() / $.stop() / $.retry() / $.clear() / $.approve(decision, note?)
     * ```
     */
    useChat: (options: UseChatOptions) => UseChatHandle
    /** 响应式媒体查询：注册监听，值变化时自动 dirty（立即回调一次当前值） */
    useMedia: (query: string, callback: (matches: boolean) => void) => void
    /** 响应式断点：mobile/tablet/desktop 或自定义断点，值变化时自动 dirty */
    useBreakpoint: (bpsOrCallback: Record<string, string> | ((vp: string) => void), callback?: (vp: string) => void) => void
    /** 弹层位置跟踪：滚动/resize 时自动重算 fixed 坐标 */
    usePopupPosition: (options: PopupPositionOptions) => PopupPosition
    /**
     * 弹层组合器：收敛 open 状态 + 触发（hover/tap 降级/longpress）+ Escape +
     * 外部点击 + 定位/视口 clamp + portal。移动端友好由构造保证。
     *
     * ```ts
     * const popup = ctx.ui.usePopup({
     *   trigger: 'hover',          // 触屏自动降级 tap
     *   el: () => wrapEl,
     *   isOpen: () => $.open,
     *   setOpen: (v) => { $.open = v; ctx.ui.render() },
     *   width: 320,                // 自动 clamp 视口
     * })
     * return () => h('div', { ref: wrapRef, ...popup.wrapProps }, [
     *   children, popup.portal(h('div', { class: 'wf-panel' }, content)),
     * ].filter(Boolean))
     * ```
     */
    usePopup: (options: UsePopupOptions) => UsePopupHandle
    /** 当前设备是否支持 hover（matchMedia '(hover: hover)'，mount 期一次判定） */
    useHoverCapable: () => boolean
    /**
     * 稳定 ref 引用（根治内联 ref 陷阱）：mount 作用域持有，跨渲染引用恒等。
     * ref-diff 在 ref 函数引用变化时调用旧 ref(null)——内联 ref 每次渲染都是新函数，
     * 清理逻辑（退订/dispose）会反复触发而非仅在卸载时。
     *
     * ```tsx
     * const listRef = ctx.ui.useStableRef(
     *   (el) => { instance = init(el) },
     *   () => { instance?.dispose() },
     * )
     * return () => h('div', { ref: listRef })
     * ```
     */
    useStableRef: (init: (el: HTMLElement | null) => void, cleanup?: () => void) => (el: any) => void
    /**
     * 全局键盘监听（window keydown）：mount 注册、组件卸载自动清理；返回退订函数。
     * 覆盖 Command 全局快捷键 / Img preview Escape 等 document/window 级键盘场景。
     *
     * ```tsx
     * ctx.ui.useGlobalKey((e) => { if (e.key === 'k' && (e.ctrlKey || e.metaKey)) toggle() })
     * ```
     */
    useGlobalKey: (handler: (e: KeyboardEvent) => void) => () => void
    /**
     * 指针拖拽（pointerdown 捕获 → window pointermove/up，up 自动释放）：
     * 覆盖 Resizable 等拖拽场景。返回 props spread 到拖拽把手。
     *
     * ```tsx
     * const drag = ctx.ui.useDrag({ onMove: (_e, d) => { setSize(startSize + d.x) } })
     * return () => h('div', { class: 'handle', ...drag })
     * ```
     */
    useDrag: (options: {
      onStart?: (e: PointerEvent) => void
      onMove: (e: PointerEvent, delta: { x: number; y: number }) => void
      onEnd?: (e: PointerEvent) => void
    }) => { onPointerDown: (e: PointerEvent) => void }
    /**
     * 原生 DnD（drop/dragover/dragleave，dragover 自动 preventDefault）：
     * 覆盖 FileUpload 等拖放区。返回 dropProps spread 到容器（VNode props，渲染器绑定/清理）。
     *
     * ```tsx
     * const { dropProps } = ctx.ui.useDragDrop({ onDrop: (e) => files(e.dataTransfer) })
     * return () => h('div', { class: 'zone', ...dropProps })
     * ```
     */
    useDragDrop: (options: {
      onDrop?: (e: DragEvent) => void
      onDragOver?: (e: DragEvent) => void
      onDragLeave?: (e: DragEvent) => void
    }) => { dropProps: Record<string, any> }
    /**
     * 可视视口跟踪（visualViewport）：键盘弹起/缩放时自动更新 + dirty。
     * 无 visualViewport（桌面）降级 innerHeight。fixed 底部栏防键盘遮挡用。
     */
    useVisualViewport: () => VisualViewportHandle
    /**
     * 长按手势：pointerdown 按住 duration 触发，提前松开/位移取消，桌面右键兼容。
     * 返回的 props spread 到目标元素。
     */
    useLongPress: (options: UseLongPressOptions) => UseLongPressHandle
    /**
     * 可见性观察（IntersectionObserver 封装）：替代组件自建 scroll 监听。
     * IO 在合成器线程评估，滚动/尺寸变化自动触发，无 scroll-linked 定位警告。
     *
     * ```tsx
     * const inView = ctx.ui.useInView({
     *   rootMargin: () => `-${propsRef.offsetTop ?? 0}px 0px 0px 0px`,
     * })
     * const ref = (el) => inView.observe(el)
     * return () => h('div', { ref }, fixed = !inView.isIn ...)
     * ```
     */
    useInView: (options: UseInViewOptions) => UseInViewHandle
    /**
     * 滚动位置跟踪（全局 scroll 监听 + rAF 节流，仿 usePopupPosition）：
     * 返回响应式 scrollY/scrollTop，变化自动 dirty 当前组件。替代组件自建 scroll 监听。
     *
     * ```tsx
     * const scroll = ctx.ui.useScrollPosition({ getScroller: () => wrapEl })
     * return () => h('div', { ref }, fixed = scroll.y >= threshold)
     * ```
     */
    useScrollPosition: (options: UseScrollPositionOptions) => UseScrollPositionHandle
    /**
     * 异步取数工具（mount 阶段调用）：loading/error 自动管理 + 数据就绪自动渲染。
     *
     * ```tsx
     * const list = ctx.ui.useAsync(() => ctx.api.get<User[]>('/users'))
     * return () => list.loading ? h(Loading) : list.data?.map(...)
     * ```
     * data/loading/error 响应式；reload() 重跑；组件卸载后旧 Promise resolve 不再触发渲染。
     */
    useAsync: <T = any>(fetcher: () => Promise<T>) => UseAsyncHandle<T>
    /**
     * 受控/非受控状态统一（收敛组件库重复的受控判定 + 缺回调 warn）：
     * value !== undefined → 受控（setValue 只走 onChange，值由父组件回流）；
     * 否则 → 内部状态 + 自动 render。受控但缺 onChange 时 console.warn 一次（按 name 幂等）。
     *
     * ```tsx
     * const ctrl = ctx.ui.useControlled({ value: props.value, onChange: props.onChange, name: 'Collapse' })
     * const open = ctrl.value ?? false
     * // 交互：ctrl.setValue(!open)
     * ```
     */
    useControlled: <T>(options: { value?: T; onChange?: (v: T) => void; name?: string }) => {
      value: T | undefined
      setValue: (v: T) => void
      controlled: boolean
    }
    /**
     * 全屏对话框组合器（收敛 Modal/Drawer 的退场状态机 + 滚动锁 + 焦点 trap）：
     * mount 创建，render 阶段 sync(open) 驱动状态机；组件只管布局。
     *
     * ```tsx
     * const dialog = ctx.ui.useDialog({ name: 'Modal' })
     * return (props) => {
     *   const phase = dialog.sync(props.open)
     *   if (phase === 'closed') return null
     *   return createPortal(h('div', {
     *     ref: dialog.rootRef,
     *     class: `wf-modal ${phase === 'exit' ? 'wf-modal--exit' : 'wf-modal--enter'}`,
     *     onKeyDown: (e) => { if (e.key === 'Escape') props.onClose?.() },
     *   }, [overlay, h('div', { class: 'wf-modal-content', ref: dialog.panelRef }, children)]), 'modal')
     * }
     * ```
     * Escape 语义（危险操作差异）留在组件层——诚实裁剪。
     */
    /** 通用显隐状态机（非 dialog 浮层/面板）：open → exit → closed（animationend 延迟卸载）。
     * useDialog 是其对话框特例（+ lockScroll/trapFocus）。mount 创建，render 阶段 sync(open)。 */
    usePresence: (options?: { name?: string }) => {
      phase: 'closed' | 'open' | 'exit'
      /** 挂到根元素（animationend 监听：exit 结束才真正卸载） */
      ref: (el: any) => void
      /** render 阶段同步 open → 返回当前 phase */
      sync: (open: boolean) => 'closed' | 'open' | 'exit'
    }
    useDialog: (options?: { name?: string }) => {
      phase: 'closed' | 'open' | 'exit'
      /** 挂到 portal 根（lockScroll + animationend 退场监听） */
      rootRef: (el: any) => void
      /** 挂到焦点 trap 目标（对话框面板） */
      panelRef: (el: any) => void
      /** render 阶段同步 open → 返回当前 phase */
      sync: (open: boolean) => 'closed' | 'open' | 'exit'
    }
    /** 响应式系统偏好（prefers-reduced-motion）：JS 动画（rAF/tween）侧跳过用。
     * CSS 动画已有 _base.css 全局降级（0.01ms）——此原语覆盖 JS 动画路径。 */
    useReducedMotion: () => boolean
    /** 元素动画完成回调（animationend）：stableRef 形态——ref 挂载绑定、卸载清理、引用恒定。
     * `{ once: true }` 一次性（入场 settle）；默认常驻（退场判断，回调读状态机 phase）。
     * 唯一动画事件入口（组件内禁直接 addEventListener('animationend')）。
     *
     * ```tsx
     * const settleRef = ctx.ui.useAnimationEnd(() => pos.refresh(), { once: true })
     * return () => h('div', { class: 'wf-panel', ref: settleRef })
     * ```
     */
    useAnimationEnd: (cb: () => void, opts?: { once?: boolean }) => (el: any) => void
    /** 数值补间（rAF + ease + reduced-motion 直落终值）：count-up / 进度 / 指示器。
     * 目标值变化自动补间；返回 `{ value }`（当前值，render 读）。 */
    useTween: (target: number, opts?: { duration?: number; ease?: 'linear' | 'easeOutCubic' }) => {
      value: number
      /** 重设目标（幂等：同目标且动画运行中不重启——render 每帧调用安全） */
      reset: (to: number) => void
    }
    /** 注册组件实例的自定义语义 ID，同名冲突抛错 */
    selfId: (name: string) => void
    /** 当前组件实例 ID（仅供内部使用，通过 ctx 扩展注入） */
    _selfId?: string
    /** 当前组件 VNode 引用（仅供内部使用，通过 ctx 扩展注入） */
    _selfVNode?: any
  }

  /** 路由（由 router 中间件注入） */
  route?: {
    path: string
    params: Record<string, string>
    query: Record<string, string>
    [key: string]: any
  }

  /** 应用方法 */
  app?: {
    navigate: (path: string) => void
    [key: string]: any
  }

  /** WebSocket 客户端（由 ws 中间件注入） */
  ws?: {
    send: (msg: any) => void
    onMessage: (fn: (msg: any) => void) => () => void
    isConnected: boolean
    [key: string]: any
  }

  /** API 客户端（由 api 中间件注入） */
  api?: {
    get: <T = any>(url: string, opts?: any) => Promise<T>
    post: <T = any>(url: string, body?: any, opts?: any) => Promise<T>
    put: <T = any>(url: string, body?: any, opts?: any) => Promise<T>
    patch: <T = any>(url: string, body?: any, opts?: any) => Promise<T>
    delete: <T = any>(url: string, opts?: any) => Promise<T>
    [key: string]: any
  }

  /** 数据管道（由 createApp 注入）：ctx.data.get(key, fetcher) */
  data?: {
    /**
     * 获取数据：
     *   - SSR：服务端真 fetch，结果序列化进 __DATA__
     *   - hydration：从 __DATA__ 缓存同步命中（工厂 await 微任务即 resolve）
     *   - SPA：未命中则触发 fetcher，同 key 并发请求合并
     *
     * key 约定即 URL（`/api/posts/1`），天然唯一。
     */
    get: <T = any>(key: string, fetcher?: () => Promise<T>) => Promise<T>
    /** 向缓存写入值（如 hydration 种子） */
    set: (key: string, value: unknown) => void
    /** 是否存在缓存（未触发 fetch） */
    has: (key: string) => boolean
    [key: string]: any
  }

  /** 认证状态 */
  auth?: {
    token: string | null
    user: any
    isLoggedIn: boolean
    login: (token: string, user: any, refreshToken?: string) => void
    logout: () => void
    [key: string]: any
  }

  /** 命令式确认（由 components 的 confirm() 中间件注入）：ctx.confirm(msg) → Promise<boolean> */
  confirm?: (message: string, options?: Record<string, any>) => Promise<boolean>
  /** 命令式轻提示（由 components 的 toast() 中间件注入）：ctx.toast(msg, type?, duration?, action?) */
  toast?: (message: string, type?: string, duration?: number, action?: { label: string; onClick: () => void }) => void
}

/** 中间件签名 */
/**
 * 前端中间件：输入 ctx 需要 I，输出 ctx 注入 O（链式累积，createApp().use() 类型自动合并）
 *   api()   → AppMiddleware<{}, ApiInjected>   注入 ctx.api
 *   router()→ AppMiddleware<{}, RouteInjected> 注入 ctx.route / ctx.app
 */
export type AppMiddleware<I extends object = {}, O extends object = I> = (
  ctx: WfuiContext & I,
) => (WfuiContext & O) | Promise<WfuiContext & O>

/** 路由定义 */
export interface RouteDef {
  path: string
  component?: (props: any, ctx: WfuiContext) => any
  layout?: (props: any, ctx: WfuiContext) => any
  children?: RouteDef[]
  auth?: boolean
  title?: string
  [key: string]: any
}

/** 扩展 ctx — 创建新对象，原 ctx 的 getter 通过原型链继承 */
export function extendCtx<T extends Record<string, unknown>>(
  ctx: WfuiContext,
  fields: T,
): WfuiContext & T {
  return Object.assign(Object.create(ctx), fields) as WfuiContext & T
}
