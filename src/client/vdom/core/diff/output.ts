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
import type { ComponentRegistry } from '../node/component.ts'
import type { UIContext } from '../../context/UIContext.ts'
import { diffChildrenItems } from './children.ts'

/** 组件输出对照（组件分支 sink——细节集中在此） */
export async function diffComponentOutput(
  oldOut: VNodeChild | null | undefined,
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
  // 输出级空值转换（状态机统一——transform 完整转换）：
  //   vnode → null：element→hole（remove 旧 + 占位锚——wf-hole——同构保持）
  //   null → vnode：hole→element（remove 锚 + 新侧渲染——X-G4 恢复）
  if (out === null || out === undefined) {
    if (oldOut !== undefined && oldOut !== null) {
      const t = transitionOf(stateOf(oldOut), 'hole')
      if (t) await t(oldOut, out, { emit: emitCommand, emitNode: emit, oldId: outId, newId: outId, parent: p, index: i, ref: r })
    }
    // 旧输出已为 null（锚保持——no-op）
    return
  }
  if (oldOut === null) {
    const t = transitionOf('hole', stateOf(out))
    if (t) await t(null, out, { emit: emitCommand, emitNode: emit, oldId: outId, newId: outId, parent: p, index: i, ref: r })
    return
  }
  if (oldOut !== undefined && oldOut !== null) {
    if (!Array.isArray(oldOut) && !Array.isArray(out)) {
      // 单节点输出对照（同实例——精准增量）
      await diffSame(oldOut as VNode, out as VNode, p, i, r, emit, emitCommand, ctx, registry)
    } else if (Array.isArray(oldOut) && Array.isArray(out)) {
      // 数组输出对照（隐式 Fragment——逐项）
      await diffChildrenItems(oldOut, out, p, emit, emitCommand, ctx, registry)
    } else {
      // 数组 ↔ 单节点——transform（transitionFragment——旧展开区间递归清理）
      const t = transitionOf(stateOf(oldOut), stateOf(out))
      if (t) await t(oldOut, out, { emit: emitCommand, emitNode: emit, oldId: outId, newId: outId, parent: p, index: i, ref: r })
    }
  } else {
    // 首帧输出（无旧输出）——全量渲染
    await emit(out, p, i, r)
  }
}
