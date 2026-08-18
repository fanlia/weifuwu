/**
 * vdom transform — component（组件转换——component ↔ X）
 *
 * 场景（条件渲染主场景——组件类型切换）：
 *   component <-> null（{cond && <Comp/>}——卸载/挂载）
 *   component <-> fragment（组件输出多根 ↔ 展开项）
 *   component <-> element（组件 ↔ 原生元素）
 *
 * 同类型 component → component 不在本表（diff 层复用——工厂不重跑——
 *  renderFn 重新调用——let/ref 状态保持）；异类型组件（A <-> B）同样
 * 走本表（旧组件卸载 + 新组件由 diff mount）。
 *
 * 转换职责（old=component → new=X）：
 * 1. unmountComp（onUnmounts 清理——ctx.onUnmount 注册的回调——逆序执行）
 * 2. 旧组件输出节点移除（多根 = 隐式 Fragment——锚点区间清理）
 * 3. 新节点由 diff 渲染到同一位置（首锚位置）
 */

import type { TransformContext, TransitionFn } from './index.ts'

/** component → X：组件卸载（onUnmounts）+ 输出节点移除（让位） */
export const transitionComponent: TransitionFn = async (_old, next, ctx) => {
  // 1. 组件卸载清理（onUnmounts——实例注册表消费）
  if (ctx.oldCompId) ctx.emit({ op: 'unmount', compId: ctx.oldCompId })
  // 2. 旧输出区间移除（首锚让位——区间由 diff 的锚点区间清理负责）
  ctx.emit({ op: 'remove', id: ctx.oldId })
  // 3. 新侧渲染（同一位置）
  await ctx.emitNode(next, ctx.parent, ctx.index, ctx.ref)
}
