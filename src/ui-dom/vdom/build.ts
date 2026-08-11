/**
 * vdom/build — async 预构建（阶段 1）
 *
 * 核心不变量：
 * - 组件 vnode 构建后 `_render` 已设（工厂只跑一次）
 * - 旧树同位置同类型复用 `_render`（工厂不重跑——组件跨渲染保持内部状态）
 * - 剪枝：已构建 + props 同 + 旧 _child 有值 → 复用旧 _child（renderFn 不重跑）
 * - 兄弟组件并行（工厂同步执行到第一个 await 后并发等待）
 * - **纯函数无 DOM**——构建产物只含 vnode 树
 */

import type { VNode, VNodeChild, Component } from '../vnode.ts'
import type { WfuiContext } from '../types.ts'
import { Fragment } from '../vnode.ts'
import { ensureId, type Registry } from './registry.ts'

/** 组件 props 浅比较（三态 skip 判定） */
export function componentPropsEqual(a: Record<string, any>, b: Record<string, any>): boolean {
  if (a === b) return true
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) {
    if (a[k] !== b[k]) return false
  }
  return true
}

/** 挂载 async 组件：await 工厂（两阶段：外层 mount 一次）→ 设 _render + 分配 id + childCtx */
export async function mountAsyncComponent(
  vnode: VNode,
  ctx: WfuiContext,
  reg: Registry,
  opts?: { reuse?: VNode },
): Promise<{ renderFn: (props: VNode['props']) => VNode | null; childCtx: WfuiContext }> {
  if (!vnode._id) {
    vnode._id = reg.nextId()
    reg.idRegistry.set(vnode._id, vnode)
  }
  const childCtx = Object.create(ctx) as WfuiContext
  childCtx.ui = Object.create(ctx.ui) as WfuiContext['ui'] & Record<string, unknown>
  const childUi = childCtx.ui as WfuiContext['ui'] & { _selfId?: string; _selfVNode?: VNode }
  childUi._selfId = vnode._id
  childUi._selfVNode = vnode
  // render-only：闭包绑定渲染（无 this 陷阱——根治 §4.5 selfId 错位：重挂载/解构不影响）
  childUi.render = function (this: any, ids?: string[]) {
    if (ids == null && vnode._id) ctx.ui.render([vnode._id])
    else ctx.ui.render(ids)
  }

  // 旧树同位置同类型复用（工厂不重跑——组件跨渲染保持内部状态）
  if (typeof vnode._render !== 'function' && typeof opts?.reuse?._render === 'function') {
    vnode._render = opts.reuse._render as (props: VNode['props']) => VNode | null
  }
  if (typeof vnode._render !== 'function') {
    // mount 保护期：$ 初始化赋值不产生 dirty 标记
    ;(ctx.ui as any)?.setMounting?.(true)
    let renderFn: unknown
    try {
      renderFn = await (vnode.type as Component)(vnode.props ?? {}, childCtx)
    } finally {
      ;(ctx.ui as any)?.endMounting?.()
    }
    if (typeof renderFn !== 'function') {
      throw new Error(
        `Component ${(vnode.type as any).name || 'anonymous'} must return a render function. ` +
          `Use (init_props, ctx) => (props) => VNode pattern.`,
      )
    }
    vnode._render = renderFn as (props: VNode['props']) => VNode | null
  }
  return { renderFn: vnode._render as (props: VNode['props']) => VNode | null, childCtx }
}

/**
 * 递归展开组件树（async）：await 工厂 → renderFn → 递归子树。**零 DOM**。
 *
 * - 组件节点保留在树上（挂 `_render` + `_child`）——$ dirty 精准刷新锚点不丢
 * - 兄弟组件 Promise.all 并行
 * - 旧树对照（oldInput）：同位置同类型组件复用旧 `_render`；同 props + 旧 _child 有值
 *   复用旧 `_child`（renderFn 不重跑——三态 skip 语义前置）
 * - 原地 mutate vnode（_render/_child）——引用保持
 */
export async function buildVNode(
  input: VNodeChild,
  ctx: WfuiContext,
  oldInput?: VNodeChild,
  reg?: Registry,
  opts?: { force?: boolean },
): Promise<VNodeChild> {
  if (input == null || typeof input === 'boolean' || typeof input === 'string' || typeof input === 'number') {
    return input
  }
  if (Array.isArray(input)) {
    const oldArr = Array.isArray(oldInput) ? oldInput : []
    await Promise.all(input.map((c, i) => buildVNode(c, ctx, oldArr[i], reg, opts)))
    return input
  }
  const vnode = input as VNode
  const registry = reg ?? ((ctx as any).__registry as Registry)
  const oldV =
    oldInput != null && typeof oldInput === 'object' && !Array.isArray(oldInput) &&
    (oldInput as VNode).type === vnode.type
      ? (oldInput as VNode)
      : null

  if (typeof vnode.type === 'function') {
    const { childCtx } = await mountAsyncComponent(vnode, ctx, registry, { reuse: oldV ?? undefined })
    // 剪枝：同 props + 旧 _child 有值 → 复用旧 _child（renderFn 不重跑）。
    // force（renderByIds 显式渲染）→ 强制重跑 renderFn（读最新状态）
    const propsSame = componentPropsEqual(oldV?.props ?? {}, vnode.props ?? {})
    if (opts?.force || !propsSame || oldV?._child == null) {
      const built = await buildVNode(vnode._render!(vnode.props), childCtx, oldV?._child, registry)
      vnode._child = (built ?? null) as VNode | VNode[] | null
    } else {
      vnode._child = oldV._child
    }
    return vnode
  }

  if (vnode.type === Fragment) {
    const built = await buildVNode(vnode.props?.children ?? null, ctx, oldV?._child ?? oldV?.props?.children, registry)
    vnode._child = (built ?? null) as VNode | VNode[] | null
    return vnode
  }

  // Native：递归 children（旧树同位置对照复用）
  if (typeof vnode.type === 'string' || typeof vnode.type === 'symbol') {
    const built = await buildVNode(vnode.props?.children ?? null, ctx, oldV?.props?.children, registry)
    vnode._child = (built ?? null) as VNode | VNode[] | null
    return vnode
  }

  return vnode
}
