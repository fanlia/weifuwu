/**
 * vdom v2 — diff（对照流——流段复用——「复用失败」根治）
 *
 * VDOM-V2-BLUEPRINT 阶段 1b：
 * - **组件实例 = 流段（Segment）**——复用 = 流段查询 + renderFn 重调——
 *   工厂不重跑（v1 的 rec 查找被流段语义替代——**查找单一实现源**）
 * - **统一递归对照**：diffV2Node 覆盖一切（元素/文本/空洞/组件输出对照——
 *   v1 的 output.ts 特判收敛到同一算子——**无「组件输出对照」独立函数**）
 * - 叶逻辑借用 v1（diffAttrs/transitionOf——纯数据转换——移植边界）
 * - 阶段 1b 范围：元素更新/text/hole/组件复用/组件输出变化——**keyed
 *   列表移动语义下一迭代**（登记）
 */
import type { VNode, VNodeChild } from '../vnode.ts'
import type { Component, RenderFn } from '../vnode.ts'
import type { Command } from '../command/index.ts'
import type { UIContext } from '../../context/UIContext.ts'
import { pathId } from '../node/native.ts'
import { keyedId } from '../node/keyed.ts'
import { childrenOf, slotCount } from '../node/children.ts'
import { keyOf } from '../node/keyed.ts'
import { kindOf, textOf } from '../node/index.ts'
import { stateOf } from '../transform/states.ts'
import { diffAttrs } from '../diff/attrs.ts'
import { transitionOf } from '../transform/table.ts'
import { Observable, create, Subject } from '../../observable/index.ts'
import { createUi } from '../../hooks/env.ts'
import type { OperatorFn } from '../../observable/index.ts'
import { renderV2Node, fromArray, concatObs } from './render.ts'

/** v2 组件流段（实例复用载体——**工厂执行一次——后续复用**） */
export interface Segment {
  factory: Component
  renderFn: RenderFn
  onUnmounts: (() => void)[]
  lastOutput: VNodeChild | undefined
  hookSeq: { n: number }
  instData: Map<unknown, unknown>
  /** **destroy$（2027-08——段级卸载信号——单信号全停）**：卸载时 next——
   *  订阅者（hooks 清理）自动停止——v1 onUnmounts 数组的流化 */
  destroy$: import('../../observable/index.ts').Subject<void>
  disposed: boolean
}

export type SegmentMap = Map<string, Segment>

/** 创建段（mount——工厂执行——hooks 环境已注入 ctx.ui） */
export function createSegment(
  factory: Component,
  props: Record<string, unknown>,
  ctx: UIContext,
  compId: string,
  requestSegmentRender?: () => void,
): Segment {
  const onUnmounts: (() => void)[] = []
  const instData = new Map<unknown, unknown>()
  const hookSeq = { n: 0 }
  const hookStates = new Map<number, unknown>()
  const instCtx = Object.create(ctx) as UIContext
  instCtx.onUnmount = (fn: () => void) => { onUnmounts.push(fn) }
  // **段级 hooks 面（2027-08——v2 完整性）**：createUi（真实的 hooks env——
  // 订阅/退订/重渲染 per 段——v1 实例级 hooks 的 v2 段等价）
  instCtx.ui = createUi({
    requestRender: () => { requestSegmentRender?.() },
    onUnmount: (fn: () => void) => { onUnmounts.push(fn) },
    getBrowser: () => (ctx as { browser?: import("../../browser/Browser.ts").Browser }).browser ?? null,
    nextHookIndex: () => hookSeq.n++,
    getHookState: <T>(idx: number) => hookStates.get(idx) as T | undefined,
    setHookState: (idx: number, v: unknown) => { hookStates.set(idx, v) },
    getInstanceData: () => instData,
    scheduleAfterRender: (fn: () => void) => { (ctx as { afterRender?: (f: () => void) => void }).afterRender?.(fn) },
    getSharedContext: () => ctx ?? null,
  })
  const renderFn = factory(props, instCtx) as RenderFn
  return { factory, renderFn, onUnmounts, lastOutput: undefined, hookSeq, instData, destroy$: new Subject<void>(), disposed: false }
}

