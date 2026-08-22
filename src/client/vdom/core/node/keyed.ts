/**
 * vdom core/node — keyed（keyed 列表语义——业务身份声明协议）
 *
 * 规则（设计规则 §4.0/§5.7——key 业务身份声明）：
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

/** keyed 组件实例 id（**key 转义——id 空间注入防御**）：compId =
 *  `{parent}.k{key}`——'.' 是路径分隔符——用户 key 可含任意字符（数据
 *  id——如 'a.b'）——直接拼接则 'root.0.ka' 与 'root.0.ka.b'（key='a.b'）
 *  产生前缀关系——disposeComponent/remapSubtree/procRemove 的 startsWith
 *  前缀匹配误删兄弟 keyed 实例（key 注入实证——unmount root.0.ka 误删
 *  root.0.ka.b——实例状态丢失 + onUnmounts 错乱）——'%' 先行转义（防
 *  '.' 转义后 '%' 二次歧义：'a.b'→'a%2Eb'，'a%2Eb'→'a%252Eb'——互不碰撞）
 *  ——build/diff/cleanup 全部生成点统一走本函数（单一实现源） */
export function keyedId(parent: string, key: string): string {
  return `${parent}.k${key.replace(/%/g, '%25').replace(/\./g, '%2E')}`
}

/** 数组项 key（vnode.key——纯数据面——非 vnode 项 = null） */
export function keyOf(v: VNodeChild): string | null {
  if (v === null || v === undefined || typeof v === 'boolean') return null
  if (typeof v === 'string' || typeof v === 'number') return null
  if (Array.isArray(v)) return null
  const vn = v as VNode
  return vn.key
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

/** A 级检测（dev——重复 key → warn 引导修正——重复 key 是非法输入：
 *  身份映射无唯一语义——diffKeyedChildren 按首现优先处理（与 keyIndex
 *  对齐——确定性）——但列表本身应修正（fuzz 实证：重复 key 导致 move
 *  映射错位——旧节点残留/新节点错位——终态不等价）） */
export function detectDuplicateKey(items: VNodeChild[], context: string): void {
  const seen = new Set<string>()
  for (const item of items) {
    const k = keyOf(item)
    if (k !== null) {
      if (seen.has(k)) {
        // eslint-disable-next-line no-console
        console.warn(
          `[vdom] ${context}：重复 key "${k}"（列表身份映射歧义——增删/重排行为不确定）——` +
          '请为每项声明唯一 key（数据 id → keyBy）',
        )
        return
      }
      seen.add(k)
    }
  }
}

/** A 级检测（dev——数组长度变化 + 无 key 组件项 → warn 引导声明 key——
 *  用户层引导；豁免：单子节点条件渲染的 null 空洞） */
export function detectMissingKey(items: VNodeChild[], context: string): void {
  if (items.length < 2) return
  const hasComponent = items.some((i) => typeof (i as VNode | null)?.type === 'function')
  const hasMissing = items.some((i) => !isKeyed(i) && typeof (i as VNode | null)?.type === 'function')
  if (hasComponent && hasMissing) {
    const kinds = items.map((i) => {
      const v = i as VNode | null
      if (v === null || v === undefined) return 'null'
      if (typeof v === 'boolean') return 'bool'
      if (typeof v === 'string' || typeof v === 'number') return 'text'
      if (Array.isArray(v)) return 'arr'
      return typeof v.type === 'function' ? 'comp:' + ((v.type as any).name ?? '?') : 'el:' + String(v.type)
    })
    // eslint-disable-next-line no-console
    console.warn(
      `[vdom] ${context}：列表含无 key 的组件项（长度 ${items.length}）——` +
      `项: [${kinds.join(', ')}]——` +
      '动态增删/重排时状态会按位置继承——请为组件项声明 key（数据 id → keyBy）',
    )
  }
}
