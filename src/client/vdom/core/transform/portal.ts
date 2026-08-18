/**
 * vdom transform — portal（Portal 转换——portal ↔ X）
 *
 * 场景（usePopup 浮层——打开/关闭）：portal <-> null（浮层开关）——
 * 主树插槽锚 ↔ 内容；portal 内容在 #__wf_portal 远程容器。
 *
 * 同态 portal → portal 不在本表（diff 层——内容就地 patch——锚点保持）。
 *
 * 转换职责（old=portal → new=X）：
 * 1. 旧浮层内容移除（portal 容器内节点——'portal:<key>' 区间）
 * 2. 主树插槽锚移除（让位）
 * 3. 新节点由 diff 渲染到同一位置
 * —— 浮层内容清理由 diff 的 portal 区间清理负责（容器节点 remove）
 */

import type { TransformContext, TransitionFn } from './index.ts'

/** portal → X：主树插槽锚移除（让位——浮层内容由 diff 清理 portal 区间） */
export const transitionPortal: TransitionFn = (_old, _next, ctx) => {
  ctx.emit({ op: 'remove', id: ctx.oldId })
}