/** 段销毁（unmount——destroy$ 信号 + onUnmounts 逆序）——**单信号全停** */
export function disposeSegment(id: string, segments: SegmentMap): void {
  const seg = segments.get(id)
  if (!seg || seg.disposed) return
  seg.disposed = true
  // destroy$ 信号（订阅者清理——takeUntil 语义）
  try { seg.destroy$.next() } catch (e) { console.error('[vdom] v2 destroy$:', e) }
  for (const fn of [...seg.onUnmounts].reverse()) { try { fn() } catch (e) { console.error('[vdom] v2 onUnmount:', e) } }
  segments.delete(id)
}

/** 节点对照（old vs new——流式增量命令） */
export function diffV2Node(
  oldC: VNodeChild,
  newC: VNodeChild,
  parent: string,
  index: number,
  ref: string | null,
  ctx: UIContext,
  segments: SegmentMap,
  registry: import('../node/component.ts').ComponentRegistry,
): Observable<Command> {
  const id = pathId(parent, index)
  const ok = kindOf(oldC)
  const nk = kindOf(newC)
  // 文本 → setText（值变化才发）
  if (ok === 'text' && nk === 'text') {
    return String(oldC) === String(newC) ? fromArray([]) : fromArray([{ op: 'setText', id, value: textOf(newC)! } as Command])
  }
  // 空洞保持 → 无命令
  if (ok === 'hole' && nk === 'hole') return fromArray([])
  // 旧空洞 → 新节点（渲染——**先 remove 旧锚**——v1 对齐）
  if (ok === 'hole') {
    return concatObs([fromArray([{ op: 'remove', id } as Command]), renderV2Node(newC, parent, index, ref, ctx, registry)])
  }
  // 新空洞 → 旧侧让位（**复合旧侧（组件/Fragment/元素）→ 转换——完整
  // 卸载（unmount + 输出区间清理 + 锚替）——非简单移除**——v1 语义对齐）
  if (nk === 'hole') {
    // **所有非空洞旧侧 → 转换**（text/元素/组件/Fragment——完整转换：
    // 旧侧让位 + 锚创建——不是单 remove——v1 语义对齐）
    return transformV2(oldC, newC, parent, index, ref, ctx, registry, ok === 'component' ? v2CompId(oldC as VNode, parent, index) : undefined)
  }
  // 同态 → 递归对照
  if (ok === nk && typeof oldC !== 'string' && typeof oldC !== 'number') {
    const o = oldC as VNode
    const n = newC as VNode
    // 组件 → 组件（同 type：流段复用——核心；不同 type：替换）
    if (typeof o.type === 'function' && typeof n.type === 'function') {
      if (o.type === n.type) {
        return diffComponentV2(o, n, parent, index, ref, ctx, segments, registry)
      }
      // 异 type 组件 → 转换表（component → 新形态——完整转换）
      return transformV2(o, n, parent, index, ref, ctx, registry, v2CompId(o, parent, index))
    }
    // 元素 → 元素（同 tag：attrs + children 递归；异 tag：替换）
    if (typeof o.type === 'string' && typeof n.type === 'string') {
      if (o.type === n.type) {
        const attrCmds: Command[] = []
        diffAttrs(o, n, id, (cmd) => attrCmds.push(cmd as Command))
        const oldCs = childrenOf(o)
        const cs = childrenOf(n)
        // **keyed 检测**：任一侧含 keyed 项 → keyed 列表对照（merge 语义）
        if (hasKeyedId(cs) || hasKeyedId(oldCs)) {
          return concatObs([fromArray(attrCmds), diffKeyedV2(oldCs, cs, id, ctx, segments, registry)])
        }
        let slot = 0
        let lastRef: string | null = null
        const parts: Array<Observable<Command>> = []
        for (let i = 0; i < cs.length; i++) {
          const sc = slotCount(cs[i])
          parts.push(diffV2Node(oldCs[i], cs[i], id, slot, lastRef, ctx, segments, registry))
          lastRef = pathId(id, slot + sc - 1)
          slot += sc
        }
        // 旧侧多余项移除
        for (let i = cs.length; i < oldCs.length; i++) {
          parts.push(fromArray([{ op: 'remove', id: pathId(id, slotOf(oldCs, i)) } as Command]))
        }
        return concatObs([fromArray(attrCmds), ...parts])
      }
      // 异 tag：重建（v1 diffSame 语义——**完整区间移除**（removeVNodeTree
      // 等价——子树全部 remove）+ 新侧渲染——**非转换表**（element→element
      // 同态——转换表无定义））
      return concatObs([
        fromArray(removeTreeV2(o, parent, index)),
        renderV2Node(n, parent, index, ref, ctx, registry),
      ])
    }
  }
  // **异态（6×6 转换表——v1 状态机语义单源）**：完整转换（旧侧让位 +
  // 新侧渲染——组件转换含 unmount + 输出区间清理——不是单 remove+render）
  const oState = stateOf(oldC)
  const nState = stateOf(newC)
  const oldCompIdV2 = kindOf(oldC) === 'component'
    ? v2CompId(oldC as VNode, parent, index)
    : undefined
  return transformV2(oldC, newC, parent, index, ref, ctx, registry, oldCompIdV2)
}

