/**
 * vdom core2 — roundtrip（round-trip 归一——测试准则的可执行规格）
 *
 * 准则（vdom ⟷ DOM string 双向唯一——core2 所有测试必须满足）：
 *   R1（vnode 侧）：html2vnode(vnode2html(v)) ≡ normalize(v)
 *   R2（string 侧）：vnode2html(html2vnode(w)) ≡ w
 *
 * normalize（可序列化面归一——round-trip 比较基准——保真范围）：
 *  - 字符串属性完全保真
 *  - number 文本保真（text-number 标记）；null/undefined/boolean 值全保真
 *  - style 对象保真（data-wf-style JSON 编码——逆向还原对象——值类型保真）
 *  - 事件/函数值 → 剔除（函数表后续——不参与序列化面）
 *  - key 保真（data-wf-key 标记——逆向回填 vnode.key）
 *  - 组件/Fragment → 展开结构（符号/函数面不可序列化——测试用展开后的树）
 *
 * 例外（显式标注）：测试目的本身就是保真范围边界（style 对象类型变化、
 * 事件剔除）——断言时使用归一后的期望值。
 */

import { classify, childrenOf, Fragment, type VNode, type VNodeChild } from './vnode.ts'


/** vnode → 可序列化面归一（round-trip 比较基准——R1 的期望侧——**hole
 *  值保真**（null/true/false 原样）——数组文本合并） */
export function normalizeForRoundTrip(v: VNodeChild): VNodeChild {
  // **null/undefined/boolean 值全保真**（wf-hole: null/undefined/true/false）
  if (v === null || v === undefined || typeof v === 'boolean') return v
  if (typeof v === 'number') return v // **number 保真**（text-number 标记）
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
    if (typeof val === 'function') {
      props[k] = val // **函数引用保真**（data-wf-events 注册表还原——R1 期望侧同规则——=== 恒等）
      continue
    }
    if (val !== null && typeof val === 'object') {
      props[k] = val // 对象保真（style → data-wf-style；普通对象/数组 → data-wf-props——R1 期望侧同规则）
    } else if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'bigint') {
      props[k] = val // number/bool 保真（data-wf-types 类型表还原——R1 期望侧同规则）
    } else if (val !== null && val !== undefined) {
      props[k] = String(val)
    }
  }
  const kids = childrenOf(vn).map(normalizeForRoundTrip)
  if (kids.length === 1) props.children = kids[0]
  else if (kids.length > 1) props.children = kids
  // **key 保真**（data-wf-key 标记——逆向回填 vnode.key——R1 期望侧同规则）
  return { type: vn.type, props, key: vn.key }
}
