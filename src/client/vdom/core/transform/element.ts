/**
 * vdom transform — element（元素转换——element ↔ X）
 *
 * 场景：类型切换（<div/> <-> 组件 / <div/> <-> 文本 / <div/> <-> null）。
 * 同态 element → element 不在本表（就地 patch——diff 层：属性/事件/children）。
 *
 * 转换职责（old=element → new=X）：
 * 1. 旧元素移除（remove oldId——含子树——事件监听随元素 GC）
 * 2. 新节点由 diff 渲染到同一位置
 * —— 旧元素若为组件输出根（组件卸载语义）——组件侧先 unmount
 */

import type { TransformContext, TransitionFn } from './index.ts'

/** element → X：旧元素移除（含子树——让位） */
export const transitionElement: TransitionFn = async (_old, next, ctx) => {
  ctx.emit({ op: 'remove', id: ctx.oldId })
  await ctx.emitNode(next, ctx.parent, ctx.index, ctx.ref)
}
