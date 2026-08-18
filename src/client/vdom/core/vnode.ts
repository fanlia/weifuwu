/**
 * vdom core — vnode 纯数据面（独立实现——零引用 ui-dom）
 *
 * 设计（对齐 vdom-x 契约 + AGENTS §4.0/§6.3）：
 * ① vnode 纯数据——零回填字段（el/_render/_id 等全部在影子层——可自由克隆/
 *    比较/序列化——用户写 JSX 就能推导 vnode 形状）
 * ② h() 除 key 剥离外零转换——children 原样（false/嵌套数组保留——不 filter）
 * ③ key 业务身份声明协议：key 从 props 剥离进 vnode.key（组件 props 不见 key）
 * ④ children 值域协议：vnode/string/number/boolean/空洞(null/undefined)/嵌套数组
 *    （数组 = 隐式 Fragment——递归展开统一在 childrenOf——单一规则源——
 *    空洞保留——占位法保长度恒定）
 * ⑤ 组件两阶段：工厂 = mount（一次——初始化状态/订阅/数据预取）；
 *    renderFn = 每次渲染（同步或 async——异步边界 = ctx.data 管道——不挂起）
 * ⑥ Fragment/Portal 内部符号——公共面不导出（数组 = 隐式 Fragment；
 *    createPortal = usePopup 内部机制；`<></>` 经 jsx-runtime 子路径）
 */

import type { Ctx } from '../context/Ctx.ts'

/** Fragment 内部符号（数组 = 隐式 Fragment——`<></>` 经 jsx-runtime 自动展开） */
export const Fragment: unique symbol = Symbol('vdom-fragment')
/** Portal 内部符号（usePopup 内部机制——浮层渲染到 #__wf_portal） */
export const Portal: unique symbol = Symbol('vdom-portal')

/** vnode——纯数据 */
export interface VNode {
  /** 标签名 / 组件 / 内部符号（Fragment/Portal） */
  type: string | symbol | Component
  props: Record<string, unknown>
  /** 业务身份声明（无自动生成——无 key = 位置身份） */
  key: string | null
  children?: VNodeChild[]
}

/** children 值域：vnode/string/number/boolean/空洞/嵌套数组（数组 = 隐式 Fragment） */
export type VNodeChild = VNode | string | number | boolean | null | undefined | VNodeChild[]

/** renderFn——每次渲染（读最新 props——同步或 async——异步边界 = ctx.data） */
export type RenderFn<P = Record<string, unknown>> = (props: P) => VNode | null | Promise<VNode | null>

/** 组件（两阶段）：
 *  工厂 = mount（一次——初始化状态/订阅/数据预取（await ctx.data——管道保证））
 *  renderFn = 每次渲染（ctx.render()/props 变化触发） */
export type Component<P = Record<string, unknown>, C = Ctx> = (
  initProps: P,
  ctx: C,
) => RenderFn<P> | Promise<RenderFn<P>>

type HType = string | symbol | Component

/** h()——创建 vnode（纯数据——除 key 剥离外零转换）
 *  children 原样：单子节点直接存、多子节点存数组、无子节点不存——false/嵌套
 *  数组保留（不 filter——空洞占位法在消费侧） */
export function h(type: HType, props?: Record<string, unknown> | null, ...children: VNodeChild[]): VNode {
  const { key, ...rest } = props ?? {}
  const p = { ...rest }
  if (children.length === 1) p.children = children[0]
  else if (children.length > 1) p.children = children
  return { type, props: p, key: (key as string | null) ?? null }
}

/** jsx 运行时（自动导入——`<div/>` 编译目标——React 兼容签名 jsx(type, props, key)——
 *  props 内 key 同样剥离；jsxs/jsxDEV 同形状（children 已在 props.children） */
export function jsx(type: HType, props: Record<string, unknown> | null, key?: string | null): VNode {
  const { key: k, ...rest } = props ?? {}
  return { type, props: rest as Record<string, unknown>, key: (key ?? (k as string | null)) ?? null }
}
export const jsxs = jsx
export const jsxDEV = jsx

/** children 读取（单一规则源——五消费方共用）：
 *  统一 children 序列（数组/`<></>`/嵌套数组全部递归展开——隐式 Fragment——
 *  纯函数一次到位——路径按展开后位置——深度变化不漂移）；
 *  空洞（false/null/undefined）保留不滤除（占位法——长度恒定） */
export function childrenOf(v: VNode): VNodeChild[] {
  const c = v.children ?? (v.props.children === undefined ? [] : v.props.children)
  const flat = (x: VNodeChild): VNodeChild[] => (Array.isArray(x) ? x.flatMap(flat) : [x])
  return (Array.isArray(c) ? c.flatMap(flat) : [c]) as VNodeChild[]
}
