/**
 * vdom core/diff — children（children 对照 + keyed 列表策略——细节模块）
 *
 * 职责：children 列表对照——A 级检测（长度变化 + 无 key 组件 warn）、
 * 列表分类（all-keyed/含 keyed/unkeyed）、diffSlot 单槽对照（位置身份——
 * 含 null ↔ null 空洞保持）、diffKeyedChildren（相对顺序检测——顺移
 * noMove remap / 交换重建 / 实例复用）、emitWithKey（keyed 项渲染）。
 *
 * diff/same 只做中转——本文件为列表策略细节。
 */

import type { VNode, VNodeChild } from '../vnode.ts'
import { childrenOf, slotCount } from '../node/children.ts'
import { kindOf } from '../node/index.ts'
import { stateOf } from '../transform/states.ts'
import { transitionOf } from '../transform/table.ts'
import { listKind, planKeyedDiff, keyOf, detectMissingKey, isKeyed } from '../node/keyed.ts'
import { pathId } from '../node/native.ts'
import { isFragment } from '../node/fragment.ts'
import { emitHole } from '../node/hole.ts'
import { renderComponent, type ComponentRegistry } from '../node/component.ts'
import type { Command } from '../command/index.ts'
import type { RenderSink } from '../build.ts'
import type { UIContext } from '../../context/UIContext.ts'
import { diffSame } from './same.ts'
import { removeVNodeTree } from './cleanup.ts'
import { outputToChild } from '../node/component.ts'




/** children 对照（列表分类：全 unkeyed 位置身份 / 全 keyed 身份复用 / 混合） */
export async function diffChildren(
  oldV: VNode, newV: VNode, id: string,
  emit: RenderSink, emitCommand: (cmd: Command) => void,
  ctx: UIContext, registry: ComponentRegistry,
): Promise<void> {
  const oldCs = childrenOf(oldV)
  const newCs = childrenOf(newV)
  // **数组 ↔ 单节点形态转换豁免 A 级检测**：childrenOf 递归展开后长度
  // 变化（单节点展开 2 项 vs 原 1 项）——但这是同一槽的**形态转换**（非
  // 列表增删）——warn 误报——豁免：原始 props.children 一侧数组一侧非数组
  const shapeChanged = Array.isArray(oldV.props.children) !== Array.isArray(newV.props.children)
  await diffChildrenItems(oldCs, newCs, id, emit, emitCommand, ctx, registry, shapeChanged)
}

/** children 项对照（列表分类：全 unkeyed 位置身份 / 全 keyed 身份复用 / 混合——
 *  组件数组输出（隐式 Fragment）同用——旧项移除清理） */