function slotOf(oldCs: VNodeChild[], i: number): number {
  let s = 0
  for (let j = 0; j < i; j++) s += slotCount(oldCs[j])
  return s
}

/** 组件对照（流段复用——工厂不重跑——输出对照 = 同一算子递归） */
function diffComponentV2(
  oldV: VNode,
  newV: VNode,
  parent: string,
  index: number,
  ref: string | null,
  ctx: UIContext,
  segments: SegmentMap,
  registry: import('../node/component.ts').ComponentRegistry,
): Observable<Command> {
  const compId = v2CompId(newV, parent, index)
  const seg = segments.get(compId)
  if (!seg) {
    // 首见（同位置 type 相同但无段——上一轮挂载失败/泄漏 → 重挂载）
    return renderV2Node(newV, parent, index, ref, ctx, registry)
  }
  // **复用：renderFn 重调（props 最新）——工厂不重跑**——输出对照（同一
  // 算子——旧输出 vs 新输出——组件输出特判收敛）
  let newOut: VNodeChild
  try {
    newOut = seg.renderFn(newV.props)
  } catch (e) {
    console.error('[vdom] v2 renderFn 错误:', e)
    return fromArray([])
  }
  const oldOut = seg.lastOutput
  seg.lastOutput = newOut
  if (oldOut === undefined) {
    // 首次输出（段建后第一次渲染输出）——渲染
    return renderV2Node(newOut, compId, 0, ref, ctx, registry)
  }
  return diffV2NodeAt(oldOut, newOut, compId, ref, ctx, segments, registry)
}

/** 组件输出的槽位对照（输出在 compId 子空间——index 0 起） */
function diffV2NodeAt(
  oldOut: VNodeChild,
  newOut: VNodeChild,
  base: string,
  ref: string | null,
  ctx: UIContext,
  segments: SegmentMap,
  registry: import('../node/component.ts').ComponentRegistry,
): Observable<Command> {
  // 输出形态（vnode/hole/array——判别联合）
  const oa = Array.isArray(oldOut)
  const na = Array.isArray(newOut)
  if (oa || na) {
    const oldArr = oa ? (oldOut as VNodeChild[]) : [oldOut]
    const newArr = na ? (newOut as VNodeChild[]) : [newOut]
    let slot = 0
    let lastRef: string | null = null
    const parts: Array<Observable<Command>> = []
    for (let i = 0; i < newArr.length; i++) {
      const sc = slotCount(newArr[i])
      parts.push(diffV2Node(oldArr[i], newArr[i], base, slot, lastRef, ctx, segments, registry))
      lastRef = pathId(base, slot + sc - 1)
      slot += sc
    }
    for (let i = newArr.length; i < oldArr.length; i++) {
      parts.push(fromArray([{ op: 'remove', id: pathId(base, slotOf(oldArr, i)) } as Command]))
    }
    return concatObs(parts)
  }
  return diffV2Node(oldOut, newOut, base, 0, ref, ctx, segments, registry)
}

