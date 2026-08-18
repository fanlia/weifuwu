/**
 * vdom transform — fragment（Fragment 转换——fragment ↔ X）
 *
 * 场景（隐式 Fragment——数组/`<></>`/组件输出多根）：
 *   fragment <-> null（空数组 ↔ 条件渲染）
 *   fragment <-> element（展开项 ↔ 单元素）
 *   fragment <-> component（展开项 ↔ 组件）
 *
 * 同态 fragment → fragment 不在本表（diff 层逐项转换——keyed/unkeyed
 * 列表 diff——按位置/key 逐项对比）。
 *
 * 转换职责（old=fragment → new=X）：
 * 1. 旧展开项区间移除（首锚 remove——区间内节点由 diff 的锚点区间清理
 *    ——_childAnchors 语义——多节点展开后的首/尾锚）
 * 2. 新节点由 diff 渲染到同一位置
 */

import type { TransformContext, TransitionFn } from './index.ts'

/** fragment → X：旧展开区间移除（首锚让位——区间由 diff 清理） */
export const transitionFragment: TransitionFn = async (_old, next, ctx) => {
  ctx.emit({ op: 'remove', id: ctx.oldId })
  await ctx.emitNode(next, ctx.parent, ctx.index, ctx.ref)
}
