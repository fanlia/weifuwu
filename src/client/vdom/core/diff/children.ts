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
import { childrenOf } from '../node/children.ts'
import { kindOf } from '../node/index.ts'
import { stateOf } from '../transform/states.ts'
import { transitionOf } from '../transform/table.ts'
import { listKind, planKeyedDiff, keyOf, detectMissingKey, isKeyed } from '../node/keyed.ts'
import { isPortal } from '../node/portal.ts'
import { pathId } from '../node/native.ts'
import { emitHole } from '../node/hole.ts'
import { renderComponent, type ComponentRegistry } from '../node/component.ts'
import type { Command } from '../command/index.ts'
import type { RenderSink } from '../build.ts'
import type { UIContext } from '../../context/UIContext.ts'
import { diffSame } from './same.ts'




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
 *  组件数组输出（隐式 Fragment）同用——portal 关闭 → removePortal 清理） */
export async function diffChildrenItems(
  oldCs: VNodeChild[], newCs: VNodeChild[],
  id: string,
  emit: RenderSink, emitCommand: (cmd: Command) => void,
  ctx: UIContext, registry: ComponentRegistry,
  shapeChanged = false,
): Promise<void> {
  // A 级检测（长度变化 + 无 key 组件项 → warn 引导声明 key——
  // 无 key = 位置身份——长度变化时有状态组件位置继承漂移——
  // **豁免**：① 数组 ↔ 单节点形态转换（shapeChanged——非列表增删）
  // ② portal 槽（[children, popup.portal()]——浮层插槽是框架管理的切换
  // 槽而非业务列表——排除 portal 项的业务子项长度比较——Popconfirm 等
  // 打开 1→2 误报）
  if (!shapeChanged) {
    const isBizNode = (i: VNodeChild): i is VNode =>
      i !== null && i !== undefined && typeof i !== 'boolean' && typeof i !== 'string' && typeof i !== 'number' && !Array.isArray(i) && !isPortal(i)
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
      // （条件渲染元素/组件/浮层关闭）——旧项移除（unmount/removePortal/
      // remove）+ **占位锚**——childNodes 长度恒定（不塌缩）
      // null ↔ null：no-op（锚已在 DOM——保持——不重建）
      if (oldC !== null && oldC !== undefined && typeof oldC !== 'boolean') {
        await removeOldSlot(oldC, id, cid, emitCommand)
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
  // 尾部缩短（数组变短——remove——**不发锚**——数组长度变化本身即同构）
  for (let i = newCs.length; i < oldCs.length; i++) {
    await removeOldSlot(oldCs[i]!, id, pathId(id, i), emitCommand)
  }
}

/** 旧槽移除（unmount/removePortal/remove——占位/尾部缩短共用） */
async function removeOldSlot(
  oldC: VNodeChild, parent: string, cid: string, emitCommand: (cmd: Command) => void,
): Promise<void> {
  if (oldC === null || oldC === undefined || typeof oldC === 'boolean') return
  const oldVn = oldC as VNode | null
  if (oldVn && typeof oldVn.type === 'function') {
    const compId = oldVn.key !== null ? `${parent}.k${oldVn.key}` : cid
    emitCommand({ op: 'unmount', compId })
  }
  if (oldVn && isPortal(oldVn)) {
    emitCommand({ op: 'removePortal', key: oldVn.key ?? 'default' })
  }
  emitCommand({ op: 'remove', id: cid })
}

/** 单槽对照（unkeyed 位置身份——文本/插入/移除/同态递归/异类型转换） */
async function diffSlot(
  oldC: VNodeChild | null, newC: VNodeChild | null,
  parent: string, index: number, ref: string | null, cid: string,
  emit: RenderSink, emitCommand: (cmd: Command) => void,
  ctx: UIContext, registry: ComponentRegistry,
): Promise<void> {
  // 文本 ↔ 文本：值变化才 setText（精准——无变化不发命令）
  if (typeof oldC === 'string' && typeof newC === 'string') {
    if (oldC !== newC) emitCommand({ op: 'setText', id: cid, value: newC })
    return
  }
  if (typeof oldC === 'number' && typeof newC === 'number') {
    if (oldC !== newC) emitCommand({ op: 'setText', id: cid, value: String(newC) })
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
  if (t) {
    await t(oldC, newC, {
      emit: emitCommand, emitNode: emit,
      oldId: cid, newId: cid, parent, index, ref,
      // 旧组件卸载（unmount——onUnmounts 清理——位置身份 compId = cid）
      oldCompId: typeof (oldC as VNode)?.type === 'function' ? cid : undefined,
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
  //    所有组件受益）**：混合数组（hasKeyed——portal 插槽场景——浮层开关）
  //    ——unkeyed 旧项（keyOf 返回 null——含 portal——portal 内部 key 不
  //    算用户 keyed 是设计）——keyed 移除路径只查 oldIdxByKey（keyed）——
  //    unkeyed 旧项从未移除 → portal 容器/DOM 节点残留（Escape/外部点击
  //    关闭浮层后面板永远显示——aria-expanded false 但 DOM 还在）——
  //    按旧索引移除（isPortal → removePortal——与 unkeyed removeOldSlot
  //    对齐）——remove 按 id（顺序无关——keyed remap 同样按 id——安全）
  for (let i = 0; i < oldCs.length; i++) {
    const oldC = oldCs[i]
    if (oldC === null || oldC === undefined || typeof oldC === 'boolean') continue
    if (typeof oldC !== 'object') continue
    const oldVn = oldC as VNode
    if (keyOf(oldVn) !== null) continue // keyed 项——keyed 路径处理
    if (isPortal(oldVn)) {
      emitCommand({ op: 'removePortal', key: oldVn.key ?? 'default' })
    }
    emitCommand({ op: 'remove', id: pathId(parent, i) })
  }

  // 1. **真移除**（不在新列表——unmount（组件）+ removePortal（portal 容器）
  //    + remove——keyed 项——与 unkeyed 对齐）
  for (const [k, oldIdx] of oldIdxByKey) {
    if (!newKeys.has(k)) {
      const oldVn = oldCs[oldIdx] as VNode
      if (typeof oldVn.type === 'function') {
        emitCommand({ op: 'unmount', compId: `${parent}.k${k}` })
      }
      if (isPortal(oldVn)) {
        emitCommand({ op: 'removePortal', key: oldVn.key ?? 'default' })
      }
      emitCommand({ op: 'remove', id: pathId(parent, oldIdx) })
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
      const oldVn = c as VNode | null
      if (oldVn && isPortal(oldVn)) emitCommand({ op: 'removePortal', key: oldVn.key ?? 'default' })
      emitCommand({ op: 'remove', id: pathId(parent, i) })
    })
    let r: string | null = null
    for (let i = 0; i < newCs.length; i++) {
      const newC = newCs[i]
      const k = keyOf(newC)
      if (k !== null && typeof (newC as VNode).type === 'function') {
        // **全量渲染（节点已删——无对照——sink = emit）**——组件实例
        // .k{key} 复用（状态保持）
        const keyedId = `${parent}.k${k}`
        const isNew = await renderComponent(newC as VNode, parent, i, r, keyedId, ctx, registry, emit)
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
    const oldOut = rec?.lastOutput
    const isNew = await renderComponent(vn, parent, index, ref, keyedId, ctx, registry, async (out, p, i, r) => {
      const outId = pathId(p, i)
      // 输出级空值转换（x => null——占位锚替换——同构保持）
      if (out === null || out === undefined) {
        if (oldOut !== undefined && oldOut !== null) {
          const t = transitionOf(stateOf(oldOut), 'hole')
          if (t) await t(oldOut, out, { emit: emitCommand, emitNode: emit, oldId: outId, newId: outId, parent: p, index: i, ref: r })
        } else if (oldOut === undefined) {
          // **新实例首帧输出 null——占位锚**（同构保持——build 路径由
          // emit 分发器 hole case 建锚——此处内联 sink 必须等价——真实 bug）
          emitHole(emitCommand, outId, p, r)
        }
        return
      }
      if (oldOut === null) {
        const t = transitionOf('hole', stateOf(out))
        if (t) await t(null, out, { emit: emitCommand, emitNode: emit, oldId: outId, newId: outId, parent: p, index: i, ref: r })
        return
      }
      if (oldOut !== undefined && !Array.isArray(oldOut) && !Array.isArray(out)) {
        // 上次输出对照（同实例——精准增量）
        await diffSame(oldOut as VNode, out as VNode, p, i, r, emit, emitCommand, ctx, registry)
      } else {
        await emit(out, p, i, r)
      }
    })
    // **mount 指令（新实例——初始化完成）**
    if (isNew) emitCommand({ op: 'mount', compId: keyedId })
    return
  }
  await emit(v, parent, index, ref)
}
