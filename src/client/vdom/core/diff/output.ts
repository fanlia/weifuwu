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
): Promise<void> {
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
        await t(null, out, { emit: emitCommand, emitNode: emit, oldId: outId, newId: outId, parent: p, index: i, ref: r, registry })
      }
      // 旧锚 + 新空洞：锚保持（no-op）
      return
    }
    case 'vnode': {
      if (isHole) {
        // vnode → 空洞（remove 旧 + 占位锚——同构保持）
        const t = transitionOf(stateOf(oldOut.v), 'hole')
        if (!t) throw new Error(`[vdom] 状态机违例：未定义转换 ${stateOf(oldOut.v)} → hole（组件输出收缩——P2 显式 Reject）`)
        await t(oldOut.v, out, { emit: emitCommand, emitNode: emit, oldId: outId, newId: outId, parent: p, index: i, ref: r, registry })
      } else if (!Array.isArray(out)) {
        // 单节点输出对照（同实例——精准增量）
        await diffSame(oldOut.v, out as VNode, p, i, r, emit, emitCommand, ctx, registry)
      } else {
        // vnode → 数组（transitionFragment——旧展开区间递归清理）
        const t = transitionOf(stateOf(oldOut.v), 'array')
        if (!t) throw new Error(`[vdom] 状态机违例：未定义转换 ${stateOf(oldOut.v)} → array（单节点→多根——P2 显式 Reject）`)
        await t(oldOut.v, out, { emit: emitCommand, emitNode: emit, oldId: outId, newId: outId, parent: p, index: i, ref: r, registry })
      }
      return
    }
    case 'array': {
      if (isHole) {
        // 数组 → 空洞（transitionFragment——旧展开区间递归清理）
        const t = transitionOf('array', 'hole')
        if (!t) throw new Error(`[vdom] 状态机违例：未定义转换 array → hole（多根收缩——P2 显式 Reject）`)
        await t(oldOut.items, out, { emit: emitCommand, emitNode: emit, oldId: outId, newId: outId, parent: p, index: i, ref: r, registry })
      } else if (Array.isArray(out)) {
        // 数组输出对照（隐式 Fragment——逐项）
        await diffChildrenItems(oldOut.items, out, p, emit, emitCommand, ctx, registry)
      } else {
        // 数组 → 单节点（transitionFragment——旧展开区间递归清理）
        const t = transitionOf('array', stateOf(out))
        if (!t) throw new Error(`[vdom] 状态机违例：未定义转换 array → ${stateOf(out)}（多根→单节点——P2 显式 Reject）`)
        await t(oldOut.items, out, { emit: emitCommand, emitNode: emit, oldId: outId, newId: outId, parent: p, index: i, ref: r, registry })
      }
      return
    }
  }
}
