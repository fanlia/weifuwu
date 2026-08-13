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

import type { VNode, VNodeChild } from '../vnode.ts'
import { Fragment, Portal, isFrag, isComp, isPortal } from '../vnode.ts'

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

/** 输出范围统一获取（多节点输出完整边界；单节点/未知 → null）——类型守卫收窄，无散落 cast
 *  统一协议（2026-12）：Fragment 与数组项同构——多节点输出 = fragment-start/end 标记包裹，
 *  范围由标记推导（anchor = start 标记，DOM 持久化——随移动/移除天然同步）；组件经 _outputChild 递归 */
export function getOutputRange(input: VNodeChild, anchor: Node | null): Node[] | null {
  if (input == null || typeof input !== 'object') return null
  // Fragment / 数组项：多节点输出统一为标记范围（start..end 含标记）
  if (Array.isArray(input) || isFrag(input as VNode)) {
    const start = anchor
    if (start && start.nodeType === 8 && start.nodeValue?.includes('type=fragment-start')) {
      const range: Node[] = [start]
      // end 配对用同 fid（start/end 共享位置路径 id——嵌套数组项/Fragment fid 不同不干扰；
      // 与 rangeFor 同款——Frag 内嵌数组项时不能被 arr-end 截断）
      const startFid = /fid=([^\s"]+)/.exec(start.nodeValue)?.[1] ?? ''
      let n: Node | null = start.nextSibling
      while (n) {
        range.push(n)
        if (n.nodeType === 8 && n.nodeValue?.includes('type=fragment-end')) {
          const endFid = /fid=([^\s"]+)/.exec(n.nodeValue)?.[1] ?? startFid
          if (endFid === startFid) break
        }
        n = n.nextSibling
      }
      return range
    }
    return null
  }
  const vn = input as VNode
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

// ── 数组 key 模式（业务身份声明协议——框架不生成身份 key，design 归档） ──

/** 数组 key 模式：diff 策略状态机的状态 */
export type KeyMode = 'unkeyed' | 'keyed' | 'mixed'

/** 数组 key 模式判定（单一判定源——替代 patch 散落的 hasUserKey/allUnkeyed 计算）：
 *  - unkeyed：无用户 key（位置身份——按位置 patch）
 *  - keyed  ：全部用户 key（内容身份——按 key 匹配）
 *  - mixed  ：部分 key（无 key 项由 prepPos 分配 pos:{i} 后降级 keyed）
 *  豁免：占位/文本（无 key 协议豁免）；数组项（隐式 Fragment，位置语义）；
 *  portal（portalKey 不算用户 keyed——C1：[input(无key), portal] 按位置复用） */
export function keyModeOf(children: VNodeChild[]): KeyMode {
  let hasKey = false
  let hasUnkeyed = false
  for (const c of children) {
    if (c == null || typeof c === 'boolean' || typeof c === 'string' || typeof c === 'number') continue
    if (Array.isArray(c)) { hasUnkeyed = true; continue }
    const vn = c as VNode
    if (isPortal(vn)) continue
    if (vn.key != null) hasKey = true
    else hasUnkeyed = true
  }
  if (hasKey && hasUnkeyed) return 'mixed'
  if (hasKey) return 'keyed'
  return 'unkeyed'
}

export { Fragment, Portal }
