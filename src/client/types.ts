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
export interface WfuiContext {
  [key: string]: unknown

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
