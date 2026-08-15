/**
 * vdom3 build — 异步组件构建（两阶段组件 → 纯 vnode 树）
 *
 * 与 vdom2 同模型：先 await 组件工厂 + renderFn → 构建产物（纯树）→ 同步渲染。
 * 组件实例复用：同位置同类型（patch 判定）→ 工厂不重跑（内部状态保持）。
 */

import type { VNode, VNodeChild, Component } from './types.ts'
import { Fragment } from './types.ts'
import { stream, nextNodeId } from './events.ts'

export function isVNode(v: unknown): v is VNode {
  return v != null && typeof v === 'object' && !Array.isArray(v) && 'type' in (v as any)
}

/** 构建 vnode 树（组件展开——异步；native/text 同步递归）。
 *  oldV：旧树同位置对照——同类型组件复用 _render（工厂不重跑——内部状态保持）。 */
export async function buildVNode(vnode: VNode, ctx: Record<string, unknown>, oldV?: VNode | null): Promise<VNode> {
  if (typeof vnode.type === 'function') {
    // 组件：同位置同类型 → 复用旧实例 _render；否则工厂执行（COMP_MOUNT）
    const reuse = oldV != null && typeof oldV === 'object' && oldV.type === vnode.type && oldV.key === vnode.key && oldV._render
      ? oldV
      : null
    if (reuse) {
      vnode._render = reuse._render
      vnode._id = reuse._id
    } else {
      vnode._id = nextNodeId()
      stream.emit({ type: 'COMP_MOUNT', id: vnode._id, name: compName(vnode.type), ts: Date.now() })
      vnode._render = await (vnode.type as Component)(vnode.props, ctx)
    }
    const output = await vnode._render!(vnode.props)
    if (output == null) { vnode.children = []; return vnode }
    // 展开输出：组件输出作为单子节点（渲染时输出组件 _child）——旧输出对照递归
    vnode.children = [output]
    const oldOut = reuse?.children?.[0]
    await buildVNode(output, ctx, oldOut != null && typeof oldOut === 'object' ? (oldOut as VNode) : null)
    return vnode
  }
  // native / Fragment：递归 children（跳过文本）
  const oldKids = oldV?.children ?? []
  let i = 0
  for (const c of vnode.children ?? []) {
    if (isVNode(c)) {
      const oc = oldKids[i]
      await buildVNode(c, ctx, oc != null && typeof oc === 'object' ? (oc as VNode) : null)
    }
    i++
  }
  return vnode
}

function compName(type: unknown): string {
  return typeof type === 'function' ? (type.name || 'anonymous') : String(type)
}

export { Fragment }
