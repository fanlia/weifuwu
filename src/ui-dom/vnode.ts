/**
 * weifuwu/ui-dom VNode — 虚拟 DOM 节点
 *
 * VNode 是纯 JS 对象，不依赖 DOM。组件返回 VNode。
 *
 * h/jsx 由 esbuild JSX 编译调用：
 *   --jsxImportSource=weifuwu/ui-dom
 */

import type { WfuiContext } from './types.ts'

// VNodeType 的组件部分用 Component<any, any>：h() 的 props 是 Record<string, any>，
// 调用点的 props 检查本来就发生在组件声明处；这里只要求「是组件」。
// （具体泛型会因 props 逆变导致 required-prop 组件无法嵌套，如 h(ToolCallCard, {...})）
export type VNodeType = string | Component<any, any> | typeof Fragment | typeof Portal

/**
 * VNode 子节点合法值——组件可返回/渲染的多态内容。
 * 递归联合：string/number/VNode/array/null/boolean 任意组合。
 */
export type VNodeChild =
  | VNode
  | string
  | number
  | boolean
  | null
  | undefined
  | VNodeChild[]

export interface VNode {
  type: VNodeType
  props: Record<string, any>
  key?: string
  el?: Node
  /** 子 VNode 缓存（用于 patchValue diff，避免重复执行组件） */
  _child?: VNode | VNode[] | null
  /** 远程 DOM 容器（Portal 等 remote VNode 的 DOM 所在处） */
  _remoteEl?: HTMLElement | undefined
  /** VNode 的 DOM 归属：'local' 在父 DOM 树下，'remote' 在别处 */
  _placement?: 'local' | 'remote'
  /** 两阶段组件的 render 函数（mount 返回的函数——强制异步：props 变化时可 await 数据） */
  _render?: (props: Record<string, unknown>) => Promise<VNode | null>

  /** 组件实例 ID（如 '_wf_0'） */
  _id?: string
  /** 自定义组件 ID（ctx.ui.selfId() 注册，跨组件精准刷新） */
  _customId?: string
  /** 组件输出的 DOM 父节点 */
  _parentNode?: Node
  /** 父 vnode 引用（动态挂载补全向上找持有组件） */
  _parentVNode?: VNode
  /** 组件输出的第一个 DOM 节点 */
  _refNode?: Node | null
  /** 阶段 B：children 每位置的首 DOM 节点（规则表 §5 锚点优先——替代 source[i] 下标猜测，
   *  fragment/数组项多节点展开后相邻项不错位）。renderValue 记录，patchChildren 读取 + 回写 */
  _childAnchors?: (Node | null)[]
  /** Fragment 展开后的多个直属 DOM 节点范围（diff 对齐用，见 diff.ts） */
  _childNodes?: Node[]
  /** 组件 renderFn 上次执行时的 ctx 版本号（buildVNode 剪枝 + diff 三态 skip 的版本比较——
   *  bumpCtxVersion 递增后版本不同 → 强制重跑 renderFn，如 i18n 切换语言） */
  _ctxVersion?: number
}

/**
 * 两阶段异步组件（weifuwu 唯一组件形态）：
 *   async (initProps, ctx) => Promise<renderFn>
 * 外层 = mount（一次，可 await 数据），内层 = renderFn（每次 dirty/props 变化——**强制异步**，
 * 可 await 数据；统一异步心智：两阶段都可 await，无「同步组件 vs 异步组件」二元形态）。
 * P = props 类型（JSX 自动推断），C = 组件依赖的 ctx 注入（如 ApiInjected & RouteInjected）
 *
 * renderFn 签名：async (props) => Promise<VNode | null>——同步 renderFn 是类型错误
 * （diff 永不执行 renderFn——渲染器在 buildVNode 阶段 await，同步上下文拿不到 vnode）。
 * 渲染器按「返回值是 Promise」判别（主路径 buildVNode await 全部工厂 + renderFn）。
 */
export type RenderFn<P> = (props: P) => Promise<VNode | null>

export type Component<P = {}, C extends object = {}> = (
  initProps: P,
  ctx: WfuiContext & C,
) => Promise<RenderFn<P> | null>

export const Fragment = Symbol('Fragment')

/** Portal — 将子 VNode 渲染到 document.body 下的独立容器 */
export const Portal = Symbol('Portal')

/** JSX 类型声明 — 使 TypeScript 理解自定义 JSX 运行时 */


export function jsx(type: VNodeType, props: Record<string, any> | null, key?: string | null): VNode {
  return {
    type,
    props: normalizeProps(props),
    key: key ?? undefined,
  }
}

export const jsxs = jsx

export function jsxDEV(type: VNodeType, props: Record<string, any> | null, key?: string | null): VNode {
  return jsx(type, props, key)
}

/** `h`（hyperscript）支持 variadic children: `h('div', {class:'x'}, child1, child2)` */
export function h(type: VNodeType, props: Record<string, any> | null, ...children: VNodeChild[]): VNode {
  const p = normalizeProps(props ?? {})
  if (children.length > 0) {
    p.children = children.length === 1 ? children[0] : children
  }
  return { type, props: p, key: props?.key ?? undefined }
}

function normalizeProps(props: Record<string, any> | null): Record<string, any> {
  if (!props) return {}
  const result: Record<string, any> = {}
  for (const key of Object.keys(props)) {
    if (key === 'key') continue
    result[key] = props[key]
  }
  return result
}

export function isNative(vnode: VNode): boolean {
  return typeof vnode.type === 'string'
}

/** 递归文本/数组归一化（children 数组展开——嵌套数组扁平化，DOM 范围对齐）。
 *  栈展开（索引遍历替代 shift/unshift 头部操作——长数组 O(n) 而非 O(n²)）；逆序入栈 + pop 保持原顺序 */
/** children 数组视图（保真用户结构——vnode 任何阶段以用户 JSX 为标准，规则表 §1-20）。
 *  数组原样返回（零拷贝——嵌套数组不展开：数组项 ≡ 隐式 Fragment，渲染/diff 按嵌套递归，
 *  key 层级独立 §3-46）；非数组包装成单元素数组。替代 v1 normalizeChildren（平铺展开——
 *  消灭层级信息 → 内层/外层下标 key 撞车 → auth 切换字段残留）。 */
export function arrayChildren(c: VNodeChild | undefined | null): VNodeChild[] {
  if (c == null || typeof c === 'boolean') return []
  return Array.isArray(c) ? c : [c]
}

export function isComponent(vnode: VNode): boolean {
  return typeof vnode.type === 'function'
}

export function isFragment(vnode: VNode): boolean {
  return vnode.type === Fragment
}

export function isPortal(vnode: VNode): boolean {
  return vnode.type === Portal
}

/** Portal VNode — 子节点渲染到 document.body#__wf_portal 中 */
export function createPortal(children: VNodeChild, portalKey?: string): VNode {
  return {
    type: Portal,
    props: { children, portalKey },
    key: portalKey ?? undefined,
    _placement: 'remote',
  }
}

/** JSX 类型声明 — ui-dom 是 jsxImportSource（client 壳不再声明） */
declare global {
  namespace JSX {
    type Element = import('./vnode.ts').VNode | null
    type ElementType =
      | string
      | ((props: any, ctx: any) => any)
      | typeof Fragment
      | typeof Portal
    interface IntrinsicElements {
      [tag: string]: any
    }
    interface IntrinsicAttributes {
      key?: string | number
    }
  }
}
