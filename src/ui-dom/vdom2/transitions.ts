/**
 * vdom2 x2y 转换状态机——**源类型驱动**：每个 (源, 目标) 组合一个转换函数，
 * TRANSITIONS[oldKind][newKind] 查表分派（patchValue 用）。
 *
 * 转换动作由**源类型**决定（源最清楚自己的 DOM 形态如何移除/递归/复用）：
 * - 同类型：递归 patch（frag→frag children diff / comp→comp 输出递归 / native→native
 *   同 tag in-place / arr→arr 数组递归 / text→text nodeValue 直改 / hole→hole 占位保持 /
 *   portal→portal 远程 patch）
 * - 异类型：toOther 通用——renderValue 渲染目标 + removeOldOutput 移除旧输出
 *   （removeOldOutput 内部 getOutputRange 多态——每类输出范围：Fragment._childNodes /
 *   组件 _outputChild 递归 / 数组 fragment-start..end 标记）
 *
 * 全量组合表显式列出——vdom2-matrix.test.ts 9×9 矩阵验证无遗漏。
 */

import type { VNode, VNodeChild } from './vnode.ts'
import { Fragment, Portal, isFrag, isComp, isNative, isPortal } from './vnode.ts'
import { classifyKind, getOutputRange, type PatchState, type VKind } from './kind.ts'
import { renderValue, createHole } from './render.ts'
import { removeOldOutput, patchChildren, patchProps, patchValue, disposeComponent, type PatchCtx } from './patch.ts'
import { callRefCleanupFor } from './registry.ts'
import { createClientBrowser } from '../browser.ts'

type TransitionFn = (s: PatchState) => Node | null

// ── 通用转换 ──

/** 异类型通用：渲染目标 + 移除旧输出（removeOldOutput 内部 getOutputRange 多态） */
function toOther(s: PatchState): Node | null {
  const { parent, oldNode, oldInput, ctx } = s
  const node = renderValue(s.newInput, ctx, ctx.browser ?? createClientBrowser())
  if (node == null) return null
  if (oldNode?.parentNode) {
    const ref = removeOldOutput(oldInput, oldNode, parent, ctx)
    if (ref && ref.parentNode === parent) parent.insertBefore(node, ref)
    else parent.appendChild(node)
    return node
  }
  parent.appendChild(node)
  return node
}

/** 目标为占位：移除旧输出（多节点范围/单节点/组件 dispose）——无新节点 */
function toHole(s: PatchState): Node | null {
  removeOldOutput(s.oldInput, s.oldNode, s.parent, s.ctx)
  return null
}

// ── hole（占位）转换 ──

/** hole → hole：占位保持（占位法长度恒定——不重建不删除；内容更新 nodeValue 直改） */
function holeToHole(s: PatchState): Node | null {
  const on = s.oldNode
  if (on?.nodeType === 8) {
    const newHole = createHole(s.ctx.browser ?? createClientBrowser(), s.newInput)
    if (newHole && on.nodeValue !== newHole.nodeValue) on.nodeValue = newHole.nodeValue
    return on
  }
  return null
}

/** hole → 真实值：新增（渲染目标 + 插入——占位法 hole 位置被顶替） */
function holeToOther(s: PatchState): Node | null {
  const { parent, oldNode, ctx } = s
  const node = renderValue(s.newInput, ctx, ctx.browser ?? createClientBrowser())
  if (node == null) return null
  if (oldNode?.parentNode) {
    oldNode.parentNode.replaceChild(node, oldNode)
  } else if (oldNode) {
    parent.insertBefore(node, oldNode)
  } else {
    parent.appendChild(node)
  }
  return node
}

// ── text 转换 ──

