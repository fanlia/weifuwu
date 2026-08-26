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
import { keyedId } from '../node/keyed.ts'
import { childrenOf } from '../node/children.ts'
import { removeVNodeTree, outputBase, removalParent } from './cleanup.ts'
import { outputToChild } from '../node/component.ts'
import { disposeComponent, renderComponent, type ComponentRegistry } from '../node/component.ts'
import type { Command } from '../command/index.ts'
import type { RenderSink } from '../build.ts'
import type { UIContext } from '../../context/UIContext.ts'
import { diffAttrs } from './attrs.ts'
import { diffComponentOutput } from './output.ts'
import { diffChildren, diffChildrenItems, emitWithKey } from './children.ts'

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
    // **keyed 感知（R4 fuzz D4 实证——id 空间双实现偏差）**：组件声明 key →
    // 实例 id = keyedId(parent, key)（build 同源——.k{key} 空间）——槽位 id
    // 只在 unkeyed 使用——否则 diff 查 rec 落空（build 注册在 keyedId）→
    // 重 mount 到槽位——旧键实例残留 + 幽灵 id（fuzz seed=11 i=2 实证）
    const keyed = newV.key !== null
    const kid = keyed ? keyedId(parent, newV.key as string) : id
    const oldRecKid = typeof oldV.type === 'function' && oldV.key !== null
      ? keyedId(parent, oldV.key as string)
      : id
    // **身份比较（type + key）**：key 变化 = 业务身份变化（条件渲染
    //  A key=x → B key=y）——旧实例（oldRecKid 空间）卸载——不是复用
    let rec = registry.get(kid)
    if (kid !== oldRecKid || (rec && rec.type !== newV.type)) {
      // **统一旧实例清理**（key 空间变化含 unkeyed→keyed 反向——旧
      // 空间 rec 必须卸载——否则旧实例残留 + onUnmounts 不执行）
      const oldRec = registry.get(oldRecKid)
      if (oldRec) {
        // **容器级显式 unmount（R4 fuzz D4 实证——key 空间变化）**：旧
        // 实例 id（keyedId）≠ 新 id——mount 命令不覆盖旧 id——S_INST 面
        // 残留（root.kk17 幽灵——Sim 实例面只由 mount/unmount 驱动）。
        // 同空间 type 变化不发（id 复用——mount 覆盖——等价）
        if (oldRecKid !== kid) emitCommand({ op: 'unmount', compId: oldRecKid })
        // **顺序纪律（R4 fuzz D4 实证）**：先清理输出区间（removeVNodeTree
        //  递归查 registry 的嵌套 lastOutput——**实例必须先存在**）——
        //  **后** disposeComponent（卸载 onUnmounts + 删实例）——顺序颠倒
        //  → 嵌套输出查询落空 → DOM 残留（kk17.kmk16.* 幽灵实证）
        const oldOut = oldRec.lastOutput
        if (oldOut !== undefined) {
          const child = outputToChild(oldOut)
          removeVNodeTree(child, outputBase(child, oldRecKid, pathId(parent, index)), removalParent(child, oldRecKid, parent), emitCommand, registry)
        }
        disposeComponent(oldRecKid, registry)
      }
      // 新实例（旧已卸载——重新 mount——工厂执行）
      rec = undefined
      await renderComponent(newV, parent, index, ref, kid, ctx, registry, emit, emitCommand)
      emitCommand({ op: 'mount', compId: kid })
      return
    }
    const oldOut = rec?.lastOutput
    const isNew = await renderComponent(newV, parent, index, ref, kid, ctx, registry, async (out, p, i, r) => {
      // **组件输出对照（中转——细节在 output.ts——单一实现源——
      //  禁止内联双实现漂移）**：null↔vnode 转换/单节点对照/数组对照/
      //  数组↔单节点 transform——compId/slotId（输出形态 id 空间——证明
      //  审计）——keyed 输出组件递归 emitWithKey（keyedId rec 对照）
      await diffComponentOutput(oldOut, out, p, i, r, emit, emitCommand, ctx, registry, diffSame, kid, pathId(parent, index), (out2, p2, i2, r2, key) => emitWithKey(out2, p2, i2, r2, key, emit, emitCommand, ctx, registry))
    })
    // **mount 指令（组件生命周期——初始化完成——仅新实例）**
    if (isNew) emitCommand({ op: 'mount', compId: kid })
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
