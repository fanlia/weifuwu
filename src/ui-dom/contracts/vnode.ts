/**
 * contracts/vnode — vnode 契约层（引擎无关——vdom4 端口化 UI-1）
 *
 * 声明式数据结构：h()/renderFn 产出的 vnode 树形状 + 组件契约签名。
 * 引擎（engines/）消费本契约；组件库/用户只经 ui-dom 门面接触本层——
 * v5 换引擎时本文件不动。
 *
 * 注意：VNode 的回填字段（el/_render/_id/_child/_outFirst/_outLast/_propsSnap）
 * 是当前引擎（vdom3）的运行时副产物——vdom4 P2 值化后移入影子状态——
 * 届时 VNode 回归纯数据（type/props/key/children）。
 */

import type { V3Ctx } from './ctx.ts'

/** 两阶段组件契约（正式签名——无 any）
 *  P：props（JSX 自动推断）；C：ctx 注入依赖——**自动 & WfuiContext**（vdom2 语义：
 *  组件声明 C 只写注入面（ToastInjected 等）——ctx.ui/browser 等基础面自动可用）
 *  ——严格交叉（无 any）——默认 C = V3Ctx（V3Ctx extends WfuiContext——交叉 = V3Ctx） */
export type Component<P = Record<string, unknown>, C = V3Ctx> = (
  initProps: P,
  ctx: C & WfuiContext,
) => Promise<(props: P) => Promise<VNode | null>>

/** WfuiContext（组件 ctx 类型源——192 处组件消费）——V3Ctx extends 统一 */
import type { WfuiContext } from '../types.ts'

export interface VNode {
  /** native 标签名 / 组件函数 / Fragment/Portal 符号 */
  type: string | symbol | Component
  props: Record<string, unknown>
  key?: string | null
  /** 渲染后回填：DOM 元素（native）/ 组件实例输出（comp）——引擎内部字段 */
  el?: Node | null
  children?: VNodeChild[]
  /** 组件实例状态（comp：工厂返回的 renderFn + 实例 id）——内部字段
   *  （props 参数放宽为 Record——组件 renderFn 的 P 泛型在 buildVNode 赋值处断言一次） */
  _render?: (props: Record<string, unknown>) => Promise<VNode | null>
  _id?: string
  /** 组件输出（build 写——独立于 children（props.children 是入参）；避免覆盖污染对照树） */
  _child?: VNode | null
  /** 多节点输出范围（阶段 2——渲染后回填：首/尾 DOM 节点——组件/Fragment 输出
   *  多节点时移除/推进用范围（vdom2 getOutputRange 语义——事件流引用替代 DOM 标记） */
  _outFirst?: Node | null
  _outLast?: Node | null
  /** props 内容快照（透明度 round2 阶段 1——dev only——检测原地改对象） */
  _propsSnap?: string | null
  /** 槽位锚 id（vdom4 P1 锚点法——数组项 vnode 的输出锚——P2 值化时入影子） */
  _anchorId?: string | null
  /** 输出区间末尾锚（组件/Fragment 多锚展开——clearSlot 区间边界用） */
  _lastAnchorId?: string | null
}

export type VNodeChild = VNode | string | number | null | undefined | boolean | VNodeChild[]

/** vnode kind 分类（全链路事件流的决策基础——单一规则源）
 *  renderVNode / patchInner / patchChildren / 事件流 全部消费——新增类型只改此处 */
export type VKind = 'native' | 'comp' | 'frag' | 'portal' | 'text' | 'null' | 'app'

export function classifyKind(v: VNodeChild | undefined | null): VKind {
  if (v == null || typeof v === 'boolean') return 'null'
  if (typeof v === 'string' || typeof v === 'number') return 'text'
  const t = (v as VNode).type
  if (typeof t === 'function') return 'comp'
  if (typeof t === 'symbol') {
    if (t === App) return 'app'
    // Portal（props.portalKey）优先——Fragment 是 symbol 非 portal
    if ((v as VNode).props?.portalKey != null) return 'portal'
    return 'frag'
  }
  return 'native'
}

/** children 读取统一入口（vdom2 兼容：h 存 props.children——vdom3 引擎输出存 v.children）
 *  读取顺序：v.children（引擎写——组件输出）→ props.children（h/组件库产出）→ 空 */
/** 嵌套数组拍平（vdom2 语义：数组项 = 隐式 Fragment——组件库 [props.children, x] 模式）
 *  false/null/boolean **保留**（空洞）——占位法（阶段 1）：children 与 DOM 双同构
 *  （空洞建占位节点——|DOM| = |children|——条件渲染切换索引不漂移——
 *  根治 children 错配类 bug：@ 菜单重复输入框等） */
function flatten(c: VNodeChild | VNodeChild[]): VNodeChild[] {
  if (Array.isArray(c)) return c.flatMap((x) => flatten(x))
  return [c]
}

/** 拍平后元素（flatten 展开嵌套数组——类型层面排除数组——逻辑保证） */
export type FlatChild = VNode | string | number | null | undefined | boolean

export function childrenOf(v: VNode): FlatChild[] {
  if (v.children != null) return flatten(v.children) as FlatChild[]
  // 占位法：显式 null children 保留为空洞（与 false 一致——同构不变量）。
  // `?? []` 会吞掉 null → 单子节点条件渲染（cond ? <X/> : null）数组长度 0↔1
  // 变化 → A 级动态数组检测误报（真实事故：ColorPicker 选中态 check Icon
  // 切换——swatch 按钮 children [Icon] ↔ [] 长度变化）
  const c = (v.props?.children === undefined ? [] : v.props.children) as VNodeChild | VNodeChild[]
  return flatten(c) as FlatChild[]
}

export const Fragment: unique symbol = Symbol('v3-fragment')
/** Portal（浮层渲染到远程容器——#__wf_portal 下按 key 的容器——脱离父节点位置） */
export const Portal: unique symbol = Symbol('v3-portal')
export type PortalVNode = VNode & { type: typeof Portal; portalKey?: string | null }

/** App（多应用加载——type: App 的节点 = 子应用挂载点——应用编排） */
export const App: unique symbol = Symbol('v3-app')
export type AppVNode = VNode & {
  type: typeof App
  appId?: string
  _appOutput?: VNode | null
}
