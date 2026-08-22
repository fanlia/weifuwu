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
import { removeVNodeTree } from '../diff/cleanup.ts'

/** element → X：旧元素移除（含子树——让位）
 *  **根本修复（C2——统一区间移除）**：单锚 remove 只删元素自身——子树内
 *  组件实例（unkeyed compId = DOM 槽位 id）残留（onUnmounts 不执行——
 *  S_INST 面——组件树 fuzz 实证）——removeVNodeTree 递归：声明子树槽位 +
 *  组件项 unmount + 组件输出区间（registry 查 lastOutput）——与
 *  transitionComponent/transitionFragment 统一——消费端零猜测
 *  （procRemove 前缀卸载因 id 空间重叠误删——deep-tour 回归——回退——
 *  卸载信息由 diff 层完整生成） */
export const transitionElement: TransitionFn = async (oldNode, next, ctx) => {
  removeVNodeTree(oldNode as Parameters<typeof removeVNodeTree>[0], ctx.oldId, ctx.parent, ctx.emit, ctx.registry)
  await ctx.emitNode(next, ctx.parent, ctx.index, ctx.ref)
}
