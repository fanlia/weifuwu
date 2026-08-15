/**
 * vdom3 audit — 开发期不变量校验（防御——测试之外的第二道防线）
 *
 * 启用：__WF_V3_AUDIT !== '0'（默认开——与 vdom2 audit 对齐）。
 * 校验点（渲染后）：
 * 1. 孤儿节点：DOM 中 data-v3-id 节点在 registry 有记录（patch 泄漏检测）
 * 2. vnode/DOM 一致性：有 el 的 children 项在 DOM 中的顺序与 children 顺序一致
 *    （空洞错位——prevNode 锚修复的回归防线）
 * 校验失败 → console.warn('[vdom3/audit] ...')（不中断渲染——观测性）
 */

import type { VNode } from './types.ts'
import { childrenOf } from './types.ts'

const enabled = (globalThis as { __WF_V3_AUDIT?: string }).__WF_V3_AUDIT !== '0'

/** 渲染后校验（patch 完成调用——root 为挂载容器） */
export function auditAfterRender(root: Element): void {
  if (!enabled) return
  // 1. 孤儿节点检测：root 内 data-v3-id 是否可解析（DOM 遍历——id 唯一性由 data-v3-id 保证）
  //    （registry 全局——此处只做结构性检查：id 属性重复 = patch 泄漏）
  const seen = new Set<string>()
  const walk = (el: Element): void => {
    const id = el.getAttribute('data-v3-id')
    if (id) {
      if (seen.has(id)) {
        console.warn(`[vdom3/audit] 重复 data-v3-id: ${id}（patch 泄漏——节点未移除）`)
      }
      seen.add(id)
    }
    for (const c of el.children) walk(c)
  }
  for (const c of root.children) walk(c)
}

/** vnode/DOM 顺序一致性（children 有 el 的项——DOM 顺序 = children 顺序）
 *  索引比较（父下 childNodes indexOf——无 compareDocumentPosition 的跨树/同节点歧义） */
export function auditOrder(_el: Element, v: VNode): void {
  if (!enabled) return
  const kids = childrenOf(v).filter((c): c is VNode => c != null && typeof c === 'object' && (c as VNode).el != null)
  if (kids.length < 2) return
  const parent = (kids[0] as VNode).el?.parentNode
  if (!parent) return
  let prevIdx = -1
  for (const k of kids) {
    const node = (k as VNode).el as Node
    if (node.parentNode !== parent) return // 跨树（portal 等）跳过
    const idx = [...parent.childNodes].indexOf(node as ChildNode)
    if (idx < 0) return
    if (idx < prevIdx) {
      console.warn(`[vdom3/audit] children 顺序错位（vnode 顺序 ≠ DOM 顺序——索引 ${idx} < ${prevIdx}）`)
      return
    }
    prevIdx = idx
  }
}
