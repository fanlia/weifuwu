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
 */
export type Component<P = {}, C extends object = {}> = (
  initProps: P,
  ctx: WfuiContext & C,
) => ((props: P) => VNode | null) | null

/**
 * 异步组件（统一签名——与 Component 同参，唯一差别是 async）：
 *   async (initProps, ctx) => Promise<renderFn | null>
 *
 * 渲染器统一判别「返回值 instanceof Promise」：
 *   客户端：占位 → resolve 后整树重渲染（vnode 级 _asyncDef 按实例缓存）
 *   SSR：直接 await（无占位）
 *
 * asyncComponent() 是兼容包装（工厂签名 (ctx)，WeakMap 全局一次——代码分割场景）。
 */
export type AsyncComponent<C extends object = {}, P = {}> = (
  initProps: P,
  ctx: WfuiContext & C,
) => Promise<((props: P) => VNode | null) | null>

const ASYNC_MARK = '__wfAsyncComponent'

/**
 * 兼容包装：async 工厂（旧签名 (ctx)，WeakMap 全局一次——代码分割/昂贵一次性资源）。
 * 统一为原生 async 组件签名 (initProps, ctx) => Promise<Component>，渲染器原生处理。
 *
 * ```tsx
 * const UserProfile = asyncComponent(async (ctx) => {
 *   const { default: def } = await import('./view.tsx')
 *   return def
 * })
 * ```
 */
export function asyncComponent<C extends object = {}, P = {}>(
  factory: (ctx: WfuiContext & C) => Promise<Component<P, C>>,
): AsyncComponent<C, P> {
  const fn = (async (_initProps: P, ctx: WfuiContext & C) => {
    return factory(ctx)
  }) as AsyncComponent<C, P> & { [ASYNC_MARK]: true }
  fn[ASYNC_MARK] = true
  return fn as AsyncComponent<C, P>
}

/** 判定一个组件类型是否为 async 工厂（asyncComponent 包装过） */
export function isAsyncComponent(type: any): type is AsyncComponent {
  return typeof type === 'function' && type?.[ASYNC_MARK] === true
}

export const Fragment = Symbol('Fragment')

/** Portal — 将子 VNode 渲染到 document.body 下的独立容器 */
export const Portal = Symbol('Portal')

/**
 * 占位显示策略组件（原生 async 组件未 resolve 时的占位 vnode）。
 * 渲染时查 ctx 原型链上最近的 Suspense 边界：有 → fallback；无 → null（向后兼容）。
 */
export const Placeholder: Component = (_init, ctx) => {
  const s = (ctx as any)._suspense
  return () => s?.fallback ?? null
}

/**
 * Suspense 边界（可选）：子树内 async 组件占位时显示 fallback。
 * 渲染器对 type === Suspense 的组件在 childCtx 挂 _suspense（Object.create 继承 → 子树可见）。
 * 语义：占位处局部显示 fallback（非 React 整树回滚）；无边界时占位为 null。
 *
 * ```tsx
 * h(Suspense, { fallback: h(Spinner) }, h(UserProfile, {}))
 * ```
 */
export const Suspense: Component = (_init, ctx) =>
  (props: Record<string, any>) => props.children

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