export async function diffChildrenItems(
  oldCs: VNodeChild[], newCs: VNodeChild[],
  id: string,
  emit: RenderSink, emitCommand: (cmd: Command) => void,
  ctx: UIContext, registry: ComponentRegistry,
  shapeChanged = false,
): Promise<void> {
  // **投影对齐（P5）**：FRAG vnode 展开为槽位序列——对照以槽位为单位
  // （渲染 emit 同语义——fuzz seed=2026 实证）
  oldCs = expandFrag(oldCs)
  newCs = expandFrag(newCs)
  // A 级检测（长度变化 + 无 key 组件项 → warn 引导声明 key——
  // 无 key = 位置身份——长度变化时有状态组件位置继承漂移——
  // **豁免**：① 数组 ↔ 单节点形态转换（shapeChanged——非列表增删）
  // ② 单子节点条件渲染（`cond ? <X/> : null`——null 是空洞占位——同构
  // 不变量——非列表项——ColorPicker 选中态不误报）
  if (!shapeChanged) {
    const isBizNode = (i: VNodeChild): i is VNode =>
      i !== null && i !== undefined && typeof i !== 'boolean' && typeof i !== 'string' && typeof i !== 'number' && !Array.isArray(i)
    const bizOld = oldCs.filter(isBizNode)
    const bizNew = newCs.filter(isBizNode)
    // **检测条件细化（误报根治）**：长度变化（[按钮, 按钮] → [按钮, 按钮,
    // 条件span]——静态组件列表 + 条件元素尾部——位置身份正确）→ **组件项
    // 序列变化**（新增/移除/替换组件项才是真实动态增删——序列含 key+类型）
    const compSeq = (cs: VNodeChild[]): string =>
      cs.filter((i) => typeof (i as VNode | null)?.type === 'function')
        .map((i) => String((i as VNode).key ?? '') + ':' + String((i as VNode).type))
        .join('|')
    if (compSeq(bizOld) !== compSeq(bizNew)) {
      detectMissingKey(bizNew, `children（组件序列 ${compSeq(bizOld)} → ${compSeq(bizNew)}）`)
    }
  }
  if (globalThis.__WF_DEBUG_MOVED__) console.log('[debug-dci] id=', id, 'oldKeys=', JSON.stringify(oldCs.map(keyOf)), 'newKeys=', JSON.stringify(newCs.map(keyOf)), 'lk=', listKind(oldCs), listKind(newCs))
  // 全 keyed：身份映射复用（增删/重排——状态跟随 key）
  if (listKind(newCs) === 'all-keyed' && listKind(oldCs) === 'all-keyed') {
    await diffKeyedChildren(oldCs, newCs, id, emit, emitCommand, ctx, registry)
    return
  }
  // **混合数组**（部分 key）：keyed 项身份复用（.k{key}）+ 无 key 项重建
  // （无 key = 位置身份——重建状态丢失——混合数组少见——A 级检测已引导）
  if (hasKeyed(newCs) || hasKeyed(oldCs)) {
    await diffKeyedChildren(oldCs, newCs, id, emit, emitCommand, ctx, registry)
    return
  }
  // 全 unkeyed：位置身份对照（混合数组——无 key 项位置接管）
  let lastRef: string | null = null
  const minLen = Math.min(oldCs.length, newCs.length)
  for (let i = 0; i < minLen; i++) {
    const oldC = oldCs[i] ?? null
    const newC = newCs[i] ?? null
    const cid = pathId(id, i)
    if (newC === null || newC === undefined) {
      // **占位（空洞保持——同构不变量）**：数组长度不变但该项为 null
      // （条件渲染元素/组件）——旧项移除（unmount/
      // remove）+ **占位锚**——childNodes 长度恒定（不塌缩）
      // null ↔ null：no-op（锚已在 DOM——保持——不重建）
      if (oldC !== null && oldC !== undefined && typeof oldC !== 'boolean') {
        await removeOldSlot(oldC, id, cid, emitCommand, registry)
        emitHole(emitCommand, cid, id, lastRef)
      }
    } else {
      await diffSlot(oldC, newC, id, i, lastRef, cid, emit, emitCommand, ctx, registry)
    }
    lastRef = cid
  }
  // 尾部新增（数组变长——新项渲染——位置身份追加）
  for (let i = oldCs.length; i < newCs.length; i++) {
    await emit(newCs[i], id, i, lastRef)
    lastRef = pathId(id, i)
  }
  // 尾部缩短（旧侧展开槽位多于新侧——**投影对齐——fuzz seed=2026 实证**：
  // FRAG 项声明 1 项但投影占 N 连续槽位——按数组长度比较会误删新侧 FRAG
  // 展开槽位（div > [FRAG > [42, span]]——oldCs.length=2 > newCs.length=1
  // ——误 remove 新侧展开的 span）——按展开槽位数比较——FRAG 项整体区间
  // 移除（removeVNodeTree）——**不发锚**——长度变化本身即同构）
  const oldSlots = oldCs.reduce((acc: number, c) => acc + slotCount(c), 0)
  const newSlots = newCs.reduce((acc: number, c) => acc + slotCount(c), 0)
  if (oldSlots > newSlots) {
    let remain = oldSlots - newSlots
    for (let i = oldCs.length - 1; i >= 0 && remain > 0; i--) {
      const slots = slotCount(oldCs[i]!)
      if (slots <= remain) {
        await removeOldSlot(oldCs[i]!, id, pathId(id, i), emitCommand, registry)
        remain -= slots
      }
    }
  }
}

