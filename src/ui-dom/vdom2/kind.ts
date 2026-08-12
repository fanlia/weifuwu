/**
 * vdom 类型分类与输出范围（vdom-matrix 方案 2026-12）
 *
 * - classifyKind：children 值类型分类（单一判定源——替代散落的 typeof/Array.isArray/type=== 判断）
 * - getOutputRange：输出 DOM 范围统一获取（多节点完整边界；单节点 null）——
 *   范围定位用节点引用（Fragment._childNodes / 组件 _outputChild 递归 / 数组 fragment-start..end 标记），
 *   不依赖外部下标。x2y 转换（transitions.ts）/ removeOldOutput 统一用它。
 *
 * 类型分类与 VNode 类层次见 vnode.ts（NativeVNode/FragVNode/CompVNode/PortalVNode 继承 VNode 基类）；
 * 文本/数组/占位是 JSX 原生值（string/Array/boolean/null）——classifyKind 分类后走同一转换表。
 */

import type { VNode, VNodeChild } from './vnode.ts'
import { Fragment, Portal, isFrag, isComp, isPortal } from './vnode.ts'

/** children 值类型分类（vdom 状态机状态） */
export type VKind = 'text' | 'native' | 'frag' | 'comp' | 'arr' | 'hole' | 'portal'

/** patchValue 分派上下文 */
export interface PatchState {
  parent: Node
  oldNode: Node | null
  oldInput: VNodeChild
  newInput: VNodeChild
  ctx: {
    browser: any
    registry: import('./registry.ts').Registry
    ctxVersion?: number
    force?: boolean
  }
}

/** 输出范围统一获取（多节点输出完整边界；单节点/未知 → null）——类型守卫收窄，无散落 cast */
export function getOutputRange(input: VNodeChild, anchor: Node | null): Node[] | null {
  if (input == null || typeof input !== 'object') return null
  if (Array.isArray(input)) {
    const start = anchor
    if (start && start.nodeType === 8 && start.nodeValue?.includes('type=fragment-start')) {
      const range: Node[] = [start]
      let n: Node | null = start.nextSibling
      while (n) {
        range.push(n)
        if (n.nodeType === 8 && n.nodeValue?.includes('type=fragment-end')) break
        n = n.nextSibling
      }
      return range
    }
    return null
  }
  const vn = input as VNode
  if (isFrag(vn)) return vn._childNodes && vn._childNodes.length ? vn._childNodes : null
  if (isComp(vn)) return getOutputRange(vn._outputChild ?? vn._child, anchor)
  return null
}

/** 值分类（单一判定源——替代散落的 typeof/Array.isArray/type=== 判断） */
export function classifyKind(v: VNodeChild): VKind {
  if (v == null || typeof v === 'boolean') return 'hole'
  if (typeof v === 'string' || typeof v === 'number') return 'text'
  if (Array.isArray(v)) return 'arr'
  const vn = v as VNode
  if (isFrag(vn)) return 'frag'
  if (isPortal(vn)) return 'portal'
  if (isComp(vn)) return 'comp'
  return 'native'
}

export { Fragment, Portal }
