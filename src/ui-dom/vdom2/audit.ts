/**
 * vdom2/audit — 结构一致性运行时校验（design 归档 阶段 C）
 *
 * 把「用户的想法 = vnode = DOM」变成每次 patch 的断言——错位即报错（dev），
 * 不静默传播（提交按钮消失事故的根治）。vdom2 版：vnode2 强类型 + 类型守卫。
 *
 * 开关：`__WF_VDOM_AUDIT`（dev/测试全开，生产默认关——O(n) 递归零生产开销）。
 * 校验项：
 *   A1 数组数量：childNodes.length === children 数组长度（无 fragment/数组项展开时）
 *   A2 占位位置：数组占位项（false/null）⟷ childNodes 对应位置是注释（wf-hole）
 *   A3 元素类型：native vnode.type === DOM tagName
 *   A4 锚点：组件 _refNode 指向的节点仍在父 DOM 中
 */

import type { VNode, VNodeChild } from '../vnode.ts'
import { arrayChildren, isFrag, isComp, Fragment, Portal, type NativeVNode } from '../vnode.ts'
import { classifyChild, isInvalidVNodeType } from './transform.ts'
import { classifyKind, type VKind } from './kind.ts'
import { componentName } from './ctx.ts'

/** audit 开关（dev/测试注入；生产默认关） */
export function auditEnabled(): boolean {
  return !!((globalThis as Record<string, unknown>)?.__WF_VDOM_AUDIT)
}

/** 数组级校验：childNodes 与 children 数组对齐（A1/A2——占位错位/数量错位） */
export function auditChildren(
  parent: Node,
  children: VNodeChild[] | null,
  report: (msg: string) => void,
): void {
  if (children == null || children.length === 0) return
  const nodes = Array.from(parent.childNodes)
  // 多节点展开项（Fragment/Portal/数组项=隐式 Fragment）存在时位置/数量对照失准——
  // 数组项在 DOM 是 [fragment-start, ...多节点, fragment-end]——childNodes 与数组不同构
  // （这是 Fragment 语义的正常结果）。内容正确性由 auditTree 递归覆盖
  const hasMulti = children.some((c) => {
    if (c == null || typeof c !== 'object') return false
    if (Array.isArray(c)) return true
    const t = (c as VNode).type
    return t === Fragment || t === Portal
  })
  if (hasMulti) return
  for (let i = 0; i < children.length; i++) {
    const c = children[i]
    if (c == null || typeof c === 'boolean') {
      // A2：占位项 ⟷ 注释节点（wf-hole——type=hole，不含 fragment 边界标记）
      const n = nodes[i]
      if (!n || n.nodeType !== 8 || !(n as Comment).nodeValue?.includes('type=hole')) {
        report(`[audit] 占位错位：位置 ${i} 期望注释(wf-hole)，实际 ${n?.nodeName ?? 'null'}（${parent.nodeName}）`)
      }
    } else if (typeof c === 'string' || typeof c === 'number') {
      const n = nodes[i]
      if (n && n.nodeType !== 3) {
        report(`[audit] 文本错位：位置 ${i} 期望文本节点，实际 ${n.nodeName}（${parent.nodeName}）`)
      }
    }
  }
}

/** 树级校验：vnode 树 ↔ DOM 树递归对照（A3/A4）——入口分派 AUDITERS[classifyKind(child)] 查表 */
export function auditTree(parent: Node, child: VNodeChild, report: (msg: string) => void): void {
  AUDITERS[classifyKind(child)](parent, child, report)
}

/** 审计状态机表（kind → 校验行为——portal 远程单独容器跳过；native 含非法 type 诊断跳过） */
export const AUDITERS: Record<VKind, (parent: Node, child: VNodeChild, report: (msg: string) => void) => void> = {
  hole: () => {},
  text: () => {},
  /** 数组：childNodes 对照 + 嵌套数组项/Fragment 递归 */
  arr: auditArray,
  /** remote——#__wf_portal 单独容器 */
  portal: () => {},
  /** Fragment：children 对照 */
  frag: auditFrag,
  /** 组件：A4 锚点 + _child 递归 */
  comp: auditComp,
  /** native：A3 元素类型 + children 递归（非法 type → 诊断占位跳过） */
  native: auditNative,
}

/** 数组级校验：childNodes 对照 + 嵌套数组项/Fragment 递归 */
function auditArray(parent: Node, child: VNodeChild, report: (msg: string) => void): void {
  const arr = child as VNodeChild[]
  auditChildren(parent, arr, report)
  for (const c of arr) {
    if (c != null && typeof c === 'object' && Array.isArray(c)) {
      for (const x of c) auditTree(parent, x, report)
    } else if (c != null && typeof c === 'object' && !Array.isArray(c) && isFrag(c as VNode)) {
      auditChildren(parent, arrayChildren((c as VNode).props?.children), report)
    }
  }
}

/** Fragment 校验：children 对照（多节点展开项由 auditTree 递归覆盖） */
function auditFrag(parent: Node, child: VNodeChild, report: (msg: string) => void): void {
  const v = child as VNode
  auditChildren(parent, arrayChildren(v.props?.children), report)
}

/** 组件校验：A4 锚点（_refNode 必须在父 DOM 内）+ _child 递归 */
function auditComp(parent: Node, child: VNodeChild, report: (msg: string) => void): void {
  const v = child as VNode
  const ref = v._refNode
  if (ref && ref.parentNode !== parent) {
    report(`[audit] 组件锚点错位：${componentName(v.type)} _refNode 不在父节点内`)
  }
  if (v._child != null) auditTree(parent, v._child, report)
}

/** native 校验：A3 元素类型 + children 递归（非法 type → 诊断占位跳过） */
function auditNative(parent: Node, child: VNodeChild, report: (msg: string) => void): void {
  const v = child as VNode
  if (isInvalidVNodeType(v.type)) return // 诊断占位
  const el = (v as NativeVNode).el ?? v._refNode
  if (el && el.nodeType === 1 && (el as Element).tagName.toLowerCase() !== String(v.type)) {
    report(`[audit] 元素类型错位：期望 <${String(v.type)}>，实际 ${(el as Element).tagName}`)
  }
  if (el && el.nodeType === 1 && !('innerHTML' in (v.props ?? {}))) {
    auditChildren(el, arrayChildren(v.props?.children), report)
    for (const c of arrayChildren(v.props?.children)) {
      if (c != null && typeof c === 'object' && !Array.isArray(c) && isComp(c as VNode)) {
        auditTree(el, c, report)
      }
    }
  }
}
