/**
 * vdom core/diff — output（组件输出对照——细节模块）
 *
 * 职责：组件 renderFn 输出的对照决策——输出级空值转换（null ↔ vnode——
 * transform 状态机）、单节点对照（diffSame）、数组输出对照（逐项 diffSlot）、
 * 数组 ↔ 单节点（transform——旧展开区间递归清理）、类型切换（卸载重建）。
 *
 * diffSame 组件分支的 sink 在此实现——diff/same 只做中转。
 */

import type { VNode, VNodeChild } from '../vnode.ts'
import type { Command } from '../command/index.ts'
import { pathId } from '../node/native.ts'
import { keyedId } from '../node/keyed.ts'
import { stateOf } from '../transform/states.ts'
import { transitionOf } from '../transform/table.ts'
import type { RenderSink } from '../build.ts'
import type { ComponentRegistry, CompOutput } from '../node/component.ts'
import type { UIContext } from '../../context/UIContext.ts'
import { diffChildrenItems } from './children.ts'

/** 组件输出对照（组件分支 sink——细节集中在此）
 *  **方案 3——判别联合穷尽**：oldOut 为 CompOutput（null 结构性消除）——
 *  switch(kind) 编译器强制——hole（空洞锚）与真实输出同等处理——
 *  undefined = 未渲染（首帧——全量渲染） */
