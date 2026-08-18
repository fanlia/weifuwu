/**
 * vdom core/node — keyed（keyed 列表语义——业务身份声明协议）
 *
 * 规则（AGENTS §4.0/§5.7——key 业务身份声明）：
 * - **框架不生成身份 key**——数组项 key 只由业务声明（数据 id → keyBy /
 *   组件内部生成 / 用户显式 key）；无 key = 位置身份（unkeyed 按位置 patch）
 * - **全 keyed**：key 身份映射——增删/重排复用正确（身份跟随内容——
 *   状态不漂移）
 * - **全 unkeyed**：按位置对照（静态/无状态列表正确零噪音）
 * - **混合数组**（部分 key）：无 key 项由位置接管——`pos:{i}` 位置 key——
 *   命名空间隔离（pos: 前缀——**永不与用户 key 冲突**）
 * - **A 级检测**（dev）：数组长度变化 + 无 key 组件项 → warn 引导声明 key
 *
 * 消费方：diff.ts（keyed 列表 diff——身份映射/复用决策）。
 */

import type { VNode, VNodeChild } from '../vnode.ts'

/** 位置 key 前缀（混合数组——无 key 项位置接管——命名空间隔离） */
export const POS_KEY_PREFIX = 'pos:'

/** 数组项 key（vnode.key——纯数据面——非 vnode 项 = null） */
export function keyOf(v: VNodeChild): string | null {
  if (v === null || v === undefined || typeof v === 'boolean') return null
  if (typeof v === 'string' || typeof v === 'number') return null
  if (Array.isArray(v)) return null
  return (v as VNode).key
}

/** 数组项是否显式 keyed（业务声明——vnode.key 非 null） */
export function isKeyed(v: VNodeChild): boolean {
  return keyOf(v) !== null
}

/** 列表分类：全 keyed / 全 unkeyed / 混合 */
export type KeyedKind = 'all-keyed' | 'all-unkeyed' | 'mixed'

/** 列表 keyed 分类（空列表 = all-unkeyed——无身份可言） */
export function listKind(items: VNodeChild[]): KeyedKind {
  let hasKey = false
  let hasUnkeyed = false
  for (const item of items) {
    if (isKeyed(item)) hasKey = true
    else hasUnkeyed = true
    if (hasKey && hasUnkeyed) return 'mixed'
  }
  return hasKey ? 'all-keyed' : 'all-unkeyed'
}

/** 位置 key（混合数组——无 key 项的位置接管——pos: 前缀永不与用户 key 冲突） */
export function positionKey(i: number): string {
  return `${POS_KEY_PREFIX}${i}`
}

/** 是否为位置 key（pos: 前缀——命名空间识别） */
export function isPositionKey(k: string): boolean {
  return k.startsWith(POS_KEY_PREFIX)
}

/** 统一身份键（keyed 项用业务 key——unkeyed 项用位置 key——混合数组同一映射） */
export function identityKey(items: VNodeChild[], i: number): string {
  const k = keyOf(items[i])
  return k ?? positionKey(i)
}

/** keyed 列表身份映射（key → 项索引——增删/重排决策用） */
export function keyIndex(items: VNodeChild[]): Map<string, number> {
  const map = new Map<string, number>()
  items.forEach((item, i) => {
    const k = keyOf(item)
    if (k !== null && !map.has(k)) map.set(k, i)
  })
  return map
}

/** keyed 复用决策（旧列表 × 新列表——key 交集 → 复用；旧有新无 → 移除；
 *  旧无新有 → 新建）——diff 消费 */
export interface KeyedDiffPlan {
  /** 复用的 key（身份保持——节点移动/就地更新） */
  reused: string[]
  /** 移除的旧 key（不在新列表） */
  removed: string[]
  /** 新建的新 key（不在旧列表） */
  added: string[]
}

export function planKeyedDiff(oldItems: VNodeChild[], newItems: VNodeChild[]): KeyedDiffPlan {
  const oldIdx = keyIndex(oldItems)
  const newIdx = keyIndex(newItems)
  const reused: string[] = []
  const removed: string[] = []
  const added: string[] = []
  for (const [k] of oldIdx) {
    if (newIdx.has(k)) reused.push(k)
    else removed.push(k)
  }
  for (const [k] of newIdx) {
    if (!oldIdx.has(k)) added.push(k)
  }
  return { reused, removed, added }
}

/** A 级检测（dev——数组长度变化 + 无 key 组件项 → warn 引导声明 key——
 *  用户层引导；豁免：portal 槽/单子节点条件渲染的 null 空洞） */
export function detectMissingKey(items: VNodeChild[], context: string): void {
  if (items.length < 2) return
  const hasComponent = items.some((i) => typeof (i as VNode | null)?.type === 'function')
  const hasMissing = items.some((i) => !isKeyed(i) && typeof (i as VNode | null)?.type === 'function')
  if (hasComponent && hasMissing) {
    console.warn(
      `[vdom] ${context}：列表含无 key 的组件项（长度 ${items.length}）——` +
      '动态增删/重排时状态会按位置继承——请为组件项声明 key（数据 id → keyBy）',
    )
  }
}
