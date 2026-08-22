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
 * 2. 旧组件输出节点移除——**区间完整移除（G2——终态等价违例）**：
 *    组件输出多根 = 隐式 Fragment（展开槽位 parent.i+1...）——只移除首锚
 *    会让第二节点起 DOM 残留（fuzz 实证）——经 registry 查 lastOutput
 *    → removeVNodeTree 递归（数组全形态 + 组件项 unmount）
 * 3. 新节点由 diff 渲染到同一位置（首锚位置）
 */

import type { VNodeChild } from '../vnode.ts'
import { pathId } from '../node/native.ts'
import { removeVNodeTree, outputBase, removalParent } from '../diff/cleanup.ts'
import { outputToChild } from '../node/component.ts'
import type { TransformContext, TransitionFn } from './index.ts'

/** component → X：组件卸载（onUnmounts）+ 输出区间移除（让位） */
export const transitionComponent: TransitionFn = async (_old, next, ctx) => {
  if ((globalThis as any).__DBG8) console.log('[dbg-tc] oldCompId=', ctx.oldCompId, 'oldId=', ctx.oldId, 'parent=', ctx.parent, 'index=', ctx.index)
  // 1. 组件卸载清理（onUnmounts——实例注册表消费——递归子实例）
  if (ctx.oldCompId) ctx.emit({ op: 'unmount', compId: ctx.oldCompId })
  // 2. 旧输出区间移除——registry 查 lastOutput——数组/多根完整清理
  const out = ctx.registry?.get(ctx.oldCompId ?? '')?.lastOutput
  // **方案 3：lastOutput 是 CompOutput——`!== undefined` 统一（空洞锚
  //  也清理——an:root.0.0 幽灵实证）——转换后 outputBase 计算基线**
  if (out !== undefined) {
    const child = outputToChild(out)
    // **parent 语义（证明审计——removalParent 统一）**：child 是组件
    //  （keyed）→ 渲染 sink parent = 外层 compId（outIsCompNode 特判）——
    //  传 ctx.parent（槽位父）则 keyedId 错位（root.0.0.kk1 渲染 vs
    //  root.0.kk1 清理实证）——数组 → compId（数组分支内部处理）；
    //  Fragment → 槽位父（index 推导）
    removeVNodeTree(
      child,
      outputBase(child, ctx.oldCompId ?? '', pathId(ctx.parent, ctx.index)),
      removalParent(child, ctx.oldCompId ?? '', ctx.parent),
      ctx.emit,
      ctx.registry,
    )
  } else {
    // 无旧输出记录（防御）——首锚让位
    ctx.emit({ op: 'remove', id: ctx.oldId })
  }
  // 3. 新侧渲染（同一位置）
  await ctx.emitNode(next, ctx.parent, ctx.index, ctx.ref)
}
