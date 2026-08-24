/**
 * vdom core2 — roundtrip（round-trip 归一——测试准则的可执行规格）
 *
 * 准则（vdom ⟷ DOM string 双向唯一——core2 所有测试必须满足）：
 *   R1（vnode 侧）：html2vnode(vnode2html(v)) ≡ normalize(v)
 *   R2（string 侧）：vnode2html(html2vnode(w)) ≡ w
 *
 * normalize（可序列化面归一——round-trip 比较基准——保真范围）：
 *  - 字符串属性完全保真
 *  - number/bool → 字符串（String()——HTML 面字符串化）
 *  - style 对象 → cssText 字符串（kebab-case——与 vnode2dom 同规则）
 *  - 事件/函数值 → 剔除（函数表后续——不参与序列化面）
 *  - key → null（HTML 面不编码 key——id 层后续）
 *  - 组件/Fragment → 展开结构（符号/函数面不可序列化——测试用展开后的树）
 *
 * 例外（显式标注）：测试目的本身就是保真范围边界（style 对象类型变化、
 * 事件剔除）——断言时使用归一后的期望值。
 */

import { classify, childrenOf, Fragment, type VNode, type VNodeChild } from './vnode.ts'
import { styleString } from './dom.ts'

/** vnode → 可序列化面归一（round-trip 比较基准——R1 的期望侧——**hole
 *  值保真**（null/true/false 原样）——数组文本合并） */
export function normalizeForRoundTrip(v: VNodeChild): VNodeChild {
  if (v === null || v === undefined) return null // hole——null 值保真
  if (typeof v === 'boolean') return v // hole——true/false 值保真
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.map(normalizeForRoundTrip) // 数组原样（无 merge——split 锚保真文本边界）
  const vn = v as VNode
  // **Fragment 归一 array（fragment = array 语义——round-trip 期望侧同规则）**
  if (vn.type === Fragment) {
    return childrenOf(vn).map(normalizeForRoundTrip) // Fragment 归一数组（无 merge）
  }
  const props: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(vn.props)) {
    if (k === 'children' || k === 'key') continue
    if (typeof val === 'function') continue // 事件面剔除（函数表后续）
    if (k === 'style' && val !== null && typeof val === 'object') {
      props[k] = styleString(val as Record<string, unknown>)
    } else if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'bigint') {
      props[k] = val // number/bool 保真（data-wf-types 类型表还原——R1 期望侧同规则）
    } else if (val !== null && val !== undefined) {
      props[k] = String(val)
    }
  }
  const kids = childrenOf(vn).map(normalizeForRoundTrip)
  if (kids.length === 1) props.children = kids[0]
  else if (kids.length > 1) props.children = kids
  // key → null（HTML 面不编码 key——id 层后续——type/props 保留）
  return { type: vn.type, props, key: null }
}