/** 旧槽移除（unmount/remove——占位/尾部缩短共用） */
async function removeOldSlot(
  oldC: VNodeChild, parent: string, cid: string, emitCommand: (cmd: Command) => void,
  registry?: ComponentRegistry | null,
): Promise<void> {
  // **空洞项——占位锚节点必须移除（fuzz seed=7 实证——尾部缩短的 null 项
  //  return 导致锚残留——childNodes 长度不收敛——同构不变量破坏）**
  if (oldC === null || oldC === undefined || typeof oldC === 'boolean') {
    emitCommand({ op: 'remove', id: cid })
    return
  }
  // **统一区间移除（C2——元素/组件/FRAG 全形态——尾部缩短/空洞切换的
  //  子树组件实例残留实证——removeOldSlot 单锚只删元素——div 内组件实例
  //  root.1.0/root.1.1.0 残留——removeVNodeTree 完整：声明树递归 + 组件项
  //  unmount（keyed `${parent}.k{k}` 与渲染一致）+ 组件输出区间）**
  removeVNodeTree(oldC, cid, parent, emitCommand, registry)
}

// 槽位计数（投影维度——单一实现源——node/children.ts slotCount）

/** FRAG vnode 展开为槽位序列（**投影对齐——fuzz seed=2026 实证**）：
 *  声明维度（children 数组——FRAG 是 1 项）vs 投影维度（展开占 N 连续槽位）
 *  ——children 对照必须以展开槽位为单位（渲染 emit 同语义——槽位连续）——
 *  否则：主循环按数组项对照 FRAG（1 项）后——旧侧后续项与新侧 FRAG 展开
 *  槽位重叠——尾部缩短按数组长度/槽位数都无法正确对齐（误删/残留） */
function expandFrag(cs: VNodeChild[]): VNodeChild[] {
  const out: VNodeChild[] = []
  for (const c of cs) {
    if (c !== null && typeof c === 'object' && !Array.isArray(c) && isFragment(c as VNode)) {
      out.push(...expandFrag(childrenOf(c as VNode)))
    } else {
      out.push(c)
    }
  }
  return out
}

/** 单槽对照（unkeyed 位置身份——文本/插入/移除/同态递归/异类型转换） */
async function diffSlot(
  oldC: VNodeChild | null, newC: VNodeChild | null,
  parent: string, index: number, ref: string | null, cid: string,
  emit: RenderSink, emitCommand: (cmd: Command) => void,
  ctx: UIContext, registry: ComponentRegistry,
): Promise<void> {
  // 文本 ↔ 文本（**统一 kindOf 语义——单一规则源**）：string/number 交叉
  // （'x' ↔ 42——同 kind text——按精确类型分流导致四分支落空 +
  // transitionOf 对角 null → 静默 no-op——fuzz#79 实证——文本不更新）
  // ——textOf 统一字符串化——值变化才 setText（精准）
  if ((typeof oldC === 'string' || typeof oldC === 'number') && (typeof newC === 'string' || typeof newC === 'number')) {
    if (String(oldC) !== String(newC)) emitCommand({ op: 'setText', id: cid, value: String(newC) })
    return
  }
  // 旧位是空洞（锚）→ 锚移除 + 新侧渲染
  if (oldC === null || oldC === undefined || typeof oldC === 'boolean') {
    emitCommand({ op: 'remove', id: cid })
    await emit(newC, parent, index, ref)
    return
  }
  // 同态 → 递归对照（元素/组件/text 的精确增量）
  if (kindOf(oldC) === kindOf(newC) && typeof oldC !== 'string' && typeof oldC !== 'number') {
    await diffSame(oldC as VNode, newC as VNode, parent, index, ref, emit, emitCommand, ctx, registry)
    return
  }
  // 异类型转换（transform——**完整转换**：旧侧让位 + 新侧渲染——状态机统一）
  const t = transitionOf(stateOf(oldC), stateOf(newC))
  // **显式 Reject（P2——消灭隐式路径）**：t 为 null 且非同态——理论不可达
  // （同态已被前置拦截）——到达即状态机违例——显式报错（不再静默落空——
  //  fuzz#79 教训：diffSlot 四分支落空 + 对角 null = 静默 no-op）
  if (!t) throw new Error(`[vdom] 状态机违例：未定义转换 ${stateOf(oldC)} → ${stateOf(newC)}（diffSlot——必须显式迁移或显式 Reject）`)
  {
    await t(oldC, newC, {
      emit: emitCommand, emitNode: emit,
      oldId: cid, newId: cid, parent, index, ref,
      // 旧组件卸载（unmount——onUnmounts 清理——位置身份 compId = cid）
      oldCompId: typeof (oldC as VNode)?.type === 'function' ? cid : undefined,
      // 区间清理查 lastOutput（transitionComponent——G2）
      registry,
    })
  }
}

