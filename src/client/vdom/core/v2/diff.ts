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
import { kindOf, textOf } from '../node/index.ts'
import { stateOf } from '../transform/states.ts'
import { diffAttrs } from '../diff/attrs.ts'
import { transitionOf } from '../transform/table.ts'
import { Observable, create } from '../../observable/index.ts'
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
}

export type SegmentMap = Map<string, Segment>

/** 创建段（mount——工厂执行——hooks 环境已注入 ctx.ui） */
export function createSegment(
  factory: Component,
  props: Record<string, unknown>,
  ctx: UIContext,
  compId: string,
): Segment {
  const onUnmounts: (() => void)[] = []
  const instData = new Map<unknown, unknown>()
  const hookSeq = { n: 0 }
  const instCtx = Object.create(ctx) as UIContext
  instCtx.onUnmount = (fn: () => void) => { onUnmounts.push(fn) }
  // hooks 注入面（env 绑定段——requestRender 经 ctx.render）
  instCtx.ui = ctx.ui // v2 段级 hooks 环境复用（阶段 1——精细化后续）
  const renderFn = factory(props, instCtx) as RenderFn
  return { factory, renderFn, onUnmounts, lastOutput: undefined, hookSeq, instData }
}

/** 段销毁（unmount——onUnmounts 逆序） */
export function disposeSegment(id: string, segments: SegmentMap): void {
  const seg = segments.get(id)
  if (!seg) return
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
  // 新空洞 → 旧锚移除
  if (nk === 'hole') return fromArray([{ op: 'remove', id } as Command])
  // 同态 → 递归对照
  if (ok === nk && typeof oldC !== 'string' && typeof oldC !== 'number') {
    const o = oldC as VNode
    const n = newC as VNode
    // 组件 → 组件（同 type：流段复用——核心；不同 type：替换）
    if (typeof o.type === 'function' && typeof n.type === 'function') {
      if (o.type === n.type) {
        return diffComponentV2(o, n, parent, index, ref, ctx, segments, registry)
      }
      // 异 type 组件 → 旧段卸载 + 新段挂载
      return concatObs([
        fromArray([{ op: 'unmount', compId: v2CompId(o, parent, index) } as Command]),
        renderV2Node(n, parent, index, ref, ctx, registry),
      ])
    }
    // 元素 → 元素（同 tag：attrs + children 递归；异 tag：替换）
    if (typeof o.type === 'string' && typeof n.type === 'string') {
      if (o.type === n.type) {
        const attrCmds: Command[] = []
        diffAttrs(o, n, id, (cmd) => attrCmds.push(cmd as Command))
        const cs = childrenOf(n)
        let slot = 0
        let lastRef: string | null = null
        const parts: Array<Observable<Command>> = []
        const oldCs = childrenOf(o)
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
      // 异 tag：替换（v2 迭代——先简化：remount（remove 区间 + 渲染）
      return concatObs([
        fromArray([{ op: 'remove', id } as Command]),
        renderV2Node(n, parent, index, ref, ctx, registry),
      ])
    }
  }
  // 异态（element↔text 等）——借用 v1 转换等价：旧让位 + 新渲染
  return concatObs([
    fromArray([{ op: 'remove', id } as Command]),
    renderV2Node(newC, parent, index, ref, ctx, registry),
  ])
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