/** 组件 id（keyedId/pathId——单一点——v1 双实现收敛） */
export function v2CompId(vn: VNode, parent: string, index: number): string {
  return vn.key !== null ? keyedId(parent, vn.key) : pathId(parent, index)
}

/** 根对照（v2 diff——diffStream 的 Observable 等价） */
export function diffV2(
  oldTree: VNode,
  newTree: VNode,
  ctx: UIContext,
  segments: SegmentMap,
  registry: import('../node/component.ts').ComponentRegistry,
): Observable<Command> {
  const oState = stateOf(oldTree)
  const nState = stateOf(newTree)
  const t = transitionOf(oState, nState)
  if (t) {
    // 异态根（组件↔元素等）——借用 v1 转换的语义（emit 命令收集）
    return fromArray([]) // 阶段 1b：根异态简化（登记——root 转换场景）
  }
  return diffV2Node(oldTree, newTree, 'root', 0, null, ctx, segments, registry)
    .pipe(appendDone) as Observable<Command>
}

const appendDone: OperatorFn<Command, Command> = (source) =>
  concatObs([source as Observable<Command>, fromArray([{ op: 'done' } as Command])])

// ── keyed 列表 merge（v1 diffKeyedChildren 的流式等价）─────────────

/** 列表项对照（keyed 感知：key 映射取旧——非位置） */
function diffListItemV2(
  oldC: VNodeChild,
  newC: VNodeChild,
  parent: string,
  index: number,
  ref: string | null,
  ctx: UIContext,
  segments: SegmentMap,
  registry: import('../node/component.ts').ComponentRegistry,
): Observable<Command> {
  if (oldC === undefined) return renderV2Node(newC, parent, index, ref, ctx, registry)
  return diffV2Node(oldC, newC, parent, index, ref, ctx, segments, registry)
}

