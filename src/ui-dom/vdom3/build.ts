/**
 * vdom3 build — 异步组件构建（两阶段组件 → 纯 vnode 树）
 *
 * 与 vdom2 同模型：先 await 组件工厂 + renderFn → 构建产物（纯树）→ 同步渲染。
 * 组件实例复用：同位置同类型（patch 判定）→ 工厂不重跑（内部状态保持）。
 */

import type { VNode, VNodeChild, Component, PortalVNode } from './types.ts'
import { Fragment, Portal, childrenOf } from './types.ts'
import { stream, nextNodeId } from './events.ts'
import { createV3Ui } from './ui.ts'

/** 组件卸载钩子注册表（组件 id → 清理函数——COMP_UNMOUNT 时调用） */
const unmountHooks = new Map<string, () => void>()

export function runUnmountHooks(id: string): void {
  const h = unmountHooks.get(id)
  if (h) { try { h() } catch { /* 清理错误隔离 */ } unmountHooks.delete(id) }
}

export function isVNode(v: unknown): v is VNode {
  return v != null && typeof v === 'object' && !Array.isArray(v) && 'type' in (v as any)
}

/** 构建 vnode 树（组件展开——异步；native/text 同步递归）——**纯函数式**：
 *  每层返回克隆（不就地修改入参）——update 的对照树（current）不被污染。
 *  oldV：旧树同位置对照——同类型组件复用 _render（工厂不重跑——内部状态保持）。 */
export async function buildVNode(vnode: VNode, ctx: Record<string, unknown>, oldV?: VNode | null): Promise<VNode> {
  if (typeof vnode.type === 'function') {
    // 克隆（组件实例字段 _render/_id/_child 写克隆——旧树保持完整）
    const v = { ...vnode } as VNode
    const reuse = oldV != null && typeof oldV === 'object' && oldV.type === vnode.type && oldV.key === vnode.key && oldV._render
      ? oldV
      : null
    if (reuse) {
      v._render = reuse._render
      v._id = reuse._id
    } else {
      v._id = nextNodeId()
      stream.emit({ type: 'COMP_MOUNT', id: v._id, name: compName(v.type), ts: Date.now() })
      // 组件 ctx：onUnmount 钩子（卸载清理注册——COMP_UNMOUNT 时执行）
      // + ui（vdom2 兼容面——hooks shim——组件库零改动）
      const compId = v._id
      // Object.create 保留原型链（vdom2 extendCtx 中间件组合——spread 会丢失链上字段）
      const compCtx = Object.assign(Object.create(ctx), {
        onUnmount: (fn: () => void) => { unmountHooks.set(compId, fn) },
        ui: createV3Ui(compId, () => { (ctx as any).render?.() }, (fn) => { unmountHooks.set(compId, fn) }),
      })
      v._render = await (v.type as Component)(v.props, compCtx)
    }
    const output = await v._render!(v.props)
    v._child = null
    const oldOut = (reuse as any)?._child ?? null
    if (output) {
      // 输出递归构建——_child 存克隆（渲染链完整：克隆输出含全部子克隆）
      const built = await buildVNode(output, ctx, oldOut != null && typeof oldOut === 'object' ? (oldOut as VNode) : null)
      v._child = built
    }
    return v
  }
  // native / Fragment / Portal：递归 children（跳过文本）——克隆 + 新 children 数组
  const v = { ...vnode } as VNode
  const oldKids = childrenOf(oldV ?? ({} as VNode))
  let i = 0
  let newKids: VNodeChild[] | null = null
  for (const c of childrenOf(vnode)) {
    if (isVNode(c)) {
      const oc = oldKids[i]
      const built = await buildVNode(c, ctx, oc != null && typeof oc === 'object' ? (oc as VNode) : null)
      if (built !== c) { newKids ??= [...childrenOf(vnode)]; newKids[i] = built }
    }
    i++
  }
  if (newKids) v.children = newKids
  return v
}

export function isPortal(v: unknown): v is PortalVNode {
  return v != null && typeof v === 'object' && (v as any).type === Portal
}

function compName(type: unknown): string {
  return typeof type === 'function' ? (type.name || 'anonymous') : String(type)
}

export { Fragment }
