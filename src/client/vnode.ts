/**
 * weifuwu/client VNode — 虚拟 DOM 节点
 *
 * VNode 是纯 JS 对象，不依赖 DOM。组件返回 VNode。
 *
 * h/jsx 由 esbuild JSX 编译调用：
 *   --jsxImportSource=weifuwu/client
 */

import type { WfuiContext } from './types.ts'

export type VNodeType = string | Component | typeof Fragment

export interface VNode {
  type: VNodeType
  props: Record<string, any>
  key?: string
  el?: Node
  _$?: Record<string, any>
  /** 子 VNode 缓存（用于 patchValue diff，避免重复执行组件） */
  _child?: any
}

export type Component<P = {}> = (props: P, ctx: WfuiContext) => VNode | null

export const Fragment = Symbol('Fragment')

/** JSX 类型声明 — 使 TypeScript 理解自定义 JSX 运行时 */
declare global {
  namespace JSX {
    type Element = VNode | null
    type ElementType = string | Component<any>
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

export const h = jsx

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
