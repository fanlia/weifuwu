/**
 * vdom core/diff — cleanup（旧输出递归清理——纯逻辑）
 *
 * 职责（diff 层的细节模块）：组件类型切换/数组 ↔ 单节点转换——旧输出
 * 按 vnode 结构递归 remove（同构保持）。
 *
 * **数组安全（G1——终态等价违例）**：lastOutput 可为数组（组件输出多根）
 * ——childrenOf 对数组读 v.props 崩溃（TypeError 中断渲染管线——fuzz 实证）
 * ——VNodeChild 全形态递归（数组逐项按展开槽位 id）。
 * **组件项 unmount（G5/G7 区间语义）**：组件 vnode 项 → unmount——compId
 * 与渲染路径一致：keyed → `${parent}.k{key}`（parent = 项所在容器 id）；
 * unkeyed → 项槽位 id（base）。
 */

import type { VNode, VNodeChild } from '../vnode.ts'
import { childrenOf } from '../node/children.ts'
import { isFragment } from '../node/fragment.ts'
import type { Command } from '../command/index.ts'
import { pathId } from '../node/native.ts'

/** 旧输出递归清理（组件类型切换——remove 命令——同构保持）
 *  @param v     旧输出（VNodeChild 全形态——数组 = 组件输出多根）
 *  @param base  当前项 id（顶层 = 组件槽位 id；递归 = pathId(base, i)）
 *  @param parent 当前容器 id（keyed 组件项 compId 用——渲染 sink 的 parent） */
export function removeVNodeTree(
  v: VNodeChild, base: string, parent: string, emitCommand: (cmd: Command) => void,
): void {
  // 空洞/文本：单节点移除（锚——同构保持）
  if (v === null || v === undefined || typeof v === 'boolean') {
    emitCommand({ op: 'remove', id: base })
    return
  }
  if (typeof v === 'string' || typeof v === 'number') {
    emitCommand({ op: 'remove', id: base })
    return
  }
  if (Array.isArray(v)) {
    // 数组（组件输出多根——展开槽位——项 id = pathId(base, i)——
    // 容器不变（数组不占 id——渲染 sink 的 parent 语义一致））
    v.forEach((c, i) => removeVNodeTree(c, pathId(base, i), parent, emitCommand))
    return
  }
  const vn = v as VNode
  // **Fragment 符号 vnode（fuzz#117 实证）**：展开到**父级连续槽位**
  // （渲染路径：emit(c, parent, index+i)——不是自身子路径 pathId(base,i)——
  //  单锚/子路径 remove 会错位残留）——index 从 base 相对 parent 推导
  if (isFragment(vn)) {
    const index = Number(base.slice(parent.length + 1))
    const cs = childrenOf(vn)
    cs.forEach((c, i) => removeVNodeTree(c, pathId(parent, index + i), parent, emitCommand))
    return
  }
  // 组件项：unmount（实例卸载——onUnmounts——与渲染 compId 规则一致）
  if (typeof vn.type === 'function') {
    emitCommand({ op: 'unmount', compId: vn.key !== null ? `${parent}.k${vn.key}` : base })
  }
  // children 递归（容器 = 当前项 id）
  const cs = childrenOf(vn)
  cs.forEach((c, i) => {
    if (c !== null && typeof c !== 'string' && typeof c !== 'number' && typeof c !== 'boolean' && !Array.isArray(c)) {
      removeVNodeTree(c, pathId(base, i), base, emitCommand)
    } else {
      emitCommand({ op: 'remove', id: pathId(base, i) })
    }
  })
  emitCommand({ op: 'remove', id: base })
}
