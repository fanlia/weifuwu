/**
 * weifuwu/client Hydration（游标收养）— 收养服务端 HTML，不重建 DOM
 *
 * 从 render.ts 拆出（P2 结构拆分）。依赖：render.ts（flattenChildren/SVG 常量）、
 * diff.ts（patchProps）、registry.ts（idRegistry/nextComponentId/resolveAsyncFactory）。
 */

import type { VNode, Component, AsyncComponent } from './vnode.ts'
import type { UiInternal } from './ui.ts'
import { Fragment, Portal, isAsyncComponent } from './vnode.ts'
import type { WfuiContext } from './types.ts'
import { flattenChildren, SVG_NS, SVG_TAGS } from './render.ts'
import { createClientBrowser } from './browser.ts'
import type { BrowserEnv } from './types.ts'
import { patchProps } from './diff.ts'
import { getRegistry, nextComponentIdFor, resolveAsyncFactory } from './registry.ts'

/**
 * 游标：当前遍历位置对应的 DOM 节点。
 * 不变量：元素/文本 VNode 恰好消耗一个游标节点；组件/Fragment/数组透明；null 消耗零；
 * 创建时 insertBefore(游标) 且游标不动；收养/替换时游标前进。
 */
interface HydrationCursor {
  parent: Node
  node: Node | null
}

function cursorAdvance(c: HydrationCursor) {
  c.node = c.node ? c.node.nextSibling : null
}

/** 创建节点：插到游标前（或父末尾），游标不动 */
function cursorInsert(c: HydrationCursor, n: Node) {
  if (c.node && c.node.parentNode) c.node.parentNode.insertBefore(n, c.node)
  else c.parent.appendChild(n)
}

/** 替换游标节点（tag 不匹配）：消耗游标（前进到原节点下一个兄弟） */
function cursorReplace(c: HydrationCursor, n: Node) {
  if (c.node && c.node.parentNode) {
    c.node.parentNode.replaceChild(n, c.node)
    cursorAdvance(c)
  } else {
    c.parent.appendChild(n)
  }
}

/**
 * Hydration 渲染：收养现有 DOM（不重建），只接线事件/属性/ref。
 * async：await 工厂（hydration 时 __DATA__ 同步命中，微任务即 resolve）。
 */
async function renderValueHydrating(v: any, ctx: WfuiContext, c: HydrationCursor): Promise<Node | null> {
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
      const n = await renderValueHydrating(item, ctx, c)
      if (n != null && !first) first = n
    }
    return first
  }
  const vnode = v as VNode

  // Portal/Fragment：就地内联收养（v1 裁剪：portal 内容不移动到 __wf_portal）
  if (vnode.type === Portal || vnode.type === Fragment) {
    const children = vnode.props?.children
    const arr = children == null ? [] : (Array.isArray(children) ? children : [children])
    let first: Node | null = null
    for (const child of arr) {
      const n = await renderValueHydrating(child, ctx, c)
      if (n != null && !first) first = n
    }
    return first
  }

  // 组件（同步或 async 工厂）
  if (typeof vnode.type === 'function') {
    return renderComponentHydrating(vnode, ctx, c)
  }

  // 原生元素：收养（tag 匹配）或替换（mismatch 恢复）
  const tag = vnode.type as string
  const props = vnode.props ?? {}
  let el: Element
  if (c.node && c.node.nodeType === 1 && (c.node as Element).tagName.toLowerCase() === tag.toLowerCase()) {
    el = c.node as Element
    cursorAdvance(c)
  } else {
    el = (SVG_TAGS.has(tag) ? b.createElementNS(SVG_NS, tag) : b.createElement(tag as keyof HTMLElementTagNameMap)) as Element
    cursorReplace(c, el)
  }
  vnode.el = el

  // 属性 + 事件接线（oldProps 为 null → 全量设置）
  patchProps(el, null, props)

  if ('innerHTML' in props) {
    // 服务端已输出 innerHTML 内容——收养不动
  } else {
    const childCursor: HydrationCursor = { parent: el, node: el.firstChild }
    const children = flattenChildren(props.children)
    for (const child of children) {
      const n = await renderValueHydrating(child, ctx, childCursor)
      if (n != null && n.parentNode !== el) el.appendChild(n)
      // 为子组件 VNode 设置 DOM 锚点（供 ctx.ui.render() scope 使用）
      if (child && typeof child === 'object' && typeof (child as VNode).type === 'function') {
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

  // select value（options 生成后设置）
  if ('value' in props && el instanceof HTMLSelectElement) {
    ;(el as HTMLSelectElement).value = String(props.value ?? '')
  }
  // ref 回调：收养的 DOM 立即接线
  if (typeof props.ref === 'function') props.ref(el)

  return el
}

/** Hydration 组件：await 工厂（或同步 mount）→ render → 递归收养；填充实例簿记 */
async function renderComponentHydrating(vnode: VNode, ctx: WfuiContext, c: HydrationCursor): Promise<Node | null> {
  // ctx.ui 由 createApp 注入（类型必需字段）——不补默认（同 renderComponent）

  if (!vnode._id) {
    const reg = getRegistry(ctx)
    vnode._id = nextComponentIdFor(reg)
    reg.idRegistry.set(vnode._id, vnode)
  }
  const childCtx = Object.create(ctx) as WfuiContext
  childCtx.ui = Object.create(ctx.ui) as WfuiContext['ui'] & UiInternal
  const childUi = childCtx.ui as WfuiContext['ui'] & UiInternal
  childUi._selfId = vnode._id
  childUi._selfVNode = vnode
  vnode._ctxVersion = childUi._ctxVersion ?? 0

  const Comp = vnode.type as Component | AsyncComponent
  let childVNode: VNode | null
  try {
    let def: Component
    if (isAsyncComponent(Comp)) {
      def = await resolveAsyncFactory(getRegistry(ctx), Comp, childCtx)
    } else {
      def = Comp as Component
    }
    const renderFn = def(vnode.props ?? {}, childCtx)
    if (typeof renderFn !== 'function') {
      throw new Error(
        `Component ${Comp.name || 'anonymous'} must return a render function. ` +
        `Use (init_props, ctx) => (props) => VNode pattern.`
      )
    }
    vnode._render = renderFn
    childVNode = renderFn(vnode.props ?? {})
  } catch (e) {
    const errHandler = (ctx.ui as (WfuiContext['ui'] & UiInternal) | undefined)?._errorHandler
    if (errHandler) {
      errHandler(e)
      childVNode = null
    } else {
      console.error(
        `[weifuwu] Component hydration error in <${Comp.name || 'anonymous'}> (id: ${vnode._id ?? '?'})`,
        e,
      )
      childVNode = null
    }
  }

  if (childVNode == null) {
    vnode._child = null
    return null
  }
  vnode._child = childVNode
  const domNode = await renderValueHydrating(childVNode, childCtx, c)
  if (!vnode._refNode) {
    vnode._refNode = domNode
  }
  return domNode
}

/**
 * Hydration 挂载入口：收养 container 内现有服务端 HTML。
 * 渲染完收尾：删除服务端有、客户端没有的残留 DOM。
 */
export async function hydrateVNode(container: Element, vnode: VNode, ctx: WfuiContext): Promise<void> {
  const cursor: HydrationCursor = { parent: container, node: container.firstChild }
  await renderValueHydrating(vnode, ctx, cursor)
  // 收尾：清理残留
  while (cursor.node) {
    const n = cursor.node
    cursor.node = n.nextSibling
    n.parentNode?.removeChild(n)
  }
}
