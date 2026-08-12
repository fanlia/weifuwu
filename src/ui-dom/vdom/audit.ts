/**
 * vdom/audit — 结构一致性运行时校验（design/vdom-consistency-plan.md 阶段 C）
 *
 * 规则表（design/vdom-transform-rules.md）的运行时保证：把「用户的想法 = vnode = DOM」从
 * 设计承诺变成每次 patch 的断言——错位即报错（dev），不静默传播（提交按钮消失事故的根治）。
 *
 * 开关：`__WF_VDOM_AUDIT`（dev/测试全开，生产默认关——O(n) 递归零生产开销）。
 * 校验项：
 *   A1 数组数量：childNodes.length === children 数组长度（无 fragment/数组项展开时）
 *   A2 占位位置：数组占位项（false/null）⟷ childNodes 对应位置是注释（wf-hole）
 *   A3 元素类型：native vnode.type === DOM tagName
 *   A4 锚点：组件 _refNode 指向的节点仍在父 DOM 中
 */
import type { VNode, VNodeChild } from '../vnode.ts'
import { Fragment, Portal, normalizeChildren } from '../vnode.ts'
import { classifyChild, isInvalidVNodeType } from './transform.ts'

/** audit 开关（dev/测试注入；生产默认关） */
export function auditEnabled(): boolean {
  return !!(globalThis as any)?.__WF_VDOM_AUDIT
}

/** 数组级校验：childNodes 与 children 数组对齐（A1/A2——占位错位/数量错位，本次事故类别） */
export function auditChildren(
  parent: Node,
  children: VNodeChild[] | null | undefined,
  report: (msg: string) => void,
): void {
  if (children == null || children.length === 0) return
  const nodes = Array.from(parent.childNodes)
  // fragment/数组项（多节点展开）存在时数量对照失准——跳过 A1（A2 占位仍查）
  const hasMulti = children.some((c) => {
    if (c == null || typeof c !== 'object' || Array.isArray(c)) return false
    const t = (c as VNode).type
    return t === Fragment || t === Portal
  })
  if (!hasMulti) {
    if (nodes.length !== children.length) {
      report(`[audit] 数组数量错位：${parent.nodeName} 期望 ${children.length} 个 childNodes，实际 ${nodes.length}（vnode/DOM 不同构）`)
    }
  }
  for (let i = 0; i < children.length; i++) {
    const c = children[i]
    if (c == null || typeof c === 'boolean') {
      // A2：占位项 ⟷ 注释节点（wf-hole）
      const n = nodes[i]
      if (!n || n.nodeType !== 8 || !(n as Comment).nodeValue?.startsWith('wf-hole:')) {
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

/** 树级校验：vnode 树 ↔ DOM 树递归对照（A3/A4）——入口调用一次 */
export function auditTree(parent: Node, child: VNodeChild, report: (msg: string) => void): void {
  if (child == null || typeof child === 'boolean') return
  if (typeof child === 'string' || typeof child === 'number') return
  if (Array.isArray(child)) {
    auditChildren(parent, child, report)
    // 数组项（隐式 Fragment）递归——子数组项在自己的 DOM 范围对照
    for (const c of child) {
      if (c != null && typeof c === 'object' && Array.isArray(c)) {
        // 数组项 ≡ Fragment：展开项在 parent 下连续 DOM——无法精确锚定，跳过深查（A1 已覆盖数量语义）
        for (const x of c) auditTree(parent, x, report)
      } else if (c != null && typeof c === 'object' && !Array.isArray(c) && (c as VNode).type === Fragment) {
        auditChildren(parent, normalizeChildren((c as VNode).props?.children), report)
      }
    }
    return
  }
  const v = child as VNode
  if (v.type === Portal) return // remote——#__wf_portal 单独容器
  if (v.type === Fragment) {
    auditChildren(parent, normalizeChildren(v.props?.children), report)
    return
  }
  if (isInvalidVNodeType(v.type)) return // 诊断占位
  if (typeof v.type === 'function') {
    // A4：组件锚点——_refNode 必须在父 DOM 内
    const ref = v._refNode
    if (ref && ref.parentNode !== parent) {
      report(`[audit] 组件锚点错位：${(v.type as any).name || 'anonymous'} _refNode 不在父节点内`)
    }
    if (v._child != null) auditTree(parent, v._child, report)
    return
  }
  // native
  const el = v.el ?? v._refNode
  if (el && el.nodeType === 1 && (el as Element).tagName.toLowerCase() !== String(v.type)) {
    report(`[audit] 元素类型错位：期望 <${String(v.type)}>，实际 ${(el as Element).tagName}`)
  }
  if (el && el.nodeType === 1 && !('innerHTML' in (v.props ?? {}))) {
    auditChildren(el, normalizeChildren(v.props?.children), report)
    for (const c of normalizeChildren(v.props?.children)) {
      if (c != null && typeof c === 'object' && !Array.isArray(c) && typeof (c as VNode).type === 'function') {
        auditTree(el, c, report)
      }
    }
  }
}
