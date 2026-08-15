/**
 * vdom3 jsx — vnode 创建（声明式——与 vdom2 同模型：renderFn 输出完整树）
 */

import type { VNode, VNodeChild } from './types.ts'
import { Fragment, Portal } from './types.ts'

export function h(
  type: string | symbol | import('./types.ts').Component,
  props?: Record<string, unknown> | null,
  ...children: VNodeChild[]
): VNode {
  // 单数组参数（h('div', props, [a, b])）→ 展开；多参（h('div', props, a, b)）→ 原样
  const kids = children.length === 1 && Array.isArray(children[0]) ? children[0] : children
  return { type, props: props ?? {}, children: kids as VNodeChild[], key: (props?.key as string) ?? null }
}

/** Portal：children 渲染到远程容器（#__wf_portal > [data-wf-portal-key=key]） */
/** Portal：children 渲染到远程容器（#__wf_portal > [data-wf-portal-key=key]） */
export function createPortal(children: VNodeChild, portalKey?: string): VNode {
  return {
    type: Portal, props: {}, children: Array.isArray(children) ? children : [children],
    key: portalKey ?? null, portalKey: portalKey ?? 'default',
  } as unknown as VNode
}

export { Fragment, Portal }
