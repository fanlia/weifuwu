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

/** WfuiContext（组件 ctx 类型源——192 处组件消费）——V3Ctx extends 统一 */
import type { WfuiContext } from '../types.ts'

/** vdom3 组件 ctx（正式契约——组件可见最小面 + 中间件扩展（index 签名））
 *  render：调度自身重渲染（同 tick 合并）——render-only 唯一触发
 *  onUnmount：卸载清理注册（COMP_UNMOUNT 时执行）
 *  ui：vdom2 兼容面（hooks shim——组件库零改动运行）
 *  扩展字段（ctx.app/i18n/data/auth...）经 index 签名消费（可选链——中间件注入） */
/** vdom3 组件 ctx（正式契约——与 WfuiContext 类型唯一化：
 *  V3Ctx extends WfuiContext——vdom2 时代内联标注 ctx: WfuiContext 的组件
 *  类型兼容（逆变：接受 WfuiContext 的函数可接收 V3Ctx）；组件库 192 处
 *  WfuiContext 消费零改动——严格类型，无 any 绕开） */
export interface V3Ctx extends WfuiContext {
  /** 调度自身重渲染（同 tick 合并）——render-only 唯一触发 */
  render(): void
  /** 卸载清理注册（COMP_UNMOUNT 时执行） */
  onUnmount(fn: () => void): void
  /** vdom2 兼容面（hooks shim——组件库零改动运行——V3Ui 满足放宽后的
   *  WfuiContext['ui']（render: void ⊂ void | Promise<void>）） */
  ui: V3Ui
}

/** ctx.ui 兼容面（vdom2 hooks 契约——组件库零改动运行）
 *  方法签名继承 vdom2 ui（hooks 类型源——vdom2 删除后 hooks 保留为共享层）；
 *  render/onUnmount 覆盖为 vdom3 语义（同步 render）。 */
export interface V3Ui
  extends Omit<WfuiContext['ui'], 'render' | 'onUnmount'> {
  render(ids?: string[]): void
  onUnmount(fn: () => void): (() => void) | undefined
  /** 实例标记（debug：ctx.ui 来源审计——双实例定位） */
  __v3ui?: boolean
  /** 实例绑定的组件 id（debug：compId 错位定位） */
  __compId?: string
}

/** 两阶段组件契约（正式签名——无 any）
 *  P：props（JSX 自动推断）；C：ctx 注入依赖——**自动 & WfuiContext**（vdom2 语义：
 *  组件声明 C 只写注入面（ToastInjected 等）——ctx.ui/browser 等基础面自动可用）
 *  ——严格交叉（无 any）——默认 C = V3Ctx（V3Ctx extends WfuiContext——交叉 = V3Ctx） */
export type Component<P = Record<string, unknown>, C = V3Ctx> = (
  initProps: P,
  ctx: C & WfuiContext,
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

export type VNodeChild = VNode | string | number | null | undefined | boolean | VNodeChild[]

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

/** 拍平后元素（flatten 展开嵌套数组——类型层面排除数组——逻辑保证） */
export type FlatChild = VNode | string | number | null | undefined | boolean

export function childrenOf(v: VNode): FlatChild[] {
  if (v.children != null) return flatten(v.children) as FlatChild[]
  const c = (v.props?.children ?? []) as VNodeChild | VNodeChild[]
  return flatten(c) as FlatChild[]
}

export const Fragment: unique symbol = Symbol('v3-fragment')
/** Portal（浮层渲染到远程容器——#__wf_portal 下按 key 的容器——脱离父节点位置） */
export const Portal: unique symbol = Symbol('v3-portal')
export type PortalVNode = VNode & { type: typeof Portal; portalKey?: string | null }

// ── 渲染事件流（location→DOM 全链路——引擎本体） ──
//
// 统一命名：对象 + 动作 + 参数（entity + action + target + payload）——
// 每一层（location/jsx/vdom/dom）同构：
//   location 层：{ entity:'route', action:'change' }         —— 路由变更
//   jsx 层    ：{ entity:'comp'/'props', action:'render'/'mount'/'unmount'/'build'/'update' }
//   vdom 层   ：{ entity:'vnode', action:'patch' }           —— diff 决策（strategy 参数）
//   dom 层    ：{ entity:'node'/'text'/'prop'/'event'/'ref', action:'create'/'insert'/'remove'/'move'/'update'/'bind'/'unbind'/'cleanup' }
//
// 不变量：任何事件触发，最终都落到 dom 层事件（node/text/prop/event/ref 的精准状态变化）——
// 决策层事件（route/comp/vnode）只是解释"为什么"，执行层事件（dom）是"做了什么"。

export type Entity = 'route' | 'comp' | 'props' | 'vnode' | 'node' | 'text' | 'prop' | 'event' | 'ref' | 'error' | 'internal' | 'stream' | 'effect'

export type Action =
  /** location 层 */
  | 'change'
  /** jsx 层 */
  | 'render' | 'build' | 'mount' | 'unmount' | 'update'
  /** vdom 层 */
  | 'patch'
  /** dom 层 */
  | 'create' | 'insert' | 'remove' | 'move' | 'bind' | 'unbind' | 'cleanup'
  /** 错误层（任意环节失败——事件流完整覆盖：throw=未捕获传播 / caught=隔离降级） */
  | 'throw' | 'caught'
  /** 内部决策层（渲染管线内部状态——busy 排队/组件未定位/跳过——非正常路径可观测） */
  | 'queue' | 'notfound' | 'skip'
  /** 事件流自身层（buffer 状态——溢出覆盖可观测） */
  | 'overflow'
  /** 组件副作用层（ref 挂载/动画/滚动锁/焦点 trap/滚动——非渲染的 DOM 行为可观测） */
  | 'mount' | 'animate' | 'lock' | 'unlock' | 'focus' | 'scroll'
  /** 用户文本操作层（输入/选区/剪贴板——用户对文本的交互可观测） */
  | 'input' | 'select' | 'copy' | 'cut' | 'paste'

export type V3Event = {
  /** 对象（什么） */
  entity: Entity
  /** 动作（怎么了） */
  action: Action
  /** 对象 id（目标定位——node id / comp id） */
  target?: string
  /** 参数（对象相关数据——旧值/新值/父节点/属性 key 等） */
  payload?: Record<string, unknown>
  ts: number
}

/** patch 决策策略（vnode:patch 的 payload.strategy） */
export type PatchStrategy = 'reuse' | 'rebuild' | 'move' | 'remove' | 'unhandled'

/** 错误发生的环节（error:throw/caught 的 payload.phase——全链路可定位） */
export type ErrorPhase = 'factory' | 'renderFn' | 'build' | 'patch' | 'mount' | 'update' | 'hook' | 'schedule' | 'event'

/** 事件流（记录/回放/断言——DOM = fold(events)） */
export interface EventStream {
  emit(ev: V3Event): void
  /** 实时订阅（emit 同步回调——缓冲溢出也不丢事件——返回退订） */
  subscribe(fn: (ev: V3Event) => void): () => void
  events(): V3Event[]
  /** 当前有效条数（缓冲占用——事件流自身状态可观测） */
  size(): number
  /** 缓冲容量 */
  capacity(): number
  /** 溢出次数（最旧事件被覆盖的次数——事件丢失可审计） */
  overflowCount(): number
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
