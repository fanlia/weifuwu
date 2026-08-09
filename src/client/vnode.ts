/**
 * weifuwu/client VNode — 虚拟 DOM 节点
 *
 * VNode 是纯 JS 对象，不依赖 DOM。组件返回 VNode。
 *
 * h/jsx 由 esbuild JSX 编译调用：
 *   --jsxImportSource=weifuwu/client
 */

import type { WfuiContext } from './types.ts'

// VNodeType 的组件部分用 Component<any, any>：h() 的 props 是 Record<string, any>，
// 调用点的 props 检查本来就发生在组件声明处；这里只要求「是组件」。
// （具体泛型会因 props 逆变导致 required-prop 组件无法嵌套，如 h(ToolCallCard, {...})）
export type VNodeType = string | Component<any, any> | AsyncComponent | typeof Fragment | typeof Portal

export interface VNode {
  type: VNodeType
  props: Record<string, any>
  key?: string
  el?: Node
  /** 子 VNode 缓存（用于 patchValue diff，避免重复执行组件） */
  _child?: any
  /** 远程 DOM 容器（Portal 等 remote VNode 的 DOM 所在处） */
  _remoteEl?: HTMLElement | undefined
  /** VNode 的 DOM 归属：'local' 在父 DOM 树下，'remote' 在别处 */
  _placement?: 'local' | 'remote'
  /** 两阶段组件的 render 函数（mount 返回的函数） */
  _render?: (props: any) => VNode | null

  /** 组件实例 ID（如 '_wf_0'） */
  _id?: string
  /** 自定义组件 ID（ctx.ui.selfId() 注册，跨组件精准刷新） */
  _customId?: string
  /** 组件输出的 DOM 父节点 */
  _parentNode?: Node
  /** 组件输出的第一个 DOM 节点 */
  _refNode?: Node | null
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
 * 异步组件工厂（形态 C）：async (ctx) => (initProps, ctx) => (props) => VNode
 *
 * 工厂层（async，只执行一次并缓存）：
 *   - 数据声明：const data = await ctx.data.get(key, fetcher)
 *   - 代码分割：const { default: def } = await import('./view.tsx')
 *   - 异步初始化：模块加载、共享资源
 *
 * 返回标准的 Component——mount/render 保持同步，异步只发生在工厂边界。
 * 服务端遍历器与客户端渲染器都 await 工厂；更新路径（_render 缓存）不碰工厂。
 *
 * 必须用 asyncComponent() 包装以标记（渲染器据此区分调用约定）：
 *   Component       → Comp(initProps, ctx)
 *   AsyncComponent  → await Comp(ctx) → Component
 */
export type AsyncComponent<C extends object = {}, P = {}> = (
  ctx: WfuiContext & C,
) => Promise<Component<P, C>>

const ASYNC_MARK = '__wfAsyncComponent'

/**
 * 包装异步组件工厂。
 *
 * ```tsx
 * const UserProfile = asyncComponent(async (ctx) => {
 *   const user = await ctx.data.get(`/api/user/${ctx.params.id}`)
 *   return (initProps, ctx) => (props) => h('div', {}, user.name)
 * })
 * ```
 */
export function asyncComponent<C extends object = {}, P = {}>(
  factory: AsyncComponent<C, P>,
): AsyncComponent<C, P> {
  const fn = factory as AsyncComponent<C, P> & { [ASYNC_MARK]: true }
  fn[ASYNC_MARK] = true
  return fn as AsyncComponent<C, P>
}

/** 判定一个组件类型是否为 async 工厂（asyncComponent 包装过） */
export function isAsyncComponent(type: any): type is AsyncComponent {
  return typeof type === 'function' && (type as any)?.[ASYNC_MARK] === true
}

export const Fragment = Symbol('Fragment')

/** Portal — 将子 VNode 渲染到 document.body 下的独立容器 */
export const Portal = Symbol('Portal')

/** JSX 类型声明 — 使 TypeScript 理解自定义 JSX 运行时 */
declare global {
  namespace JSX {
    type Element = VNode | null
    // Component<any, any>：JSX 不提供 ctx——带 ctx 注入声明（Component<P, C>）的组件
    // 也必须可作 JSX 元素（ctx 由 app 中间件在运行时注入，非 JSX 职责）
    type ElementType = string | Component<any, any>
    interface IntrinsicAttributes {
      key?: string | number
    }
    interface IntrinsicElements {
      [tag: string]: any
    }
  }
}

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
export function h(type: VNodeType, props: Record<string, any> | null, ...children: any[]): VNode {
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
export function createPortal(children: any, portalKey?: string): VNode {
  return {
    type: Portal,
    props: { children, portalKey },
    key: portalKey ?? undefined,
    _placement: 'remote',
  }
}
