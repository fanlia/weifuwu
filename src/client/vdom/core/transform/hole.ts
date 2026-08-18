/**
 * vdom transform — hole（空洞转换——null <-> X 主场景）
 *
 * 条件渲染核心（AGENTS §6.3——占位法）：`{cond && <X/>}` = false 占位锚——
 * cond 翻转时 **占位锚 ↔ 真实节点互换**（禁止 removeChild 塌缩 childNodes——
 * 长度恒定则预捕获索引全有效——提交按钮消失事故的根治）。
 *
 * 转换职责（old=hole → new=X）：旧占位锚移除（让位）——新节点由 diff
 * 主循环渲染到同一位置（parent/ref）——childNodes 长度不变（1:1 互换）。
 */

import type { TransformContext, TransitionFn } from './index.ts'

/** hole → X：旧占位锚移除（让位——新节点 diff 渲染到同一位置） */
export const transitionHole: TransitionFn = async (_old, next, ctx) => {
  ctx.emit({ op: 'remove', id: ctx.oldId })
  await ctx.emitNode(next, ctx.parent, ctx.index, ctx.ref)
}