export async function diffComponentOutput(
  oldOut: CompOutput | undefined,
  out: VNodeChild,
  p: string,
  i: number,
  r: string | null,
  emit: RenderSink,
  emitCommand: (cmd: Command) => void,
  ctx: UIContext,
  registry: ComponentRegistry,
  diffSame: (oldV: VNode, newV: VNode, parent: string, index: number, ref: string | null, emit: RenderSink, emitCommand: (cmd: Command) => void, ctx: UIContext, registry: ComponentRegistry) => Promise<void>,
  /** 组件实例 compId（**证明审计——输出形态 id 空间**）：组件输出单元素
   *  挂槽位（锚点法——id = compId）；空洞/数组/组件输出挂 compId 子空间
   *  （compId.0 起）——转换的 oldId 必须按**旧输出形态**计算（p/i 是
   *  新输出的 sink 参数——数组/空洞输出时 p=compId、i=0——outId 对新
   *  输出正确对旧输出错位——可变输出 div→数组/收缩/展开实证——旧 div
   *  保留 + 锚插入 + 实例残留）
   *  @param slotId 组件槽位（单元素/文本输出挂载点——= pathId(渲染父,
   *  渲染索引)——keyed 组件 compId ≠ 槽位——必须由调用点提供）
   *  @param keyedOut keyed 组件输出回调（对照分支——keyed 输出组件的
   *  rec 在 keyedId(p, key)——diffSame 按槽位查落空——递归 emitWithKey） */
  compId: string,
  slotId: string,
  keyedOut?: (out: VNodeChild, p: string, i: number, r: string | null, key: string) => Promise<void>,
): Promise<void> {
  // **旧输出基线（输出形态 → 渲染位置——单一规则源）**：单 vnode 元素/
  // 文本输出挂槽位（slotId）；组件/空洞/数组输出挂 compId.0 起
  const oldBase = (): string => {
    if (oldOut?.kind === 'vnode') {
      const v = oldOut.v
      if (v !== null && typeof v === 'object' && typeof (v as VNode).type === 'function') return pathId(compId, 0)
      return slotId
    }
    return pathId(compId, 0)
  }
  const outId = pathId(p, i)
  const isHole = out === null || out === undefined || typeof out === 'boolean'
  if (oldOut === undefined) {
    // 首帧输出（无旧记录）——全量渲染
    await emit(out, p, i, r)
    return
  }
  switch (oldOut.kind) {
    case 'hole': {
      // 旧锚 → 新输出（remove 锚 + 新侧渲染——hole→X 转换）
      if (!isHole) {
        const t = transitionOf('hole', stateOf(out))
        if (!t) throw new Error(`[vdom] 状态机违例：未定义转换 hole → ${stateOf(out)}（组件输出展开——P2 显式 Reject）`)
        // **oldId = 旧锚位置（compId.0——compId 子空间——非 outId）**
        await t(null, out, { emit: emitCommand, emitNode: emit, oldId: oldBase(), newId: outId, parent: p, index: i, ref: r, registry })
      }
      // 旧锚 + 新空洞：锚保持（no-op）
      return
    }
    case 'vnode': {
      if (isHole) {
        // vnode → 空洞（remove 旧 + 占位锚——同构保持）
        const t = transitionOf(stateOf(oldOut.v), 'hole')
        if (!t) throw new Error(`[vdom] 状态机违例：未定义转换 ${stateOf(oldOut.v)} → hole（组件输出收缩——P2 显式 Reject）`)
        // **oldCompId（G10④ 同源——输出收缩的实例残留）**：oldOut 是
        //  组件时其渲染 compId（keyed → keyedId(compId, key)；unkeyed →
        //  pathId(compId, 0)——sink 特判子空间）——缺失则 unmount/区间
        //  清理跳过（实例残留 + 单锚 remove）
        const ov = oldOut.v as VNode
        const oldCompId = ov !== null && typeof ov === 'object' && typeof ov.type === 'function'
          ? (ov.key !== null ? keyedId(compId, ov.key) : pathId(compId, 0))
          : undefined
        // **oldId = 旧输出位置（单元素挂槽位=slotId；组件输出挂 compId.0）**
        await t(oldOut.v, out, { emit: emitCommand, emitNode: emit, oldId: oldBase(), newId: outId, parent: p, index: i, ref: r, registry, oldCompId })
      } else if (!Array.isArray(out)) {
        // 单节点输出对照（同实例——精准增量）——**keyed 输出组件特判
        //  （probe2 同源——rec 在 keyedId(p, key)——diffSame 按槽位查落空）**
        const ov = out as VNode
        if (keyedOut && ov !== null && typeof ov === 'object' && typeof ov.type === 'function' && ov.key !== null) {
          await keyedOut(out, p, i, r, ov.key)
        } else {
          await diffSame(oldOut.v, ov, p, i, r, emit, emitCommand, ctx, registry)
        }
      } else {
        // vnode → 数组（transitionFragment——旧展开区间递归清理）
        const t = transitionOf(stateOf(oldOut.v), 'array')
        if (!t) throw new Error(`[vdom] 状态机违例：未定义转换 ${stateOf(oldOut.v)} → array（单节点→多根——P2 显式 Reject）`)
        // **oldId = 旧输出位置（单元素挂槽位=compId）**
        await t(oldOut.v, out, { emit: emitCommand, emitNode: emit, oldId: oldBase(), newId: outId, parent: p, index: i, ref: r, registry })
      }
      return
    }
    case 'array': {
      if (isHole) {
        // 数组 → 空洞（transitionFragment——旧展开区间递归清理）
        const t = transitionOf('array', 'hole')
        if (!t) throw new Error(`[vdom] 状态机违例：未定义转换 array → hole（多根收缩——P2 显式 Reject）`)
        // **oldId = 旧数组展开起点（compId.0）**
        await t(oldOut.items, out, { emit: emitCommand, emitNode: emit, oldId: oldBase(), newId: outId, parent: p, index: i, ref: r, registry })
      } else if (Array.isArray(out)) {
        // 数组输出对照（隐式 Fragment——逐项）
        await diffChildrenItems(oldOut.items, out, p, emit, emitCommand, ctx, registry)
      } else {
        // 数组 → 单节点（transitionFragment——旧展开区间递归清理）
        const t = transitionOf('array', stateOf(out))
        if (!t) throw new Error(`[vdom] 状态机违例：未定义转换 array → ${stateOf(out)}（多根→单节点——P2 显式 Reject）`)
        await t(oldOut.items, out, { emit: emitCommand, emitNode: emit, oldId: oldBase(), newId: outId, parent: p, index: i, ref: r, registry })
      }
      return
    }
  }
}
