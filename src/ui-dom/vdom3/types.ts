/**
 * vdom3 核心类型——vnode 树（声明式）+ 渲染事件流（执行层）
 *
 * 架构：vnode + stream
 *   状态 → renderFn → vnode 树（声明式——组件输出完整树，与 vdom2 同模型）
 *   → 渲染器：树 → **事件流**（CREATE/INSERT/PROP_UPDATE/TEXT_UPDATE/REMOVE...）
 *   → 执行器：消费事件 → DOM
 *
 * 事件流是引擎本体：从 location 到 DOM 的每一步都是事件——可记录/回放/取消/断言。
 * 不变量：DOM = fold(事件流)——给定初始 DOM + 事件流 = 任意时刻 DOM。
 */

// ── vnode 树（声明式——与 vdom2 同模型） ──

/** vdom3 组件 ctx（正式契约——组件可见最小面 + 中间件扩展（index 签名））
 *  render：调度自身重渲染（同 tick 合并）——render-only 唯一触发
 *  onUnmount：卸载清理注册（COMP_UNMOUNT 时执行）
 *  ui：vdom2 兼容面（hooks shim——组件库零改动运行）
 *  扩展字段（ctx.app/i18n/data/auth...）经 index 签名消费（可选链——中间件注入） */
export interface V3Ctx {
  render(): void
  onUnmount(fn: () => void): void
  ui: V3Ui
  [key: string]: unknown
}

/** ctx.ui 兼容面（vdom2 hooks 契约——组件库零改动运行）
 *  方法签名继承 vdom2 ui（hooks 类型源——vdom2 删除后 hooks 保留为共享层）；
 *  render/onUnmount 覆盖为 vdom3 语义（同步 render）。 */
export interface V3Ui
  extends Omit<import('../types.ts').WfuiContext['ui'], 'render' | 'onUnmount'> {
  render(ids?: string[]): void
  onUnmount(fn: () => void): (() => void) | undefined
}

/** 两阶段组件契约（正式签名——无 any）
 *  P：props（JSX 自动推断）；C：ctx 注入依赖（V3Ctx——组件可见面） */
export type Component<P = Record<string, unknown>, C = V3Ctx> = (
  initProps: P,
  ctx: C,
) => Promise<(props: P) => Promise<VNode | null>>

export interface VNode {
  /** native 标签名 / 组件函数 / Fragment/Portal 符号 */
  type: string | symbol | Component
  props: Record<string, unknown>
  key?: string | null
  /** 渲染后回填：DOM 元素（native）/ 组件实例输出（comp） */
  el?: Node | null
  children?: VNodeChild[]
  /** 组件实例状态（comp：工厂返回的 renderFn + 实例 id）——内部字段
   *  （props 参数放宽为 Record——组件 renderFn 的 P 泛型在 buildVNode 赋值处断言一次） */
  _render?: (props: Record<string, unknown>) => Promise<VNode | null>
  _id?: string
  /** 组件输出（build 写——独立于 children（props.children 是入参）；避免覆盖污染对照树） */
  _child?: VNode | null
}

export type VNodeChild = VNode | string | number | null | undefined | boolean

/** vnode kind 分类（全链路事件流的决策基础——单一规则源）
 *  renderVNode / patchInner / patchChildren / 事件流 全部消费——新增类型只改此处 */
export type VKind = 'native' | 'comp' | 'frag' | 'portal' | 'text' | 'null'

export function classifyKind(v: VNodeChild | undefined | null): VKind {
  if (v == null || typeof v === 'boolean') return 'null'
  if (typeof v === 'string' || typeof v === 'number') return 'text'
  const t = (v as VNode).type
  if (typeof t === 'function') return 'comp'
  if (typeof t === 'symbol') {
    // Portal（props.portalKey）优先——Fragment 是 symbol 非 portal
    if ((v as VNode).props?.portalKey != null) return 'portal'
    return 'frag'
  }
  return 'native'
}

/** children 读取统一入口（vdom2 兼容：h 存 props.children——vdom3 引擎输出存 v.children）
 *  读取顺序：v.children（引擎写——组件输出）→ props.children（h/组件库产出）→ 空 */