/** text → text：nodeValue 直改（V3-1——1 次属性写替代 createTextNode + replace） */
function textToText(s: PatchState): Node | null {
  const { parent, oldNode, oldInput } = s
  const str = String(s.newInput)
  if (String(oldInput) !== str) {
    if (oldNode && oldNode.nodeType === 3) {
      oldNode.nodeValue = str
      return oldNode
    }
    const t = parent.ownerDocument!.createTextNode(str)
    if (oldNode?.parentNode) oldNode.parentNode.replaceChild(t, oldNode)
    else parent.appendChild(t)
    return t
  }
  return oldNode
}

// ── native 转换 ──

/** native → native：同 tag in-place（props + children diff）；异 tag → toOther（整体替换） */
function nativeToNative(s: PatchState): Node | null {
  const { parent, oldNode, oldInput, ctx } = s
  const newV = s.newInput as VNode
  const oldV = oldInput && typeof oldInput === 'object' && !Array.isArray(oldInput) ? (oldInput as VNode) : null
  const newTag = newV.type as string
  if (oldNode && oldNode.nodeType === 1 && (oldV?.type ?? null) === newTag && isNative(newV)) {
    const el = oldNode as Element
    newV.el = el
    patchProps(el, oldV?.props ?? {}, newV.props ?? {})
    // 规则表 §2 innerHTML：存在则 children 不渲染——diff 与 renderValue 同一判断（行为统一）
    if (!('innerHTML' in (newV.props ?? {}))) {
      const anchors: (Node | null)[] = []
      // 锚点优先（_childAnchors 每位置首节点——fragment/数组项多节点展开后不错位）
      patchChildren(el, oldV?.props?.children ?? null, newV.props?.children ?? null, ctx, undefined, isNative(oldV) ? oldV._childAnchors ?? undefined : undefined, anchors)
      newV._childAnchors = anchors
    }
    return el
  }
  return toOther(s)
}

// ── frag 转换 ──

/** frag → frag：children 递归 diff（patchChildren——Fragment 透明容器） */
function fragToFrag(s: PatchState): Node | null {
  const { parent, oldNode, oldInput, ctx } = s
  const newV = s.newInput as VNode
  const oldV = oldInput && typeof oldInput === 'object' && !Array.isArray(oldInput) ? (oldInput as VNode) : null
  const oldRange = isFrag(oldV) && oldV._childNodes ? oldV._childNodes : undefined
  // oldInput 传旧 Fragment 的 props.children（旧 vnode 本身会导致 oldChildren 错位 1 项
  // ——[fragV] vs [b1,b2] → 替换路径新建节点 → 重复残留；diff-fragment 真实 bug）
  const range = patchChildren(parent, oldV?.props?.children ?? oldInput, newV.props?.children ?? null, ctx, oldRange)
  if (isFrag(newV)) newV._childNodes = range.filter(Boolean) as Node[]
  if (oldNode?.parentNode && oldNode.nodeType === 8) oldNode.parentNode.removeChild(oldNode)
  return oldNode && oldNode.nodeType === 1 ? oldNode : (range[0] ?? null)
}

// ── comp 转换 ──

/** comp → comp：输出递归 diff（三态 skip + id 传递 + _outputChild 回写） */
function compToComp(s: PatchState): Node | null {
  const { parent, oldNode, oldInput, ctx } = s
  const newV = s.newInput as VNode
  if (!isComp(newV) || typeof newV._render !== 'function') {
    throw new Error(
      `[vdom2] component ${(newV.type as any).name || 'anonymous'} not built in diff — buildVNode must run before patchValue`,
    )
  }
  const oldV = oldInput && typeof oldInput === 'object' && !Array.isArray(oldInput) ? (oldInput as VNode) : null

  // 三态 skip（diff 信任 buildVNode 产出——剪枝命中时 _child 引用相等 → 子树未变）
  const typeSame = oldV?.type === newV.type
  if (!ctx.force && oldV && typeSame && oldV._child !== undefined && newV._child === oldV._child) {
    return oldNode
  }

  // id 传递 + 注册
  if (oldV?.type === newV.type && oldV._id) {
    newV._id = oldV._id
    ctx.registry.idRegistry.set(newV._id, newV)
  }
  newV._parentNode = parent
  if (oldNode) newV._refNode = oldNode

  // 渲染输出（_child 必已由 buildVNode 预构建——diff 同步上下文永不执行 renderFn）
  const childNew = newV._child
  if (childNew === undefined) {
    throw new Error(
      `[vdom2] component ${(newV.type as any).name || 'anonymous'} not built (missing _child) — buildVNode must run before patchValue`,
    )
  }
  // 输出 vnode 引用（独立于 dispose 的 _child 链——getOutputRange 递归终点）
  newV._outputChild = childNew
  const returned = patchValue(parent, oldNode, oldV?._child, childNew, ctx)
  if (returned) newV._refNode = returned
  return returned
}

