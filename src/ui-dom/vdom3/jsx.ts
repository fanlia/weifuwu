/**
 * vdom3 jsx — vnode 创建（声明式——与 vdom2 同模型：renderFn 输出完整树）
 */

import type { VNode, VNodeChild } from './types.ts'
import { Fragment } from './types.ts'

export function h(
  type: string | symbol | import('./types.ts').Component,
  props?: Record<string, unknown> | null,
  ...children: VNodeChild[]
): VNode {
  // 单数组参数（h('div', props, [a, b])）→ 展开；多参（h('div', props, a, b)）→ 原样
  const kids = children.length === 1 && Array.isArray(children[0]) ? children[0] : children
  return { type, props: props ?? {}, children: kids as VNodeChild[], key: (props?.key as string) ?? null }
}

export { Fragment }
