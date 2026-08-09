/**
 * weifuwu/ui-dom SSR — VNode → HTML 字符串（完全独立，不依赖 src/client）
 *
 * 定稿架构：SSR 是链尾落地中间件（VDOM → HTML），handler 只产 VNode。
 * renderHtml(vnode) → HTML 字符串（Node 环境无 DOM 依赖）。
 */

import type { VNode, VNodeChild } from './types.ts'

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])

/** 转义文本/属性 */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** VNode 树 → HTML 字符串 */
export function renderHtml(v: VNodeChild, ctx?: any): string {
  if (v == null || typeof v === 'boolean') return ''
  if (typeof v === 'string' || typeof v === 'number') return esc(String(v))
  if (Array.isArray(v)) return v.map(c => renderHtml(c, ctx)).join('')

  const vnode = v as VNode

  // 组件（两阶段：mount → render → 递归）
  if (typeof vnode.type === 'function') {
    const Comp = vnode.type as Function
    const renderFn = (Comp as any)(vnode.props ?? {}, ctx)
    if (typeof renderFn !== 'function') return ''
    const childVNode = renderFn(vnode.props ?? {})
    if (childVNode == null) return ''
    return renderHtml(childVNode, ctx)
  }

  // Fragment
  if (vnode.type === Symbol.for('wf-fragment')) {
    return normalizeChildren(vnode.props?.children).map(c => renderHtml(c, ctx)).join('')
  }

  // 原生元素
  const tag = vnode.type as string
  const attrs: string[] = []
  for (const [key, value] of Object.entries(vnode.props ?? {})) {
    if (key === 'children' || key === 'key' || key === 'ref') continue
    if (key.startsWith('on')) continue // 事件不 SSR
    if (value === false || value == null) continue
    const name = key === 'className' ? 'class' : key
    if (value === true) {
      attrs.push(` ${name}`)
    } else if (key === 'style' && typeof value === 'object') {
      const css = Object.entries(value as Record<string, any>)
        .map(([k, val]) => `${k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}:${val}`)
        .join(';')
      attrs.push(` style="${esc(css)}"`)
    } else {
      attrs.push(` ${name}="${esc(String(value))}"`)
    }
  }
  const inner = normalizeChildren(vnode.props?.children).map(c => renderHtml(c, ctx)).join('')
  if (VOID_TAGS.has(tag)) return `<${tag}${attrs.join('')}>`
  return `<${tag}${attrs.join('')}>${inner}</${tag}>`
}

function normalizeChildren(children: any): VNodeChild[] {
  if (children == null) return []
  return Array.isArray(children) ? children : [children]
}
