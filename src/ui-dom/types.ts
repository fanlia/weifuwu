/**
 * weifuwu/ui-dom 独立类型 — 完全独立于 src/client（零 import 依赖）
 *
 * 定稿架构（design/ui-architecture.md）：
 *   req = window.location，res = VNode，serveUI = VDOM（落地机制），params/query 在 ctx
 *   handler = 异步组件：async (location, ctx) => vnode（$ 有效）
 *   middleware = 两阶段 async：(location, ctx, children) => async (location, ctx) => vnode
 */

/** UI 请求 = 浏览器位置（window.location，浏览器原生，不包装） */
export type UIRequest = Location

/** UI 上下文 — 中间件注入 + 路由参数 */
export interface UIContext {
  /** 路由参数（UIRouter 匹配后注入，对齐后端 ctx.params） */
  params: Record<string, string>
  /** 查询参数（对齐后端 ctx.query） */
  query: Record<string, string>
  /** 响应式状态容器：$.x = val 自动触发重渲染 */
  ui: {
    $: () => Record<string, any>
    /** 手动标记当前组件脏（异步批量重渲染）——闭包 let 变量手动模式 */
    dirty: () => void
    /** 立即同步重渲染（当前组件或路由级）——需要马上拿到最新 DOM（测量/动画） */
    render: () => void
    /** 数据管道：缓存 + in-flight 合并（重渲染命中缓存，保证"外层只使用一次"） */
    data: {
      get: <T>(key: string, fetcher?: () => Promise<T>) => Promise<T | undefined>
      set: (key: string, value: unknown) => void
      has: (key: string) => boolean
    }
  }
  /** 任意中间件注入字段 */
  [key: string]: unknown
}

/** UI 响应 = VNode（数据结构）——serveUI（VDOM）负责落地到 DOM */
export type UIResponse = VNode | null

/**
 * UI 路由处理器 = 异步组件：async (location, ctx) => vnode
 *
 * - 首次调用 = mount（ctx.ui.data.get 取数 + ctx.ui.$ 创建 + 初始化，只一次）
 * - $ 赋值 = render（data 缓存命中 + $ 路由实例复用 → 新 VNode → patch）
 * - 路由变化 = 新路由实例（新 mount，新 $）
 *
 * 对齐后端 handler(req, ctx) => Response。
 */
export type UIHandler<C extends object = {}> = (
  location: UIRequest,
  ctx: UIContext & C,
) => Promise<UIResponse> | UIResponse

/**
 * UI 中间件 = 两阶段 async（对齐组件模型外层 mount / 内层 render）：
 *   - 外层 `async (location, ctx, children) => ...`：mount 一次——接收 children（下一层 handler）
 *   - 内层 `async (location, ctx) => vnode`：每次渲染——调 children(location, ctx) 得子 VNode 再包装
 * layout 与 SSR 都是这种中间件。
 */
export type UIMiddleware<I extends object = {}, O extends object = {}> = (
  location: UIRequest,
  ctx: UIContext & I,
  children: UIHandler<O>,
) => Promise<UIHandler<O>> | UIHandler<O>

/** UI 路由定义（UIRouter 内部存储） */
export interface UIRouteDef {
  path: string
  handler: UIHandler<any>
  title?: string
}

/** VNode — 独立数据结构（不依赖 src/client/vnode） */
export interface VNode {
  type: string | ((props: any, ctx: any) => any) | symbol
  props: Record<string, any>
  key?: string
  /** 渲染后的 DOM 节点 */
  el?: Node
  /** 子 VNode 缓存 */
  _child?: VNode | VNode[] | null
  /** 组件实例 id */
  _id?: string
  /** 组件 render 函数（两阶段内层） */
  _render?: (props: Record<string, any>) => VNode | null
  /** 组件输出的 DOM 节点（重渲染定位用） */
  _refNode?: Node | null
}

/** VNode 子节点合法值 */
export type VNodeChild = VNode | string | number | boolean | null | undefined | VNodeChild[]
