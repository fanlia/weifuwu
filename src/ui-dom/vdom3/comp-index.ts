/**
 * vdom3 comp-index — 组件实例索引（组件 id → 当前树 vnode 引用）
 *
 * 优化：updateComponent（组件级更新——ctx.render 高频路径）原为 DFS 整树
 * 定位（O(树大小)）——滚动跟随 renderByIds 每帧多次——大应用热点。
 * 索引定位 O(1)——注册（build 组件分支）/ 注销（组件移除）/ miss 回退 DFS（防御）。
 *
 * id 全局唯一（nextNodeId）——索引全局——与 delegate 注册表同模式。
 */

import type { VNode } from './types.ts'

const compIndex = new Map<string, VNode>()

/** 注册（build 组件分支——mount/reuse 时——指向当前树的最新克隆） */
export function indexComponent(v: VNode): void {
  if (v._id) compIndex.set(v._id, v)
}

/** 注销（组件实例从树中移除——条件渲染/列表删除） */
export function unindexComponent(compId: string): void {
  compIndex.delete(compId)
}

/** O(1) 定位（updateComponent 消费——miss 由调用方回退 DFS） */
export function getIndexedComponent(compId: string): VNode | null {
  return compIndex.get(compId) ?? null
}

/** 测试隔离（跨测试残留——id 从 n1 重新分配——旧索引 miss 回退安全——整洁清理） */
export function resetCompIndex(): void {
  compIndex.clear()
}
