/**
 * vdom core/diff — same（同态对照决策——中转）
 *
 * 职责：同位置同类型的对照决策——组件分支（类型比较/复用——输出对照
 * 细节在 output.ts）、元素分支（diffAttrs + diffChildren——细节在
 * attrs.ts/children.ts）。
 *
 * 本文件是「对照决策的中转站」——具体命令生成下沉 attrs/children/output/
 * cleanup——自身不处理细节逻辑。
 */

import type { VNode, VNodeChild } from '../vnode.ts'
import { stateOf } from '../transform/states.ts'
import { transitionOf } from '../transform/table.ts'
import { pathId } from '../node/native.ts'
import { disposeComponent, renderComponent, type ComponentRegistry } from '../node/component.ts'
import type { Command } from '../command/index.ts'
import type { RenderSink } from '../build.ts'
import type { UIContext } from '../../context/UIContext.ts'
import { diffAttrs } from './attrs.ts'
import { removeVNodeTree } from './cleanup.ts'
import { diffComponentOutput } from './output.ts'
import { diffChildren, diffChildrenItems } from './children.ts'

/**
 * 同态对照（同位置同类型——**精准命令生成**）：
 * 组件 → renderComponent 复用（工厂不重跑——lastOutput 对照递归）；
 * 元素 → 属性值比较（只发变化）+ 函数面引用比较 + children 递归（列表分类）
 */
export async function diffSame(
  oldV: VNode,
  newV: VNode,
  parent: string,
  index: number,
  ref: string | null,
  emit: RenderSink,
  emitCommand: (cmd: Command) => void,
  ctx: UIContext,
  registry: ComponentRegistry,
): Promise<void> {
  const id = pathId(parent, index)
  // 组件复用（工厂不重跑——renderFn 重新调用——输出对照上次——精准 patch）
  if (typeof newV.type === 'function') {
    const rec = registry.get(id)
    // **类型比较**：同位置不同类型（条件切换 A → B）——卸载旧实例 + 重建
    if (rec && rec.type !== newV.type) {
      // **同步卸载**（onUnmounts + 删 rec——不等 patch 消费 unmount 命令——
      // 否则 renderComponent 立即复用旧 rec——类型错位）
      disposeComponent(id, registry)
      // 旧输出清理（递归 remove——lastOutput 结构）
      if (rec.lastOutput !== undefined && rec.lastOutput !== null) {
        removeVNodeTree(rec.lastOutput as VNode, pathId(parent, index), emitCommand)
      }
      // 新实例（rec 已删——重新 mount——工厂执行）
      await renderComponent(newV, parent, index, ref, id, ctx, registry, emit)
      emitCommand({ op: 'mount', compId: id })
      return
    }
    const oldOut = rec?.lastOutput
    const isNew = await renderComponent(newV, parent, index, ref, id, ctx, registry, async (out, p, i, r) => {
      const outId = pathId(p, i)
      // **输出级转换（状态机统一——transform 完整转换）**：
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
      if (oldOut !== undefined && typeof oldV.type === 'function') {
        if (!Array.isArray(oldOut) && !Array.isArray(out)) {
          // 单节点输出对照（同实例——精准增量）
          await diffSame(oldOut as VNode, out as VNode, p, i, r, emit, emitCommand, ctx, registry)
        } else if (Array.isArray(oldOut) && Array.isArray(out)) {
          // **数组输出对照**（隐式 Fragment——逐项 diffSlot——portal 关闭 →
          // removePortal 清理——不做全量重建残留）
          await diffChildrenItems(oldOut, out, p, emit, emitCommand, ctx, registry)
        } else {
          // **数组 ↔ 单节点**——transform 状态机（transitionFragment——
          // 旧展开区间递归完整清理 + 新侧渲染）
          const t = transitionOf(stateOf(oldOut), stateOf(out))
          if (t) await t(oldOut, out, { emit: emitCommand, emitNode: emit, oldId: pathId(p, i), newId: pathId(p, i), parent: p, index: i, ref: r })
        }
      } else {
        await emit(out, p, i, r)
      }
    })
    // **mount 指令（组件生命周期——初始化完成——仅新实例）**
    if (isNew) emitCommand({ op: 'mount', compId: id })
    return
  }
  // 元素同标签：属性精准 diff + children 递归对照
  if (typeof newV.type === 'string' && typeof oldV.type === 'string' && oldV.type === newV.type) {
    diffAttrs(oldV, newV, id, emitCommand)
    await diffChildren(oldV, newV, id, emit, emitCommand, ctx, registry)
    return
  }
  // 其余同态（text/fragment 等）——首版：新侧重建（位置对照）
  await emit(newV, parent, index, ref)
}

/** 属性精准 diff（值比较——只发变化的键；函数面引用比较——prev 传递） */
