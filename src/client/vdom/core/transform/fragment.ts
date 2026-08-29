/**
 * vdom transform — fragment（Fragment/数组转换——fragment ↔ X）
 *
 * 场景（隐式 Fragment——数组/`<></>`/组件输出多根）：
 *   fragment <-> null（空数组 ↔ 条件渲染）
 *   fragment <-> element（展开项 ↔ 单元素）
 *   fragment <-> component（展开项 ↔ 组件）
 *
 * 同态 fragment → fragment 不在本表（diff 层逐项转换——keyed/unkeyed
 * 列表 diff——按位置/key 逐项对比）。
 *
 * 转换职责（old=fragment → new=X）：**旧展开区间完整清理**（数组/多节点
 * 递归 remove——不是只清首锚——数组多项残留事故的根治）——新侧经
 * emitNode 渲染到同一位置。
 */

import type { VNode, VNodeChild } from '../vnode.ts'
import { childrenOf, slotCount } from '../node/children.ts'
import { pathId } from '../node/native.ts'
import type { TransitionFn } from './index.ts'
import { removeVNodeTree } from '../diff/cleanup.ts'

/** fragment → X：旧展开区间完整清理（数组逐项递归——非只清首锚）+
 *  新侧渲染到同一位置（展开位置连续——pathId(parent, index + ci)）
 *  **单一实现源**：区间移除统一 removeVNodeTree（cleanup.ts——FRAG 展开
 *  到父级槽位/数组全形态/组件 unmount——与 diff 各路径共享——防双实现漂移） */
export const transitionFragment: TransitionFn = (oldNode, next, ctx) => {
  const items = Array.isArray(oldNode) ? oldNode : childrenOf(oldNode as VNode)
  // **槽位推进（投影维度——FRAG 项展开占多槽——按索引 +1 错位——
  //  fuzz seed=42 i=132 实证——ul 槽位 2 被按 1 移除——残留）**
  let slot = ctx.index
  for (const c of items) {
    removeVNodeTree(c, pathId(ctx.parent, slot), ctx.parent, ctx.emit, ctx.registry)
    slot += slotCount(c)
  }
  ctx.emitNode(next, ctx.parent, ctx.index, ctx.ref)
}
