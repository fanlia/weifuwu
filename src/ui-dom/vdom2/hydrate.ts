/**
 * vdom2/hydrate — 游标收养（SSR HTML → 客户端，不重建 DOM）
 *
 * 流程：buildVNode 预构建（await 工厂——组件已 resolve、_child 已展开）→ 游标收养
 * （只接线属性/事件/ref——不重跑 renderFn）。vdom2 版：vnode2 强类型 + 类型守卫。
 *
 * 游标不变量：元素/文本 VNode 恰好消耗一个游标节点；组件/Fragment/数组透明；
 * null 消耗零；创建时 insertBefore(游标) 且游标不动；收养/替换时游标前进。
 */

import type { VNode, VNodeChild } from '../vnode.ts'
import type { BrowserEnv, WfuiContext } from '../types.ts'
import { isFrag, isComp, isPortal } from '../vnode.ts'
import { buildVNode } from './build.ts'
import { setProp } from './transform.ts'
import { createClientBrowser } from '../browser.ts'
import { componentName, type VdomCtx } from './ctx.ts'

const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'text', 'defs', 'use', 'clipPath'])

interface HydrationCursor {
  parent: Node
  node: Node | null
}

function cursorAdvance(c: HydrationCursor): void {
  c.node = c.node ? c.node.nextSibling : null
}

/** 创建节点：插到游标前（或父末尾），游标不动 */
function cursorInsert(c: HydrationCursor, n: Node): void {
  if (c.node && c.node.parentNode) c.node.parentNode.insertBefore(n, c.node)
  else c.parent.appendChild(n)
}

/** 替换游标节点（tag 不匹配）：消耗游标 */
function cursorReplace(c: HydrationCursor, n: Node): void {
  if (c.node && c.node.parentNode) {
    c.node.parentNode.replaceChild(n, c.node)
    cursorAdvance(c)
  } else {
    c.parent.appendChild(n)
  }
}

/** 属性接线（旧 props 为 null → 全量设置——含事件/ref） */
function wireProps(el: Element, props: Record<string, any>): void {
  for (const [key, value] of Object.entries(props)) {
    if (key === 'children' || key === 'key' || key === 'innerHTML') continue
    setProp(el, key, value)
  }
}

/** 游标收养渲染（只处理已构建树——buildVNode 已 await 工厂） */
function renderValueHydrating(v: VNodeChild, ctx: VdomCtx, c: HydrationCursor): Node | null {
  const b = (ctx.browser ?? createClientBrowser()) as BrowserEnv
  if (v == null || typeof v === 'boolean') return null
  if (typeof v === 'string' || typeof v === 'number') {
    const text = String(v)
    if (c.node && c.node.nodeType === 3) {
      if (c.node.textContent !== text) c.node.textContent = text
      cursorAdvance(c)
      return c.node
    }
    const tn = b.createTextNode(text) as Text
    cursorInsert(c, tn)
    return tn
  }
  if (Array.isArray(v)) {
    let first: Node | null = null
    for (const item of v) {
      const n = renderValueHydrating(item, ctx, c)
      if (n != null && !first) first = n
    }
    return first
  }
  const vnode = v as VNode

  // Portal/Fragment：就地内联收养（portal 内容不移动到 __wf_portal）
  if (isPortal(vnode) || isFrag(vnode)) {
    const children = vnode.props?.children
    const arr = children == null ? [] : (Array.isArray(children) ? children : [children])
    let first: Node | null = null
    for (const child of arr) {
      const n = renderValueHydrating(child, ctx, c)
      if (n != null && !first) first = n
    }
    return first
  }

  // 组件：用 buildVNode 预构建的 _child（已 resolve——不重跑工厂）
  if (isComp(vnode)) {
    const child = vnode._child
    if (child == null) {
      if (typeof vnode._render !== 'function') {
        throw new Error(`[vdom2] component ${componentName(vnode.type)} not built before hydration`)
      }
      vnode._child = null
      return null
    }
    const domNode = renderValueHydrating(child, ctx, c)
    if (!vnode._refNode) vnode._refNode = domNode
    return domNode
  }

  // 原生元素：收养（tag 匹配）或替换（mismatch 恢复）
  const tag = vnode.type as string
  const props = vnode.props ?? {}
  // 跳过 SSR 的所有 wf-hole 注释（占位 type=hole + 数组边界 fragment-start/end——
  // 客户端 renderValue 同构输出；否则游标停在注释 → 下一元素 cursorReplace 替换标记
  // → 数组项重复/位置错位——vdom2 矩阵 hydrate 实测）
  while (c.node && c.node.nodeType === 8 && (c.node as Comment).nodeValue?.startsWith('wf-hole:')) {
    cursorAdvance(c)
  }
  let el: Element
  if (c.node && c.node.nodeType === 1 && (c.node as Element).tagName.toLowerCase() === tag.toLowerCase()) {
    el = c.node as Element
    cursorAdvance(c)
  } else {
    el = (SVG_TAGS.has(tag) ? b.createElementNS('http://www.w3.org/2000/svg', tag) : b.createElement(tag as keyof HTMLElementTagNameMap)) as Element
    cursorReplace(c, el)
  }
  vnode.el = el

  wireProps(el, props)

  if ('innerHTML' in props) {
    // 服务端已输出 innerHTML 内容——收养不动
  } else {
    const childCursor: HydrationCursor = { parent: el, node: el.firstChild }
    const children = (Array.isArray(props.children) ? props.children : [props.children]).flat(Infinity)
    for (const child of children) {
      const n = renderValueHydrating(child, ctx, childCursor)
      if (n != null && n.parentNode !== el) el.appendChild(n)
      if (child && typeof child === 'object' && !Array.isArray(child) && isComp(child as VNode)) {
        const childVNode = child as VNode
        if (!childVNode._parentNode) {
          childVNode._parentNode = el
          childVNode._refNode = n
        }
      }
    }
    // 收尾：删除服务端有、客户端没有的多余子节点
    while (childCursor.node) {
      const n = childCursor.node
      childCursor.node = n.nextSibling
      n.parentNode?.removeChild(n)
    }
  }

  if ('value' in props && el instanceof HTMLSelectElement) {
    ;(el as HTMLSelectElement).value = String(props.value ?? '')
  }
  // ref 已由 wireProps → setProp 调用（与 render.ts 一致——只调一次）

  return el
}

/** Hydration 入口：buildVNode 预构建（await 工厂）→ 游标收养 */
export async function hydrateVNode(
  container: Element,
  vnode: VNode,
  ctx: VdomCtx,
): Promise<void> {
  const reg = ctx.__registry
  // 阶段 1：async 预构建——await 全部工厂（组件 resolve、_child 展开）
  await buildVNode(vnode, ctx, null, reg)
  // 阶段 2：游标收养（只接线——不重跑 renderFn）
  const cursor: HydrationCursor = { parent: container, node: container.firstChild }
  renderValueHydrating(vnode, ctx, cursor)
  // 收尾：清理服务端残留
  while (cursor.node) {
    const n = cursor.node
    cursor.node = n.nextSibling
    n.parentNode?.removeChild(n)
  }
}
