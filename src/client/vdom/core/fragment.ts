/**
 * vdom core — Fragment（隐式——数组 = Fragment——独立文件）
 *
 * 设计（AGENTS §4.0——结构符号内化）：
 * - Fragment 为内部符号——公共面不导出（数组 = 隐式 Fragment；`<></>` 经
 *   jsx-runtime 子路径自动导入——编译目标即本符号）
 * - 数组节点处理 → children.ts（childrenOf 单一规则源——递归展开）
 * - 单节点分类 → node.ts（kindOf——fragment 分支判定）
 */

import type { VNode } from './vnode.ts'

/** Fragment 内部符号（`<></>` 编译目标——数组 = 隐式 Fragment） */
export const Fragment: unique symbol = Symbol('vdom-fragment')

/** Fragment vnode 判定 */
export function isFragment(v: VNode): boolean {
  return v.type === Fragment
}
