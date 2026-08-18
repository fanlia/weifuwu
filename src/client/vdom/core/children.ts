/**
 * vdom core — children（数组节点处理——隐式 Fragment——独立文件）
 *
 * 规则（AGENTS §4.0——单一规则源）：
 * - 数组/`<></>`/嵌套数组 = 隐式 Fragment——childrenOf 递归展开为同一
 *   children 序列（纯函数一次到位——路径按展开后位置——深度不漂移）
 * - 空洞（false/null/undefined）**保留不滤除**（占位法——长度恒定——
 *   对齐从结构上保证——filter(Boolean) 是红线）
 * - 五消费方共用（buildVNode/renderValue/patchChildren/renderSsr/hydrate）
 */

import type { VNode, VNodeChild } from './vnode.ts'

/** children 读取（单一规则源）：统一 children 序列——任意嵌套递归展开 */
export function childrenOf(v: VNode): VNodeChild[] {
  const c = v.children ?? (v.props.children === undefined ? [] : v.props.children)
  const flat = (x: VNodeChild): VNodeChild[] => (Array.isArray(x) ? x.flatMap(flat) : [x])
  return (Array.isArray(c) ? c.flatMap(flat) : [c]) as VNodeChild[]
}

/** 数组节点遍历（隐式 Fragment——按展开后位置 emit）——递归覆盖任意嵌套 */
export function forEachChild<T>(cs: VNodeChild[], fn: (c: VNodeChild, i: number) => T): void {
  cs.forEach((c, i) => { fn(c, i) })
}
