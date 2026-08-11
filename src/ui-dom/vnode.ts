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
export type VNodeType = string | Component<any, any> | AsyncComponent | typeof Fragment | typeof Portal

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
  /** 两阶段组件的 render 函数（mount 返回的函数） */
  _render?: (props: Record<string, unknown>) => VNode | null

  /** 组件实例 ID（如 '_wf_0'） */
  _id?: string
  /** 自定义组件 ID（ctx.ui.selfId() 注册，跨组件精准刷新） */
  _customId?: string
  /** 组件输出的 DOM 父节点 */
  _parentNode?: Node
  /** 组件输出的第一个 DOM 节点 */
  _refNode?: Node | null
  /** 原生 async 组件缓存（vnode 级按实例）：in-flight Promise → resolved renderFn（diff 传递继承） */
  _asyncDef?: ((props: Record<string, unknown>) => VNode | null) | Promise<((props: Record<string, unknown>) => VNode | null)> | null
  /** Fragment 展开后的多个直属 DOM 节点范围（diff 对齐用，见 diff.ts） */
  _childNodes?: Node[]
  /** 组件 mount/render 时的 ctx 版本号（供三态 skip 判定） */
  _ctxVersion?: number
}

/**
 * 两阶段组件：外层 = mount（一次），内层 = render（每次 dirty/props 变化）。
 * P = props 类型（JSX 自动推断），C = 组件依赖的 ctx 注入（如 ApiInjected & RouteInjected）
 *
 * 模式 A（design/async-mode-a-plan.md）：工厂可 async（返回 Promise<renderFn>）——
 * 主路径 buildVNode await 全部（无占位）；动态挂载兑底占位 + 局部补全。
 * 统一签名：同步/async 工厂同类型（唯一差别是 async 关键字——渲染器按返回值判别）。
 */
export type Component<P = {}, C extends object = {}> = (
  initProps: P,
  ctx: WfuiContext & C,
) => ((props: P) => VNode | null) | null | Promise<((props: P) => VNode | null) | null>

/**
 * 异步组件（统一签名——与 Component 同参，唯一差别是 async）：
 *   async (initProps, ctx) => Promise<renderFn | null>
 *
 * 模式 A（design/async-mode-a-plan.md）：主路径 buildVNode await 全部工厂（无占位）；
 * 动态挂载兑底占位 + 局部补全（resolve 后 renderByIds）。
 */
export type AsyncComponent<C extends object = {}, P = {}> = (
  initProps: P,
  ctx: WfuiContext & C,
) => Promise<((props: P) => VNode | null) | null>

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
