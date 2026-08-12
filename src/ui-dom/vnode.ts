/**
 * vnode — VNode 强类型判别联合（vdom2 方案——vdom1 退役后唯一类型源）
 *
 * 与全局 vnode.ts（vdom1 JSX 运行时）的关系：
 * - Fragment/Portal **symbol 复用全局**（全局唯一协议——JSX 编译产物用全局 Fragment，
 *   vdom2 引擎处理全局 h() 产物必须同 symbol 判别）
 * - 类型（VNode/VNodeChild/Component）**独立**（vdom2 强类型；vdom1 替换后本文件成唯一类型源）
 *
 * 访问模式（强类型约束）：
 *   if (isFrag(vnode)) { vnode._childNodes ... }   // type === Fragment → TS 收窄为 FragVNode
 *   if (isComp(vnode)) { vnode._render ... }        // type 为函数 → 收窄为 CompVNode
 *   —— 无散落 cast；字段访问由类型系统强制。
 */

export type VNodeType = string | Component<any, any> | typeof Fragment | typeof Portal

export type VNodeChild =
  | VNode
  | string
  | number
  | boolean
  | null
  | undefined
  | VNodeChild[]

// Fragment/Portal symbol（全局唯一协议——JSX 编译产物判别式）
export const Fragment = Symbol('Fragment')
export const Portal = Symbol('Portal')

/** 通用字段（所有 VNode 共有——构建元数据；渲染前为 null 的显式初始化） */
interface VNodeBase {
  type: VNodeType
  props: Record<string, any>
  /** key（数组项身份——无 key 为 null；显式 null 非可选 undefined） */
  key: string | null
  /** 子 vnode 缓存（buildVNode 构建——patchValue diff 对照用；渲染前 null） */
  _child: VNode | VNode[] | null
  /** 结构父节点（输出范围坐标系——范围定位不需要外部传 parent） */
  _parentNode: Node | null
  /** 输出锚点 = 输出范围**首 DOM 节点**（多节点输出时必须是真实节点而非 DocumentFragment） */
  _refNode: Node | null
  /** 组件实例 ID / 自定义 ID（buildVNode 分配） */
  _id: string | null
  _customId: string | null
  /** 父 vnode 引用 */
  _parentVNode: VNode | null
  /** 组件 renderFn 上次执行时的 ctx 版本号（buildVNode 剪枝 + diff 三态 skip） */
  _ctxVersion: number | null
}

/** 原生元素——type: string；特有：el / _childAnchors（渲染后填充，前 null） */
export interface NativeVNode extends VNodeBase {
  type: string
  el: Node | null
  _childAnchors: (Node | null)[] | null
}

/** Fragment——type: typeof Fragment（多节点输出边界 = fragment-start/end 标记——DOM 持久化） */
export interface FragVNode extends VNodeBase {
  type: typeof Fragment
}

/** 组件——type: Component；特有：_render（两阶段 renderFn）/ _outputChild（输出引用） */
export interface CompVNode extends VNodeBase {
  type: Component
  _render: ((props: Record<string, unknown>) => Promise<VNode | null>) | null
  /** 输出 vnode 引用（dispose 清 _child/_id/_render 后仍可取输出范围——getOutputRange 递归终点） */
  _outputChild: VNodeChild | null
}

/** Portal——type: typeof Portal；特有：_remoteEl / _placement（固定 'remote'） */
export interface PortalVNode extends VNodeBase {
  type: typeof Portal
  _remoteEl: HTMLElement | null
  _placement: 'remote'
}

/** VNode 判别联合——type 为判别式 */
export type VNode = NativeVNode | FragVNode | CompVNode | PortalVNode

// ── 类型守卫（判别式收窄——替代散落 cast） ──

export function isNative(v: unknown): v is NativeVNode {
  return v != null && typeof v === 'object' && typeof (v as any).type === 'string'
}
export function isFrag(v: unknown): v is FragVNode {
  return v != null && typeof v === 'object' && (v as any).type === Fragment
}
export function isComp(v: unknown): v is CompVNode {
  return v != null && typeof v === 'object' && typeof (v as any).type === 'function'
}
export function isPortal(v: unknown): v is PortalVNode {
  return v != null && typeof v === 'object' && (v as any).type === Portal
}

export type Component<P = {}, C extends object = {}> = (
  initProps: P,
  ctx: import('./types.ts').WfuiContext & C,
) => Promise<((props: P) => Promise<VNode | null>) | null>

/** 构造 VNode 基字段（所有类型共用的初始值） */
function base(type: VNodeType, props: Record<string, any>, key: string | null = null): VNodeBase {
  return {
    type,
    props,
    key,
    _child: null,
    _parentNode: null,
    _refNode: null,
    _id: null,
    _customId: null,
    _parentVNode: null,
    _ctxVersion: null,
  }
}

/** 按类型构造强类型 VNode（每类初始化特有必填字段） */
export function createVNode(type: VNodeType, props: Record<string, any>, key: string | null = null): VNode {
  if (type === Fragment) {
    const v: FragVNode = { ...base(type, props, key), type }
    return v
  }
  if (type === Portal) {
    const v: PortalVNode = { ...base(type, props, key), type, _remoteEl: null, _placement: 'remote' }
    return v
  }
  if (typeof type === 'function') {
    const v: CompVNode = { ...base(type, props, key), type, _render: null, _outputChild: null }
    return v
  }
  const v: NativeVNode = { ...base(type, props, key), type, el: null, _childAnchors: null }
  return v
}

export function h(type: VNodeType, props: Record<string, any> | null, ...children: VNodeChild[]): VNode {
  const p = normalizeProps(props ?? {})
  if (children.length > 0) {
    p.children = children.length === 1 ? children[0] : children
  }
  return createVNode(type, p, props?.key ?? null)
}

export function jsx(type: VNodeType, props: Record<string, any> | null, key?: string | null): VNode {
  return createVNode(type, normalizeProps(props), key ?? null)
}
export const jsxs = jsx
export function jsxDEV(type: VNodeType, props: Record<string, any> | null, key?: string | null): VNode {
  return jsx(type, props, key)
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

export function arrayChildren(c: VNodeChild | undefined | null): VNodeChild[] {
  if (c == null || typeof c === 'boolean') return []
  return Array.isArray(c) ? c : [c]
}

export function createPortal(children: VNodeChild, portalKey?: string): VNode {
  const vnode = createVNode(Portal, { children, portalKey }) as PortalVNode
  vnode.key = portalKey ?? null
  return vnode
}

/** JSX 类型声明（jsxImportSource: weifuwu/ui-dom——组件/用户 JSX 编译产物类型） */
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
      key?: string | number | null
    }
  }
}
