/**
 * vdom transform — table（转换表——状态机核心）
 *
 * 转换表：oldState × newState → 策略函数（各状态文件实现）——
 * 同态（对角）走「就地 patch」（text→setText / element→就地 diff /
 * component→同类型复用 / hole→no-op）；异态走「转换」——
 * 占位法核心：**锚 ↔ 真实节点 replaceChild 互换**（childNodes 长度恒定——
 * 同构不变量——禁止 removeChild 塌缩）。
 *
 * 转换策略（各文件实现）：
 *   text.ts      —— text ↔ element/component/fragment（文本节点 ↔ 结构）
 *   hole.ts      —— hole ↔ element/component/fragment/text
 *                  （**null <-> component / null <-> fragment 主场景**——
 *                  条件渲染 cond ? <X/> : null 的类型切换）
 *   element.ts   —— element ↔ component/fragment/hole/text
 *   component.ts —— component ↔ element/fragment/hole（同类型复用——
 *                   异类型卸载 + 重建）
 *   fragment.ts  —— fragment ↔ element/component/hole（多节点展开 ↔ 单节点）

 */

import type { VNodeChild } from '../vnode.ts'
import type { NodeState, TransformContext, TransitionFn } from './index.ts'
import { transitionText } from './text.ts'
import { transitionHole } from './hole.ts'
import { transitionElement } from './element.ts'
import { transitionComponent } from './component.ts'
import { transitionFragment } from './fragment.ts'

/** 转换表（old × new → 策略）——同态 = 就地 patch（diff 层处理——表中为 null） */
export const TRANSITIONS: Record<NodeState, Record<NodeState, TransitionFn | null>> = {
  text:       { text: null, hole: transitionText, element: transitionText, component: transitionText, fragment: transitionText, array: transitionText },
  hole:       { text: transitionHole, hole: null, element: transitionHole, component: transitionHole, fragment: transitionHole, array: transitionHole },
  element:    { text: transitionElement, hole: transitionElement, element: null, component: transitionElement, fragment: transitionElement, array: transitionElement },
  component:  { text: transitionComponent, hole: transitionComponent, element: transitionComponent, component: null, fragment: transitionComponent, array: transitionComponent },
  fragment:   { text: transitionFragment, hole: transitionFragment, element: transitionFragment, component: transitionFragment, fragment: null, array: transitionFragment },
  array:      { text: transitionFragment, hole: transitionFragment, element: transitionFragment, component: transitionFragment, fragment: transitionFragment, array: null },
}

/** 转换调度（old × next → 策略）——同态返回 null（diff 就地 patch——不重建） */
export function transitionOf(oldState: NodeState, newState: NodeState): TransitionFn | null {
  return TRANSITIONS[oldState]?.[newState] ?? null
}

/** 执行转换（diff 调用——自动降级：同态/null 策略 → no-op） */
export function runTransition(
  oldState: NodeState,
  newState: NodeState,
  oldNode: unknown,
  nextNode: VNodeChild,
  ctx: TransformContext,
): Promise<void> | void {
  const fn = transitionOf(oldState, newState)
  if (!fn) return undefined
  return fn(oldNode, nextNode, ctx)
}