// ── keyed 列表策略（细节模块） ──

// ── keyed 列表策略（细节模块） ──
export function hasKeyed(items: VNodeChild[]): boolean {
  return items.some(isKeyed)
}

/** keyed 列表对照（身份映射——增删/重排状态跟随 key）
 *  **move 版**（2026-12）：复用项位置变化 → **move 命令**（DOM 不重建——
 *  节点移动 + 子树 id 重映射——焦点保持）；位置不变 → 组件输出对照（精准）；
 *  真移除 → unmount + remove；新增 → 新侧渲染 */
export async function diffKeyedChildren(
  oldCs: VNodeChild[], newCs: VNodeChild[], parent: string,
  emit: RenderSink, emitCommand: (cmd: Command) => void,
  ctx: UIContext, registry: ComponentRegistry,
): Promise<void> {
  // 旧 key → 旧索引（身份映射）
  const oldIdxByKey = new Map<string, number>()
  oldCs.forEach((c, i) => { const k = keyOf(c); if (k !== null) oldIdxByKey.set(k, i) })
  const newKeys = new Set(newCs.map((c) => keyOf(c)).filter((k): k is string => k !== null))

  // 0. **旧 unkeyed 项移除（真实 bug——Menubar 面板残留——引擎级修复，
  //    所有组件受益）**：混合数组（hasKeyed）——unkeyed 旧项（keyOf 返回
  //    null）——keyed 移除路径只查 oldIdxByKey（keyed）——unkeyed 旧项从未
  //    移除 → DOM 节点残留——**区间语义（fuzz#117/fuzz#214 实证）**：
  //    FRAG vnode 展开占多槽位（单锚 remove 残留展开项）；文本/空洞项
  //    （keyed 路径无尾部缩短循环——旧多于新的 unkeyed 项永远漏）——
  //    统一 removeVNodeTree（FRAG 展开/组件 unmount）+ 单槽位项直 remove
  for (let i = 0; i < oldCs.length; i++) {
    const oldC = oldCs[i]
    if (oldC === null || oldC === undefined || typeof oldC === 'boolean') {
      emitCommand({ op: 'remove', id: pathId(parent, i) }) // 空洞——占位锚节点——必须移除
      continue
    }
    if (typeof oldC === 'string' || typeof oldC === 'number') {
      emitCommand({ op: 'remove', id: pathId(parent, i) })
      continue
    }
    if (Array.isArray(oldC) || keyOf(oldC as VNode) !== null) continue // keyed/数组项——keyed 路径处理
    removeVNodeTree(oldC as VNode, pathId(parent, i), parent, emitCommand, registry)
  }

  // 1. **真移除**（不在新列表——**统一区间移除（C2——元素子树实例残留
  //    实证——span{k1} 内 FRAG 组件项 unmount 缺失——keyed 元素项移除只
  //    单锚——S_INST 面）**：removeVNodeTree 完整区间（组件项 unmount
  //    keyed compId `${parent}.k{k}`——与渲染规则一致）——keyed 组件项
  //    的实例由 removeVNodeTree 组件分支卸载）
  for (const [k, oldIdx] of oldIdxByKey) {
    if (!newKeys.has(k)) {
      removeVNodeTree(oldCs[oldIdx] as VNode, pathId(parent, oldIdx), parent, emitCommand, registry)
    }
  }

  // 2. **相对顺序检测**（keyed 重排的正确语义——move 的 id 覆盖事故根治）：
  //    - **相对顺序一致**（顺移——移除/插入导致的索引变化——DOM 位置自然
  //      到位——无需移动）→ remap-only（id 前缀迁移——节点复用）
  //    - **相对顺序变化**（交换/循环移位——move id 空间重叠）→ 整块重建
  //      （实例复用——状态保持）
  const keptOld: Array<string | null> = oldCs.map((c) => keyOf(c)).filter((k): k is string => k !== null && newKeys.has(k))
  // **顺序检测只比较新旧共有的 key**（新增/移除不参与——否则增项/删项
  // 被误判冲突重建——remove 全部 + 重建——非组件项引用丢失/焦点丢失——
  // diff 本质受损——真实 bug）
  const keptNew: Array<string | null> = newCs.map((c) => keyOf(c)).filter((k): k is string => k !== null && oldIdxByKey.has(k))
  let subseq = true
  {
    let p = 0
    for (const k of keptNew) {
      const idx = keptOld.indexOf(k, p)
      if (idx === -1) { subseq = false; break }
      p = idx + 1
    }
  }
  if (!subseq) {
    // **冲突重建**：remove 全部 + 按新序渲染（组件实例 .k{key} 复用——状态保持）
    for (const [k, oldIdx] of oldIdxByKey) {
      if (!newKeys.has(k)) emitCommand({ op: 'unmount', compId: `${parent}.k${k}` })
    }
    oldCs.forEach((c, i) => {
      if (c === null || c === undefined || typeof c === 'boolean') return
      if (typeof c === 'string' || typeof c === 'number') { emitCommand({ op: 'remove', id: pathId(parent, i) }); return }
      if (keyOf(c as VNode) !== null) { emitCommand({ op: 'remove', id: pathId(parent, i) }); return } // keyed 项——单槽位（保留实例——重建复用）
      removeVNodeTree(c as VNode, pathId(parent, i), parent, emitCommand, registry) // unkeyed 项——区间语义（FRAG/组件）
    })
    let r: string | null = null
    for (let i = 0; i < newCs.length; i++) {
      const newC = newCs[i]
      const k = keyOf(newC)
      if (k !== null && typeof (newC as VNode).type === 'function') {
        // **全量渲染（节点已删——无对照——sink = emit）**——组件实例
        // .k{key} 复用（状态保持）
        const keyedId = `${parent}.k${k}`
        const isNew = await renderComponent(newC as VNode, parent, i, r, keyedId, ctx, registry, emit, emitCommand)
        if (isNew) emitCommand({ op: 'mount', compId: keyedId })
      } else {
        await emit(newC, parent, i, r)
      }
      r = pathId(parent, i)
    }
    return
  }
  // 3. **顺移（相对顺序一致）**：remap-only（id 前缀迁移——节点复用——
  //    DOM 位置自然到位）+ 位置不变项对照 + 移除项 remove
  //    顺移项按新位置从前往后 remap（链式——每个 oldId 释放后复用——无覆盖）
  const moved: Array<{ oldIdx: number; newIdx: number }> = []
  newCs.forEach((newC, i) => {
    const k = keyOf(newC)
    if (k === null) return
    const oldIdx = oldIdxByKey.get(k)
    if (oldIdx !== undefined && oldIdx !== i) moved.push({ oldIdx, newIdx: i })
  })
  moved.sort((a, b) => b.newIdx - a.newIdx)
  if (globalThis.__WF_DEBUG_MOVED__) console.log('[debug-moved] subseq=1 moved=', JSON.stringify(moved), 'oldIdxByKey=', JSON.stringify([...oldIdxByKey.entries()]), 'newKeys=', JSON.stringify([...newKeys]), 'parent=', parent)
  for (const m of moved) {
    emitCommand({ op: 'move', id: pathId(parent, m.oldIdx), parent, ref: null, newId: pathId(parent, m.newIdx), noMove: true })
  }
  // 顺移模式：位置变化项只对照（节点已 remap——id 新）——不移动
  const isShift = true
  let lastRef: string | null = null
  for (let i = 0; i < newCs.length; i++) {
    const newC = newCs[i]
    const k = keyOf(newC)
    const cid = pathId(parent, i)
    if (k !== null) {
      const oldIdx = oldIdxByKey.get(k)
      if (oldIdx === undefined) {
        // 新增项——新侧渲染（新实例——mount 指令）
        await emitWithKey(newC, parent, i, lastRef, k, emit, emitCommand, ctx, registry)
      } else if (typeof (newC as VNode).type === 'function') {
        // **组件项——emitWithKey（keyedId `.k{key}`——位置无关——实例复用——
        //  lastOutput 对照——精准增量）**
        await emitWithKey(newC, parent, i, lastRef, k, emit, emitCommand, ctx, registry)
      } else {
        // **原生 keyed 项（旧存在——位置不变/顺移——noMove remap 后 id 已
        //   更新）——精准对照（diffSame——属性变化走 diffAttrs——disabled
        //   移除等——**非重建**——真实 bug：keyed 按钮 disabled 残留——
        //   emit 幂等 create 只应用新 attrs——旧属性（disabled）残留）**
        await diffSame(oldCs[oldIdx] as VNode, newC as VNode, parent, i, lastRef, emit, emitCommand, ctx, registry)
      }
    } else {
      // 无 key 项（混合数组）——重建
      await emit(newC, parent, i, lastRef)
    }
    lastRef = cid
  }
}

