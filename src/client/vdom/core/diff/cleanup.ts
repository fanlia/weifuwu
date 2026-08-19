/**
 * vdom core/diff — cleanup（旧输出递归清理——纯逻辑）
 *
 * 职责（diff 层的细节模块）：组件类型切换/数组 ↔ 单节点转换——旧输出
 * 按 vnode 结构递归 remove（同构保持）。
 */

import type { VNode, VNodeChild } from '../vnode.ts'
import { childrenOf } from '../node/children.ts'
import type { Command } from '../command/index.ts'
import { pathId } from '../node/native.ts'

/** 旧输出递归清理（组件类型切换——remove 命令——同构保持） */
export function removeVNodeTree(v: VNode, id: string, emitCommand: (cmd: Command) => void): void {
  const cs = childrenOf(v)
  cs.forEach((c, i) => {
    if (c !== null && c !== undefined && typeof c !== 'boolean' && typeof c !== 'string' && typeof c !== 'number' && !Array.isArray(c)) {
      removeVNodeTree(c as VNode, pathId(id, i), emitCommand)
    }
  })
  emitCommand({ op: 'remove', id })
}

