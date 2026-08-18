/**
 * vdom transform — states（节点状态定义与判定）
 *
 * 状态 = 节点类别（转换状态机的维度）：
 *   text      —— string/number（文本节点）
 *   hole      —— null/undefined/boolean（空洞占位锚——DOM 有真实注释节点）
 *   element   —— string type（原生元素）
 *   component —— 函数 type（两阶段组件——输出多根 = 隐式 Fragment）
 *   fragment  —— Fragment 符号/数组（隐式 Fragment——多节点展开）
 *   portal    —— Portal 符号（浮层——主树插槽锚 + 内容远程容器）
 *   array     —— VNodeChild[]（childrenOf 已展开的防御态）
 *
 * 判定复用 node.ts kindOf（唯一判定点）——状态是 kindOf 的转换语义面。
 */

import type { VNodeChild } from '../vnode.ts'
import { kindOf } from '../node/index.ts'
import type { NodeState } from './index.ts'

/** 节点状态判定（kindOf → NodeState——语义别名——invalid 归 hole 占位） */
export function stateOf(v: VNodeChild | null | undefined): NodeState {
  if (v === null || v === undefined) return 'hole'
  const k = kindOf(v)
  if (k === 'invalid') return 'hole'
  return k
}

/** 是否「同态」（旧新状态相同——可走就地 patch 而非重建） */
export function isSameState(oldState: NodeState, newState: NodeState): boolean {
  return oldState === newState
}

/** 是否组件输出态（组件/fragment——多节点锚点管理） */
export function isMultiNode(state: NodeState): boolean {
  return state === 'component' || state === 'fragment'
}