/** keyed 列表对照（流式——顺移 move / 冲突重建 / key 映射对照——v1 语义等价） */
export function diffKeyedV2(
  oldCs: VNodeChild[],
  newCs: VNodeChild[],
  parent: string,
  ctx: UIContext,
  segments: SegmentMap,
  registry: import('../node/component.ts').ComponentRegistry,
): Observable<Command> {
  const cmds: Command[] = []
  // 旧 key → 旧索引（首现优先——与 v1 单一规则源）
  const oldIdxByKey = new Map<string, number>()
  oldCs.forEach((c, i) => { const k = keyOf(c); if (k !== null && !oldIdxByKey.has(k)) oldIdxByKey.set(k, i) })
  const newKeys = new Set(newCs.map((c) => keyOf(c)).filter((k): k is string => k !== null))

  // 0. 旧侧清理（空洞/文本/unkeyed 项/重复 key 多余项——区间 remove）
  const keyCount = new Map<string, number>()
  for (let i = 0; i < oldCs.length; i++) {
    const oldC = oldCs[i]
    if (oldC === null || oldC === undefined || typeof oldC === 'boolean' || oldC === '') { cmds.push({ op: 'remove', id: pathId(parent, i) } as Command); continue }
    if (typeof oldC === 'string' || typeof oldC === 'number') { cmds.push({ op: 'remove', id: pathId(parent, i) } as Command); continue }
    if (Array.isArray(oldC)) continue
    const k = keyOf(oldC as VNode)
    if (k !== null) {
      const n = (keyCount.get(k) ?? 0) + 1
      keyCount.set(k, n)
      if (n === 1) continue
      cmds.push(...removeTreeV2(oldC as VNode, parent, i))
      continue
    }
    cmds.push(...removeTreeV2(oldC as VNode, parent, i))
  }

  // 1. 真移除（key 不在新——**完整区间** + **段销毁（destroy$）**）
  for (const [k, oldIdx] of oldIdxByKey) {
    if (!newKeys.has(k)) {
      cmds.push(...removeTreeV2(oldCs[oldIdx] as VNode, parent, oldIdx))
      const kid = keyedId(parent, k)
      if (segments.has(kid)) disposeSegment(kid, segments) // 卸载信号——资源清理
    }
  }

  // 2. 相对顺序检测（共有 key 的子序列）
  const keptOld = oldCs.map((c) => keyOf(c)).filter((k): k is string => k !== null && newKeys.has(k))
  const keptNew = newCs.map((c) => keyOf(c)).filter((k): k is string => k !== null && oldIdxByKey.has(k))
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
    // 冲突重建：remove 全部 + 按新序渲染（组件段复用——状态保持）
    oldCs.forEach((c, i) => {
      if (typeof c === 'string' || typeof c === 'number' || c === null || c === undefined || typeof c === 'boolean') return
      if (Array.isArray(c)) return
      // **keyed 项单 remove（v1 对齐——重建路径节点随后 create——非区间**——
      // 子树由 create 重建；非 keyed 项完整区间）
      if (keyOf(c as VNode) !== null) { cmds.push({ op: 'remove', id: pathId(parent, i) } as Command); return }
      cmds.push(...removeTreeV2(c as VNode, parent, i))
    })
    const rebuildParts: Array<Observable<Command>> = []
    let r: string | null = null
    for (let i = 0; i < newCs.length; i++) {
      const newC = newCs[i]
      const k = keyOf(newC)
      const kid = k !== null ? keyedId(parent, k) : pathId(parent, i)
      if (k !== null && typeof (newC as VNode).type === 'function') {
        // keyed 组件项——段复用（kid）
        rebuildParts.push(diffComponentAtV2(newC as VNode, kid, parent, i, r, ctx, segments, registry))
      } else {
        rebuildParts.push(renderV2Node(newC, parent, i, r, ctx, registry))
      }
      r = pathId(parent, i)
    }
    return concatObs([fromArray(cmds), ...rebuildParts])
  }

  // 3. 顺移：move 命令（remap——方向排序 v1 同） + 逐项对照（key 映射取旧）
  const moved: Array<{ oldIdx: number; newIdx: number }> = []
  newCs.forEach((newC, i) => {
    const k = keyOf(newC)
    if (k === null) return
    const oldIdx = oldIdxByKey.get(k)
    if (oldIdx !== undefined && oldIdx !== i) moved.push({ oldIdx, newIdx: i })
  })
  const allLeft = moved.every((m) => m.newIdx < m.oldIdx)
  moved.sort((a, b) => (allLeft ? a.newIdx - b.newIdx : b.newIdx - a.newIdx))
  for (const m of moved) {
    cmds.push({ op: 'move', id: pathId(parent, m.oldIdx), parent, ref: null, newId: pathId(parent, m.newIdx), noMove: true } as Command)
  }
  const parts: Array<Observable<Command>> = []
  let lastRef: string | null = null
  for (let i = 0; i < newCs.length; i++) {
    const newC = newCs[i]
    const k = keyOf(newC)
    const cid = pathId(parent, i)
    if (k !== null) {
      const oldIdx = oldIdxByKey.get(k)
      if (oldIdx === undefined) {
        parts.push(renderV2Node(newC, parent, i, lastRef, ctx, registry))
      } else if (typeof (newC as VNode).type === 'function') {
        parts.push(diffListItemV2(oldCs[oldIdx], newC, parent, i, lastRef, ctx, segments, registry))
      } else {
        parts.push(diffV2Node(oldCs[oldIdx], newC, parent, i, lastRef, ctx, segments, registry))
      }
    } else {
      parts.push(renderV2Node(newC, parent, i, lastRef, ctx, registry))
    }
    lastRef = cid
  }
  return concatObs([fromArray(cmds), ...parts])
}