// ── arr 转换 ──

/** arr → arr：数组 children 递归 diff（顶层数组转 fragment 语义） */
function arrToArr(s: PatchState): Node | null {
  const { parent, oldNode, oldInput, ctx } = s
  // V3-3a：数组引用相同 → 内容未变（构建产物不可变约定——引用相同 = 未变，短路零操作）
  if (oldInput === s.newInput && oldNode?.parentNode) return oldNode
  const frag = parent.ownerDocument!.createDocumentFragment()
  const range = patchChildren(parent, oldInput, s.newInput, ctx, oldNode ? [oldNode] : undefined)
  for (const n of range) if (n) frag.appendChild(n)
  if (oldNode?.parentNode) {
    // frag 可能已含 oldNode（patchChildren 对照复用了旧 DOM）——replaceChild(frag, oldNode)
    // 会抛 HierarchyRequestError（new child contains parent）——此时只需 append（节点被移动）
    if (!frag.contains(oldNode)) oldNode.parentNode.replaceChild(frag, oldNode)
    else parent.appendChild(frag)
  } else {
    parent.appendChild(frag)
  }
  return frag
}

// ── portal 转换 ──

/** portal → portal：远程容器内容 patch（复用容器——不重建，避免丢 ref 状态/闪烁） */
function portalToPortal(s: PatchState): Node | null {
  const { ctx, oldInput } = s
  const newV = s.newInput as VNode
  const oldV = oldInput && typeof oldInput === 'object' && !Array.isArray(oldInput) ? (oldInput as VNode) : null
  if (isPortal(oldV) && isPortal(newV)) {
    const container = oldV._remoteEl
    if (container) {
      const oldChild = oldV.props?.children ?? null
      const newChild = newV.props?.children ?? null
      // patchChildren 直接处理（复用容器 patch 子节点，不操作父 DOM——避免闪烁/丢状态）
      patchChildren(container, oldChild, newChild, ctx)
    }
    newV._remoteEl = oldV._remoteEl
    return null
  }
  return toOther(s)
}

// ── 状态机表（全量组合显式列出——vdom2-matrix 9×9 验证无遗漏） ──

function table(overrides: Partial<Record<VKind, TransitionFn>>): Record<VKind, TransitionFn> {
  return {
    text: toOther, native: toOther, frag: toOther, comp: toOther, arr: toOther, hole: toHole, portal: toOther,
    ...overrides,
  }
}

export const TRANSITIONS: Record<VKind, Record<VKind, TransitionFn>> = {
  text: table({ text: textToText }),
  hole: table({ text: holeToOther, native: holeToOther, frag: holeToOther, comp: holeToOther, arr: holeToOther, portal: holeToOther, hole: holeToHole }),
  native: table({ native: nativeToNative }),
  frag: table({ frag: fragToFrag }),
  comp: table({ comp: compToComp }),
  arr: table({ arr: arrToArr }),
  portal: table({ portal: portalToPortal }),
}

/** x2y 状态机分派：由源类型（oldInput）与目标类型（newInput）查表调用转换函数 */
export function x2y(s: PatchState): Node | null {
  const from = classifyKind(s.oldInput)
  const to = classifyKind(s.newInput)
  return TRANSITIONS[from][to](s)
}

export type { PatchCtx }
export { Fragment, Portal }
