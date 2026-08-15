/**
 * vdom3 jsx — vnode 创建（声明式——vdom2 同模型：renderFn 输出完整树）
 *
 * 统一 JSX 入口：h/jsx/jsxs/jsxDEV + createPortal + Fragment/Portal——
 * vdom2 时代 vnode.ts 的工厂全部收敛到此处（组件库 249 处 import 经转发层零改动）。
 */

import type { VNode, VNodeChild } from './types.ts'
import { Fragment, Portal } from './types.ts'
import type { Component } from './types.ts'

// type 参数放宽为 Component<any, any>（vdom2 同款——TS 逆变：具体 props 的组件
// 可赋给宽松签名——JSX 生态惯例；严格默认参数会拒绝 Component<IconProps>）
type HType = string | symbol | Component<any, any>

export function h(
  type: HType,
  props?: Record<string, unknown> | null,
  ...children: VNodeChild[]
): VNode {
  // children 存 props.children（vdom2 语义对齐——组件库 249 处 import 断言单值/数组）：
  // 单子节点存单值（h('span', {}, 'x') → children='x'）；多子节点存数组
  const p = props ? { ...props } : {}
  if (children.length > 0) p.children = children.length === 1 ? children[0] : children
  return { type, props: p, key: (props?.key as string) ?? null }
}

/** JSX 编译产物入口（jsxImportSource: weifuwu/ui-dom——jsx-runtime 转发） */
export function jsx(type: HType, props: Record<string, unknown> | null, key?: string | null): VNode {
  const p = props ? { ...props } : {}
  delete (p as Record<string, unknown>).key
  return { type, props: p, key: key ?? (props?.key as string) ?? null }
}
/** jsxs = jsx（children 数组已在 props.children——h 语义同构） */
export const jsxs = jsx
export function jsxDEV(type: HType, props: Record<string, unknown> | null, key?: string | null): VNode {
  return jsx(type, props, key)
}

/** Portal：children 渲染到远程容器（#__wf_portal > [data-wf-portal-key=key]） */
export function createPortal(children: VNodeChild, portalKey?: string): VNode {
  return {
    type: Portal, props: { children: Array.isArray(children) ? children : [children], portalKey: portalKey ?? 'default' },
    key: portalKey ?? null,
  } as unknown as VNode
}

export { Fragment, Portal }

/** JSX 类型声明（jsxImportSource: weifuwu/ui-dom——组件/用户 JSX 编译产物类型） */
declare global {
  namespace JSX {
    type Element = import('./types.ts').VNode | null
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
