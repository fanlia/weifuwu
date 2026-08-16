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
      // 单行（避免多行源码噪音——console 历史累积可读性）
      const stack = (globalThis as { __WF_V3_AUDIT_STACK?: string }).__WF_V3_AUDIT_STACK
        ? new Error().stack?.split('\n').slice(2, 5).map((l) => l.trim().slice(0, 70)).join(' | ')
        : ''
      const kinds = kids.map((c) => typeof (c as VNode).type === 'function' ? 'C' : String((c as VNode).type).slice(0, 8))
      const idxs = kids.map((c) => [...parent.childNodes].indexOf((c as VNode).el as ChildNode))
      console.warn(`[vdom3/audit] children 顺序错位 idx=${idx}<${prevIdx} tag=${String((k as VNode).type).slice(0, 30)} kinds=[${kinds.join(',')}] idxs=[${idxs.join(',')}] kids=${kids.length} domKids=${parent.childNodes.length}${stack ? ' || ' + stack : ''}`)
      return
    }
    prevIdx = idx
  }
}

/**
 * DOM ↔ 事件流对照审计（不变量"无事件流不渲染"的运行时守护——dev 模式）
 *
 * 启用：__WF_VDOM_AUDIT === '1'（独立开关——默认关——审计开销仅 dev）。
 * 机制：MutationObserver 观察挂载点（childList——added/removedNodes）——
 * 对照事件流（node:insert/remove 的 target）——无事件对应的 DOM 结构变化
 * = 绕过点（静默渲染）——warn。
 * 例外（白名单）：无 data-v3-id 的节点（内部容器/文本包装）；挂载点自身清空
 * （mount/unmount——初始/销毁语义）。
 */
export function auditDomEvents(root: Element, getRecent: () => Array<{ target?: string }>): () => void {
  if ((globalThis as { __WF_VDOM_AUDIT?: string }).__WF_VDOM_AUDIT !== '1') return () => {}
  const reported = new Set<string>()
  const report = (kind: string, id: string | null): void => {
    const key = `${kind}:${id ?? '?'}`
    if (reported.has(key)) return // 同 id 同类只报一次（防刷屏）
    reported.add(key)
    console.warn(`[vdom3/audit] DOM 变化无事件流对应（绕过点）：${kind} id=${id ?? '?'}——无事件流不渲染不变量被破坏`)
  }
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type !== 'childList') continue
      // 移除节点必须有 node:remove（严格——结构变化的主要绕过点——
      // 精确对照：node:remove 事件且 target 匹配——非任意 target 事件）
      for (const n of m.removedNodes) {
        if (n.nodeType !== 1) continue
        const id = (n as Element).getAttribute?.('data-v3-id') ?? null
        if (id && !reported.has(`remove:${id}`)) {
          const evs = getRecent()
          const ok = evs.some((e) => (e as { entity?: string }).entity === 'node' && (e as { action?: string }).action === 'remove' && e.target === id)
          if (!ok) report('remove', id)
        }
      }
      // 插入节点必须有 node:insert（move 例外——同 id 同时 added+removed 跳过）
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue
        const id = (n as Element).getAttribute?.('data-v3-id') ?? null
        if (!id) continue
        const wasRemoved = [...m.removedNodes].some((r) => (r as Element).getAttribute?.('data-v3-id') === id)
        if (wasRemoved) continue // move（同批移除+插入）——合法
        const evs = getRecent()
        const ok = evs.some((e) => (e as { entity?: string }).entity === 'node' && (e as { action?: string }).action === 'insert' && e.target === id)
        if (!ok) report('insert', id)
      }
    }
  })
  mo.observe(root, { childList: true, subtree: true })
  return () => mo.disconnect()
}
