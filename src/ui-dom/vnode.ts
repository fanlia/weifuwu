/**
 * weifuwu/ui-dom VNode 工厂 — 完全独立（不依赖 src/client）
 *
 * VNode = 数据结构（type/props/key）——res 的载体，serveUI（VDOM）落地到 DOM
 * ⚠️ 不 declare global JSX（避免与 src/client 的 JSX 命名空间冲突）——
 *    开发期用 h() 或独立 jsxImportSource。
 */

import type { VNode, VNodeChild } from './types.ts'
export type { VNode, VNodeChild } from './types.ts'

/** JSX 元素类型（字符串标签或组件函数） */
export type VNodeType = string | ((props: any, ctx: any) => any) | symbol

const Fragment = Symbol('Fragment')

/** h — hyperscript：h('div', {class:'x'}, child1, child2) */
export function h(type: VNodeType, props: Record<string, any> | null, ...children: VNodeChild[]): VNode {
  const p = normalizeProps(props ?? {})
  if (children.length > 0) {
    p.children = children.length === 1 ? children[0] : children
  }
  return { type, props: p, key: props?.key }
}

/** jsx — JSX 编译器调用 */
export function jsx(type: VNodeType, props: Record<string, any> | null, key?: string | null): VNode {
  return { type, props: normalizeProps(props), key: key ?? undefined }
}

export const jsxs = jsx
export const jsxDEV = jsx

function normalizeProps(props: Record<string, any> | null): Record<string, any> {
  if (!props) return {}
  const result: Record<string, any> = {}
  for (const key of Object.keys(props)) {
    if (key === 'key') continue
    result[key] = props[key]
  }
  return result
}

export { Fragment }