/** 嵌套数组拍平（vdom2 语义：数组项 = 隐式 Fragment——组件库 [props.children, x] 模式） */
function flatten(c: VNodeChild | VNodeChild[]): VNodeChild[] {
  if (c == null || typeof c === 'boolean') return []
  if (Array.isArray(c)) return c.flatMap((x) => flatten(x))
  return [c]
}

export function childrenOf(v: VNode): VNodeChild[] {
  if (v.children != null) return flatten(v.children)
  const c = (v.props?.children ?? []) as VNodeChild | VNodeChild[]
  return flatten(c)
}

export const Fragment: unique symbol = Symbol('v3-fragment')
/** Portal（浮层渲染到远程容器——#__wf_portal 下按 key 的容器——脱离父节点位置） */
export const Portal: unique symbol = Symbol('v3-portal')
export type PortalVNode = VNode & { type: typeof Portal; portalKey?: string | null }

// ── 渲染事件流（location→DOM 全链路——引擎本体） ──

export type V3Event =
  /** 路由 */
  | { type: 'ROUTE_CHANGE'; path: string; params: Record<string, string>; ts: number }
  /** 组件 */
  | { type: 'COMP_MOUNT'; id: string; name: string; ts: number }
  | { type: 'COMP_UNMOUNT'; id: string; name: string; ts: number }
  /** jsx 层：组件 renderFn 执行（每次渲染——更新可观测） */
  | { type: 'RENDER'; id: string; name: string; ts: number }
  /** jsx 层：组件 props 变化（父 diff 剪枝——props 变化才驱动子重渲染） */
  | { type: 'PROPS_UPDATE'; id: string; name: string; keys: string[]; ts: number }
  /** vdom 层：组件构建（复用/新建——工厂不重跑的事件证据） */
  | { type: 'BUILD'; id: string; name: string; reused: boolean; ts: number }
  /** vdom 层：patch 决策（kind 分发——diff 决策可观测/可断言——缺 case 明确失败） */
  | { type: 'PATCH'; oldKind: VKind | null; newKind: VKind; action: 'reuse' | 'rebuild' | 'move' | 'remove' | 'unhandled'; ts: number }
  /** dom 层：事件绑定观测（记录绑定关系——handler 闭包不可序列化——不参与 diff/回放） */
  | { type: 'EVENT_BIND'; target: string; event: string; ts: number }
  /** dom 层：事件解绑（节点移除时——绑定生命周期 UNBIND 可观测） */
  | { type: 'EVENT_UNBIND'; target: string; event: string; ts: number }
  /** dom 层：ref 生命周期（ref(null)——卸载清理可观测——lockScroll/focus 等清理依赖） */
  | { type: 'REF_CLEANUP'; target: string; ts: number }
  /** 渲染指令（DOM 变更——执行器消费；可逆） */
  | { type: 'NODE_CREATE'; id: string; tag: string; ts: number }
  | { type: 'TEXT_CREATE'; id: string; value: string; ts: number }
  | { type: 'INSERT'; parent: string; child: string; ref?: string | null; ts: number }
  | { type: 'REMOVE'; parent: string; child: string; ts: number }
  | { type: 'PROP_UPDATE'; target: string; key: string; value: unknown; prev: unknown; ts: number }
  | { type: 'TEXT_UPDATE'; target: string; value: string; prev: string; ts: number }
  | { type: 'MOVE'; node: string; parent: string; ref: string | null; prev?: string | null; ts: number }

/** 事件流（记录/回放/断言——DOM = fold(events)） */
export interface EventStream {
  emit(ev: V3Event): void
  events(): V3Event[]
  /** 逆操作（取消——INSERT↔REMOVE / UPDATE 恢复旧值） */
  inverse(ev: V3Event): V3Event | null
  reset(): void
}

// ── 渲染器 ──

export interface Renderer {
  /** 挂载（vnode → 事件流 → DOM） */
  mount(vnode: VNode, root: HTMLElement): void
  /** 更新（旧树 vs 新树 → 事件流 → DOM——同位置同类型复用，仅变更发事件） */
  patch(oldV: VNode | null, newV: VNodeChild, parent: Node, anchor?: Node | null): void
}