/** keyed 项渲染（compId = 位置路径 + .k{key}——身份稳定——增删/重排复用）
 *  组件输出对照（lastOutput → diffSame 精准——move 后节点已在新位置） */
export async function emitWithKey(
  v: VNodeChild, parent: string, index: number, ref: string | null, key: string,
  emit: RenderSink, emitCommand: (cmd: Command) => void, ctx: UIContext, registry: ComponentRegistry,
): Promise<void> {
  const vn = v as VNode
  if (typeof vn.type === 'function') {
    // 组件：keyed compId（`{parent}.k{key}`——**位置无关**——增删/重排复用）
    const keyedId = `${parent}.k${key}`
    const rec = registry.get(keyedId)
    // **方案 3：lastOutput 是 CompOutput——转回裸输出对照（undefined 保持）**
    const oldOut = rec?.lastOutput === undefined ? undefined : outputToChild(rec.lastOutput)
    const isNew = await renderComponent(vn, parent, index, ref, keyedId, ctx, registry, async (out, p, i, r) => {
      const outId = pathId(p, i)
      // 输出级空值转换（x => null——占位锚替换——同构保持）
      if (out === null || out === undefined) {
        if (oldOut !== undefined && oldOut !== null) {
          const t = transitionOf(stateOf(oldOut), 'hole')
          if (!t) throw new Error(`[vdom] 状态机违例：未定义转换 ${stateOf(oldOut)} → hole（keyed 组件输出收缩——P2）`)
          await t(oldOut, out, { emit: emitCommand, emitNode: emit, oldId: outId, newId: outId, parent: p, index: i, ref: r, registry })
        } else if (oldOut === undefined) {
          // **新实例首帧输出 null——占位锚**（同构保持——build 路径由
          // emit 分发器 hole case 建锚——此处内联 sink 必须等价——真实 bug）
          emitHole(emitCommand, outId, p, r)
        }
        return
      }
      if (oldOut === null) {
        const t = transitionOf('hole', stateOf(out))
        if (!t) throw new Error(`[vdom] 状态机违例：未定义转换 hole → ${stateOf(out)}（keyed 组件输出展开——P2）`)
        await t(null, out, { emit: emitCommand, emitNode: emit, oldId: outId, newId: outId, parent: p, index: i, ref: r, registry })
        return
      }
      if (oldOut !== undefined && !Array.isArray(oldOut) && !Array.isArray(out)) {
        // 上次输出对照（同实例——精准增量）
        await diffSame(oldOut as VNode, out as VNode, p, i, r, emit, emitCommand, ctx, registry)
      } else {
        await emit(out, p, i, r)
      }
    }, emitCommand)
    // **mount 指令（新实例——初始化完成）**
    if (isNew) emitCommand({ op: 'mount', compId: keyedId })
    return
  }
  await emit(v, parent, index, ref)
}