/** keyed 组件项对照（kid 段复用——kid≠槽位 id） */
function diffComponentAtV2(
  vn: VNode,
  kid: string,
  parent: string,
  index: number,
  ref: string | null,
  ctx: UIContext,
  segments: SegmentMap,
  registry: import('../node/component.ts').ComponentRegistry,
): Observable<Command> {
  const seg = segments.get(kid)
  if (!seg) return renderV2Node(vn, parent, index, ref, ctx, registry)
  let newOut: VNodeChild
  try {
    newOut = seg.renderFn(vn.props)
  } catch (e) {
    console.error('[vdom] v2 renderFn 错误:', e)
    return fromArray([])
  }
  const oldOut = seg.lastOutput
  seg.lastOutput = newOut
  if (oldOut === undefined) return renderV2Node(newOut, kid, 0, ref, ctx, registry)
  return diffV2NodeAt(oldOut, newOut, kid, ref, ctx, segments, registry)
}

/** 完整区间移除（v1 removeVNodeTree 等价——子树全部节点 remove——先子后父） */
export function removeTreeV2(v: VNodeChild, parent: string, index: number): Command[] {
  const cmds: Command[] = []
  const id = pathId(parent, index)
  if (v === null || v === undefined || typeof v === 'boolean' || v === '') { cmds.push({ op: 'remove', id } as Command); return cmds }
  if (typeof v === 'string' || typeof v === 'number') { cmds.push({ op: 'remove', id } as Command); return cmds }
  if (Array.isArray(v)) {
    let slot = 0
    for (const c of v) { cmds.push(...removeTreeV2(c, parent, slot)); slot += slotCount(c) }
    return cmds
  }
  const vn = v as VNode
  const cs = childrenOf(vn)
  let slot = 0
  for (const c of cs) { cmds.push(...removeTreeV2(c, id, slot)); slot += slotCount(c) }
  cmds.push({ op: 'remove', id } as Command)
  return cmds
}

/** 列表含 keyed 项检测（v2——keyOf 桥） */
export function hasKeyedId(items: VNodeChild[]): boolean {
  return items.some((c) => keyOf(c) !== null)
}

// ── transform 6×6（v1 状态机语义——转换表共享——流式适配）──────────

/**
 * v2 转换（异态——v1 transitionOf 表语义单源——流式适配）
 * - 同步收集 v1 transition 的命令（emit）+ emitNode = renderV2Node 流
 * - **完整转换**（旧侧让位 + 新侧渲染——不是单 remove+render——v1 语义对齐：
 *   组件转换含 unmount + 输出区间清理；空洞→组件 replaceChild 语义）
 */
export function transformV2(
  oldC: VNodeChild,
  newC: VNodeChild,
  parent: string,
  index: number,
  ref: string | null,
  ctx: UIContext,
  registry: import('../node/component.ts').ComponentRegistry,
  oldCompId?: string,
): Observable<Command> {
  const t = transitionOf(stateOf(oldC), stateOf(newC))
  if (!t) {
    // **显式 Reject（P2——消灭隐式路径）**：同态已被 diffV2Node 拦截——
    // 到达即状态机违例（fuzz#79 教训：静默落空）
    throw new Error(`[vdom] v2 状态机违例：未定义转换 ${stateOf(oldC)} → ${stateOf(newC)}`)
  }
  let outCmds: Command[] = []
  let sinkStream: Observable<Command> | null = null
  const syncCtx = {
    emit: (cmd: unknown) => { outCmds.push(cmd as Command) },
    emitNode: (v: VNodeChild, p: string, i: number, r: string | null) => {
      sinkStream = renderV2Node(v, p, i, r, ctx, registry)
      return Promise.resolve()
    },
    oldId: pathId(parent, index),
    newId: pathId(parent, index),
    parent, index, ref,
    oldCompId,
    registry,
  } as never
  return create<Command>((obs) => {
    let cancelled = false
    let sub: { unsubscribe(): void } | null = null
    void Promise.resolve(t(oldC as never, newC, syncCtx)).then(() => {
      if (cancelled) return
      for (const c of outCmds) obs.next(c)
      if (sinkStream) {
        sub = sinkStream.subscribe({
          next: (c) => { if (!cancelled) obs.next(c) },
          error: (e) => { if (!cancelled) obs.error(e) },
          complete: () => { if (!cancelled) obs.complete() },
        })
      } else { obs.complete() }
    }).catch((e) => { if (!cancelled) obs.error(e) })
    return () => { cancelled = true; sub?.unsubscribe() }
  })
}
