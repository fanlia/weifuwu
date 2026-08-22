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
import { isFragment } from '../node/fragment.ts'
import { stateOf } from '../transform/states.ts'
import { transitionOf } from '../transform/table.ts'
import { pathId } from '../node/native.ts'
import { childrenOf } from '../node/children.ts'
import { removeVNodeTree, outputBase } from './cleanup.ts'
import { outputToChild } from '../node/component.ts'
import { disposeComponent, renderComponent, type ComponentRegistry } from '../node/component.ts'
import type { Command } from '../command/index.ts'
import type { RenderSink } from '../build.ts'
import type { UIContext } from '../../context/UIContext.ts'
import { diffAttrs } from './attrs.ts'
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
    if ((globalThis as any).__DBG6) console.log(`[dbg-same] 组件分支 id=${id} rec=${!!rec} typeSame=${rec?.type === newV.type}`)
    if (rec && rec.type !== newV.type) {
      // **同步卸载**（onUnmounts + 删 rec——不等 patch 消费 unmount 命令——
      // 否则 renderComponent 立即复用旧 rec——类型错位）
      disposeComponent(id, registry)
      // 旧输出清理（递归 remove——lastOutput 结构——数组安全（G1）——
      // 区间完整（数组逐项展开槽位 + 组件项 unmount））
      if (rec.lastOutput !== undefined) {
        // **方案 3：lastOutput 是 CompOutput——转换后清理（hole/array/vnode
        //  同等——空洞锚也清理）——基线 outputBase**
        const child = outputToChild(rec.lastOutput)
        removeVNodeTree(child, outputBase(child, id, pathId(parent, index)), parent, emitCommand, registry)
      }
      // 新实例（rec 已删——重新 mount——工厂执行）
      await renderComponent(newV, parent, index, ref, id, ctx, registry, emit, emitCommand)
      emitCommand({ op: 'mount', compId: id })
      return
    }
    const oldOut = rec?.lastOutput
    const isNew = await renderComponent(newV, parent, index, ref, id, ctx, registry, async (out, p, i, r) => {
      // **组件输出对照（中转——细节在 output.ts——单一实现源——
      //  禁止内联双实现漂移）**：null↔vnode 转换/单节点对照/数组对照/
      //  数组↔单节点 transform
      await diffComponentOutput(oldOut, out, p, i, r, emit, emitCommand, ctx, registry, diffSame)
    })
    // **mount 指令（组件生命周期——初始化完成——仅新实例）**
    if (isNew) emitCommand({ op: 'mount', compId: id })
    return
  }
  // 元素（string type）：同标签 → 属性精准 diff + children 递归对照；
  // **不同标签（div → span）→ 重建迁移（显式——P2 消灭隐式路径）**：
  // 同态但非同标签——旧元素让位（remove——含子树记录/事件/ref 清理——
  // 消除"兜底重建"的节点记录残留隐患）+ 新侧渲染（transitionElement 语义）
  if (typeof newV.type === 'string' && typeof oldV.type === 'string') {
    if (oldV.type === newV.type) {
      diffAttrs(oldV, newV, id, emitCommand)
      await diffChildren(oldV, newV, id, emit, emitCommand, ctx, registry)
    } else {
      // **根本修复（C2——统一区间移除——同 tag 分支的实例残留）**：
      // 单锚 remove 只删元素——子树内组件实例残留（S_INST 面——组件树
      // fuzz seed=99 i=4 实证——span{k1} 内 FRAG 组件项 unmount 缺失）——
      // removeVNodeTree 完整区间（声明树递归 + 组件项 unmount + 输出区间）
      removeVNodeTree(oldV, id, parent, emitCommand, registry)
      await emit(newV, parent, index, ref)
    }
    return
  }
  // **Fragment 符号 vnode 同态（G3——终态等价违例）**：fragment → fragment
  // 走 children 逐项对照（与数组同态 diffChildrenItems 一致——内容变化/缩短
  // 旧项移除——精准增量）——不复建（旧 rebuild 路径：create 幂等复用旧节点
  // 但缩短/变化的旧项无 remove——DOM 残留——fuzz 实证）
  if (isFragment(oldV as VNode) && isFragment(newV as VNode)) {
    await diffChildrenItems(childrenOf(oldV), childrenOf(newV), parent, emit, emitCommand, ctx, registry)
    return
  }
  // **显式 Reject（P2——消灭隐式路径）**：其余同态理论不可达——
  // text↔text/hole↔hole 由 diffSlot 前置拦截；array 由 childrenOf 展开；
  // element/component/fragment 已在上分支——到达即状态机违例（新形态
  // 加入时会立即暴露——不再静默重建）
  throw new Error(`[vdom] 状态机违例：diffSame 未定义同态对照 ${String(oldV.type)} ↔ ${String(newV.type)}（P2 显式 Reject）`)
}

/** 属性精准 diff（值比较——只发变化的键；函数面引用比较——prev 传递） */
