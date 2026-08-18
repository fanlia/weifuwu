/**
 * vdom4 types — 核心类型（独立引擎——不兼容 vdom2/vdom3）
 *
 * 设计原则（2026-12 方向调整）：
 * ① vnode 纯数据——无任何回填字段（el/_id/_render/_child/_anchorId... 全部在影子）
 * ② **renderFn 同步**——`(props) => VNode | null`（非 Promise）——渲染管线的推进
 *    不依赖用户异步完成——挂起超时 hack（Promise.race + setTimeout rej）从类型上
 *    不可能——异步边界唯一 = ctx.data（管道管理——命中同步/未命中返回加载态）
 * ③ 组件工厂（mount 一次）可 await ctx.data（管道保证 resolve/reject——不挂起）
 */

/** 组件（两阶段——vdom4 方式）：
 *  工厂 = mount（一次——初始化状态/订阅/数据预取（await ctx.data——管道保证））
 *  renderFn = 每次渲染（同步或 async——await 只允许 ctx.data（命中同步/管道管理）——
 *  无挂起竞速——渲染管线的推进不依赖用户异步完成（数据未就绪输出加载态）） */
export type Component<P = Record<string, unknown>, C = Ctx> = (
  initProps: P,
  ctx: C,
) => RenderFn<P> | Promise<RenderFn<P>>

/** renderFn：同步或 async（await 只允许 ctx.data——管道保证 resolve——挂起不可能；
 *  无 Promise.race 竞速——挂起 = 非 ctx.data await 的用户违规——dev 文档红线） */
export type RenderFn<P = Record<string, unknown>> = (props: P) => VNode | null | Promise<VNode | null>

/** vnode——纯数据（无回填字段——可自由克隆/比较/序列化） */
export interface VNode {
  /** native 标签名 / 组件函数 / Fragment/Portal 符号 */
  type: string | symbol | Component
  props: Record<string, unknown>
  key: string | null
  children?: VNodeChild[]
}

export type VNodeChild = VNode | string | number | null | undefined | boolean | VNodeChild[]

export const Fragment: unique symbol = Symbol('v4-fragment')
export const Portal: unique symbol = Symbol('v4-portal')
export type PortalVNode = VNode & { type: typeof Portal; portalKey?: string | null }

/** children 读取（h 存 props.children——拍平嵌套数组——空洞保留） */
export function childrenOf(v: VNode): Array<VNode | string | number | null | undefined | boolean> {
  const c = v.children ?? (v.props?.children === undefined ? [] : v.props.children)
  return (Array.isArray(c) ? c.flatMap((x) => Array.isArray(x) ? x.flatMap((y) => Array.isArray(y) ? y : [y]) : [x]) : [c]) as Array<VNode | string | number | null | undefined | boolean>
}

// ── 命令（diff 的产物——纯数据——DOM = fold(命令)） ──

/** 命令（id = 节点路径（确定性——root.0.a0 等）；vn 仅内部引用（序列化剥离）） */
export type Command =
  | { op: 'create'; id: string; tag: string; vn: VNode }
  | { op: 'createText'; id: string; value: string }
  | { op: 'createAnchor'; id: string }
  | { op: 'insert'; id: string; parent: string; ref: string | null; after?: boolean }
  | { op: 'setProp'; id: string; key: string; value: unknown; prev?: unknown }
  | { op: 'setText'; id: string; value: string }
  | { op: 'remove'; id: string }
  | { op: 'clearSlot'; anchorId: string; parent: string; nextAnchorId: string | null }
  | { op: 'moveSlot'; anchorId: string; parent: string; ref: string | null; nextAnchorId: string | null }
  | { op: 'unmountComp'; compId: string }

// ── 组件 ctx（vdom4 面——非兼容） ──

/** 数据管道（唯一异步边界——缓存/并发合并/错误/超时由管道管理——
 *  **三场景**：SSR（服务端真 fetch——渲染后收集种子）/ hydration（客户端 preload
 *  种子——同步命中——零二次 fetch）/ SPA（未命中 fetch）） */
export interface DataPipe {
  /** 取数：命中同步返回（Promise.resolve）——未命中调 fetcher 缓存并发合并；
   *  未命中且无 fetcher（SPA 默认 fetch）——管道管理——不挂起（错误/超时 reject） */
  get<T = unknown>(key: string, fetcher?: () => Promise<T>): Promise<T>
  set<T = unknown>(key: string, value: T): void
  /** 数据是否已就绪（渲染期判断——未就绪输出加载态——管线不等待） */
  has(key: string): boolean
  /** 种子注入（hydration——SSR 收集的数据预热——命中同步——零二次 fetch） */
  preload(seed: Record<string, unknown>): void
  /** 收集已解析数据（SSR——渲染后取种子——序列化进 __DATA__） */
  seed(): Record<string, unknown>
}

/** 组件 ctx（vdom4 面） */
export interface Ctx {
  /** 统一渲染原语（root/comp/语义 id 同一入口——串行调度 + epoch） */
  render(ids?: string[]): void
  /** 数据管道（唯一异步边界） */
  data: DataPipe
  /** 卸载清理注册 */
  onUnmount(fn: () => void): void
  /** 浏览器环境 */
  browser: unknown
  /** hooks 面（浏览器能力——形状 vdom4 化） */
  ui: unknown
  /** 路由参数（页面组件） */
  params?: Record<string, string>
  /** 中间件注入面（app/i18n/auth...——可选链消费） */
  [key: string]: unknown
}
