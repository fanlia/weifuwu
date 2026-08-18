/**
 * vdom4 jsx — h() 创建 vnode（纯数据）
 */

import type { VNode, VNodeChild } from './types.ts'
import { Fragment, Portal } from './types.ts'

type HType = string | symbol | ((props: any, ctx: any) => any)

export function h(type: HType, props?: Record<string, unknown> | null, ...children: VNodeChild[]): VNode {
  const p = props ? { ...props } : {}
  if (children.length > 0) p.children = children.length === 1 ? children[0] : children
  return { type, props: p, key: (props?.key as string) ?? null }
}

/** Portal：渲染到远程容器 */
export function createPortal(children: VNodeChild, portalKey?: string): VNode {
  return {
    type: Portal,
    props: { children: Array.isArray(children) ? children : [children], portalKey: portalKey ?? 'default' },
    key: portalKey ?? null,
  } as unknown as VNode
}

export { Fragment, Portal }
