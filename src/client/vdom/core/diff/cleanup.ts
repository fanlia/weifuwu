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
import { childrenOf, slotCount } from '../node/children.ts'
import { isFragment } from '../node/fragment.ts'
import type { Command } from '../command/index.ts'
import { pathId } from '../node/native.ts'
import { outputToChild, type ComponentRegistry } from '../node/component.ts'

/** **组件输出清理基线（C2——outIsComponent 特判的 id 空间统一）**：
 *  renderComponent 输出组件时 sink 用 compId 作 parent（特判——防 compId
 *  冲突）——输出 DOM 的 id 空间：
 *  - 单 vnode 组件 → pathId(compId, 0)（首槽）
 *  - 数组首项组件 → compId（数组展开 pathId(compId, i)）
 *  - 普通输出 → 槽位 id（slotId——锚点法）
 *  清理递归必须以**同一基线**计算——否则组件项 unmount compId 错位
 *  （unmount 外层实例/内层残留——组件 fuzz 89% 不等价实证——S_INST 面
 *  错乱） */
export function outputBase(out: VNodeChild, compId: string, slotId: string): string {
  if (typeof (out as VNode)?.type === 'function') return pathId(compId, 0)
  // **数组全部特判（C2）**——多根输出挂 compId 子空间（与兄弟隔离）
  if (Array.isArray(out)) return compId
  // **null/空洞输出（C2 修正）**——与 sink 特判一致（锚挂 compId.0——
  //  清理基线统一——否则 remove root.0 删不到 root.0.0 的锚）
  if (out === null || out === undefined || typeof out === 'boolean') return pathId(compId, 0)
  return slotId
}

/** 旧输出递归清理（组件类型切换——remove 命令——同构保持）
 *  @param v       旧输出（VNodeChild 全形态——数组 = 组件输出多根）
 *  @param base    当前项 id（顶层 = outputBase 计算；递归 = pathId(base, i)）
 *  @param parent  当前容器 id（keyed 组件项 compId 用——渲染 sink 的 parent）
 *  @param registry 组件实例注册表（可选——组件项输出区间递归清理——
 *  嵌套组件 A > B > C 的 B 多根展开——C2） */
export function removeVNodeTree(
  v: VNodeChild, base: string, parent: string, emitCommand: (cmd: Command) => void,
  registry?: ComponentRegistry | null,
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
    // 数组（组件输出多根——**compId 子空间**——C2：渲染 sink(out, compId,
    //  0) 数组特判——展开 pathId(compId, i)——base = compId（outputBase
    //  传入）——pathId(base, slot)——**槽位推进（FRAG 项占多槽）**
    if ((globalThis as any).__DBG4) console.log(`[dbg-arr] 数组 base=${base} parent=${parent} 项数=${v.length}`)
    let slot = 0
    for (const c of v) {
      removeVNodeTree(c, pathId(base, slot), parent, emitCommand, registry)
      slot += slotCount(c)
    }
    return
  }
  const vn = v as VNode
  // **Fragment 符号 vnode（fuzz#117 实证）**：展开到**父级连续槽位**
  // （渲染路径：emit(c, parent, index+i)——不是自身子路径 pathId(base,i)——
  //  单锚/子路径 remove 会错位残留）——index 从 base 相对 parent 推导
  if (isFragment(vn)) {
    const index = Number(base.slice(parent.length + 1))
    const cs = childrenOf(vn)
    // **槽位推进（投影维度——children 里的 FRAG 项占多槽——按索引 +1
    //  错位——fuzz seed=42 i=398 实证——div 残留）**
    let slot = index
    for (const c of cs) {
      removeVNodeTree(c, pathId(parent, slot), parent, emitCommand, registry)
      slot += slotCount(c)
    }
    return
  }
  // 组件项：unmount（实例卸载——onUnmounts——与渲染 compId 规则一致）
  if (typeof vn.type === 'function') {
    const compId = vn.key !== null ? `${parent}.k${vn.key}` : base
    if ((globalThis as any).__DBG5) console.log(`[dbg-comp] unmount ${compId} base=${base} parent=${parent}`)
    emitCommand({ op: 'unmount', compId })
    // **组件输出区间递归清理（C2——嵌套组件 A > B > C）**：组件项的
    // DOM 展开在 registry.lastOutput（非 vnode.children——renderFn 输出）
    // ——只 remove 单锚会让 B 的展开区间残留——查 registry 递归——
    // 基线 = outputBase（B 输出的 id 空间——特判规则）
    const out = registry?.get(compId)?.lastOutput
    // **方案 3：lastOutput 是 CompOutput 判别联合——`!== undefined` 统一
    //  （hole/array/vnode 同等处理——空洞锚 compId.0 也清理——组件 fuzz
    //  an:root.1.0 幽灵实证）**
    if (out !== undefined) {
      const child = outputToChild(out)
      const innerBase = outputBase(child, compId, base)
      removeVNodeTree(child, innerBase, compId, emitCommand, registry)
    }
  }
  // children 递归（容器 = 当前项 id）——**槽位推进（FRAG 项占多槽）**
  const cs = childrenOf(vn)
  let slot = 0
  cs.forEach((c) => {
    const cid = pathId(base, slot)
    if (c !== null && typeof c !== 'string' && typeof c !== 'number' && typeof c !== 'boolean' && !Array.isArray(c)) {
      removeVNodeTree(c, cid, base, emitCommand, registry)
    } else {
      emitCommand({ op: 'remove', id: cid })
    }
    slot += slotCount(c)
  })
  emitCommand({ op: 'remove', id: base })
}
