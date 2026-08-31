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
import { noteRenderError } from '../../dev/error-counter.ts'
import type { VNode, VNodeChild } from '../vnode.ts'
import type { Component, RenderFn } from '../vnode.ts'
import type { Command } from '../command/index.ts'
import type { UIContext } from '../../context/UIContext.ts'
import { pathId } from '../node/native.ts'
import { keyedId } from '../node/keyed.ts'
import { childrenOf, slotCount } from '../node/children.ts'
import { isFragment } from '../node/fragment.ts'
import { keyOf, detectMissingKey, positionKey, isPositionKey } from '../node/keyed.ts'
import { kindOf, textOf, isHoleKind, isTextKind } from '../node/index.ts' // B9 单一实现源——hole/text 判定
import { stateOf } from '../transform/states.ts'
import { diffAttrs } from '../diff/attrs.ts'
import { removeVNodeTree, outputBase, removalParent } from '../diff/cleanup.ts'
import { transitionOf } from '../transform/table.ts'
import { Observable, create, Subject } from '../../observable/index.ts'
import { spyEvent } from './spy.ts'
import { createUi } from '../../hooks/env.ts'
import { normalizeOutput, outputToChild, type CompOutput } from '../node/component.ts'
import type { OperatorFn } from '../../observable/index.ts'
import { renderV2Node, fromArray, concatObs, v2OutputPos } from './render.ts'

/** v2 组件流段（实例复用载体——**工厂执行一次——后续复用**） */
export interface Segment {
  factory: Component
  renderFn: RenderFn
  // **CompOutput 判别联合（v1 同——清理/转换路径直接兼容——outputToChild）**
  lastOutput: CompOutput | undefined
  hookSeq: { n: number }
  /** 渲染 hook 基准（mount 后计数——v1 renderBase 等价——**每次 renderFn 前
   *  重置——渲染期 hook 索引跨渲染稳定——useOpen 状态保留（2027-08
   *  漂移实证——Popover 点后 open 复位）**） */
  renderBase: number
  instData: Map<unknown, unknown>
  /** **destroy$（2027-08——段级卸载信号——单信号全停）**：卸载时 next——
   *  **单轨清理（2027-09——onUnmounts 字段删除）**：订阅者（onUnmount
   *  闭包栈 LIFO + 外部 takeUntil 流清理）统一由本信号驱动——不再有
   *  平行数组 */
  destroy$: import('../../observable/index.ts').Subject<void>
  disposed: boolean
  /** **创建纪元（2027-10——nav 链残留实修补正）**：createSegment 打上创建
   *  时全局纪元（渲染周期开始时递推）——cleanup 阶段（unmount 防御性
   *  dispose）只处理「当前周期之前」创建的段——unmount 命令目标永远是
   *  旧树段——同槽位 id 复用的新段不是目标（accordion→index→actionsheet
   *  实证：nav1 生成期的 unmount root.0.1.0 在 cleanup 阶段误杀同周期
   *  新挂载的 index 段 → 旧输出无物可清 → 组件列表残留） */
  epoch: number
}

/** **段生命周期纪元（单轨——diff.ts 模块级）**：渲染周期开始时 ++（cycle.ts
 *  调用 nextSegmentEpoch）——随后周期内 createSegment 均打上当前纪元。
 *  cleanup 的防御性 dispose 以纪元为界：`seg.epoch < 周期纪元` 才销毁。 */
let segmentEpoch = 0
/** 渲染周期开始（纪元递推——返回新纪元） */
export function nextSegmentEpoch(): number { return ++segmentEpoch }

export type SegmentMap = Map<string, Segment>

/** 创建段（mount——工厂执行——hooks 环境已注入 ctx.ui） */
export function createSegment(
  factory: Component,
  props: Record<string, unknown>,
  ctx: UIContext,
  compId: string,
  requestSegmentRender?: () => void,
): Segment {
  // **单轨清理（2027-09——onUnmounts 字段删除）**：onUnmount 注册进私有闭包
  // 栈——destroy$ 唯一内部订阅者按 LIFO（后注册先执行——v1 语义——资源
  // 展开逆序）执行——外部订阅者（takeUntil 流清理）随后——段接口不再暴露
  // onUnmounts（单机制自 destroy$——无平行数组）
  const onUnmounts: (() => void)[] = []
  const instData = new Map<unknown, unknown>()
  const hookSeq = { n: 0 }
  const hookStates = new Map<number, unknown>()
  const destroy$ = new Subject<void>()
  destroy$.subscribe({ next: () => {
    for (const fn of [...onUnmounts].reverse()) {
      try { fn() } catch (e) { console.error('[vdom] v2 onUnmount:', e) }
    }
  } })
  const instCtx = Object.create(ctx) as UIContext
  instCtx.onUnmount = (fn: () => void) => { onUnmounts.push(fn) }
  // **段级 hooks 面（2027-08——v2 完整性）**：createUi（真实的 hooks env——
  // 订阅/退订/重渲染 per 段——v1 实例级 hooks 的 v2 段等价）
  instCtx.ui = createUi({
    requestRender: () => {
      spyEvent('req:render', compId.slice(-18))
      requestSegmentRender?.()
    },
    onUnmount: (fn: () => void) => { onUnmounts.push(fn) },
    getBrowser: () => (ctx as { browser?: import("../../browser/Browser.ts").Browser }).browser ?? null,
    nextHookIndex: () => hookSeq.n++,
    getHookState: <T>(idx: number) => hookStates.get(idx) as T | undefined,
    setHookState: (idx: number, v: unknown) => { hookStates.set(idx, v) },
    getInstanceData: () => instData,
    // **兜底重试（v2 段——ctx.afterRender 可能缺失（serve 未设）——用
    //   microtask/setTimeout 兜底——首帧未挂载的重试必须执行（Affix scroll
    //   绑定实证——断链即静默失效）**
    scheduleAfterRender: (fn: () => void) => {
      const ar = (ctx as { afterRender?: (f: () => void) => void }).afterRender
      if (ar) ar(fn); else setTimeout(fn, 0)
    },
    getSharedContext: () => ctx ?? null,
  })
  const renderFn = factory(props, instCtx) as RenderFn
  const renderBase = hookSeq.n // 渲染 hook 基准（mount 后计数）
  return { factory, renderFn, lastOutput: undefined, hookSeq, renderBase, instData, destroy$, disposed: false, epoch: segmentEpoch }
}

/** **段重渲染（单一实现源）**：hookSeq 重置（v1 renderBase 语义——渲染期
 *  hook 索引跨渲染稳定）→ renderFn 重调（props 最新）——工厂不重跑 */
export function rerenderSegment(seg: Segment, props: Record<string, unknown>): VNodeChild {
  seg.hookSeq.n = seg.renderBase
  return seg.renderFn(props) as VNodeChild
}

/** 段销毁（unmount——destroy$ 单信号全停——onUnmount 闭包栈 LIFO + 订阅
 *  者清理统一由信号驱动）——段接口无平行数组（单轨清理） */
export function disposeSegment(id: string, segments: SegmentMap): void {
  const seg = segments.get(id)
  if (!seg || seg.disposed) return
  seg.disposed = true
  // destroy$ 信号（onUnmount 闭包栈 + 外部订阅者——takeUntil 语义）
  try { seg.destroy$.next() } catch (e) { console.error('[vdom] v2 destroy$:', e) }
  // **实例数据清空（OBSERVABLE-OPTIMIZE 波次 5——泄漏防线）**：hooks 的
  // 幂等登记（useObservable/useExternal entry）持有订阅闭包——显式清空
  // 释放引用链（GC 加速 + 泄漏检测面：dispose 后 instData 空）
  seg.instData.clear()
  segments.delete(id)
}

/**
 * 组件实例清理（异 type 替换——E2 纯移动拆解——语义原样）
 * **输出区间递归（2027-08——C1 fuzz A 段残留实证）**：只 disposeSegment
 * 不清理旧组件【输出区间】——旧输出内组件段残留——新组件同 id 复用
 * 旧段（输出错位——span.o0 幽灵）——v1 顺序纪律：先清输出（查段
 * lastOutput——嵌套组件 unmount 命令）→ 后 dispose。
 * **顶层组件的 unmount 命令（2027-08——D4 fuzz 实例面残留实证）**：
 * 消费端（Sim/applier）的实例面靠 unmount 命令——嵌套项已清——顶层
 * oldCompId 必须显式（否则 INST 残留 root.kk17——S_INST 面不等价）
 */
function disposeComponentWithOutput(
  oldCompId: string,
  segments: SegmentMap,
  slotId: string,
  parent: string,
): Command[] {
  const oldSeg = segments.get(oldCompId)
  const clearCmds: Command[] = []
  if (oldSeg) {
    const child = oldSeg.lastOutput !== undefined ? outputToChild(oldSeg.lastOutput) : undefined
    if (child !== undefined) {
      const regP = {
        get: (cid: string): unknown => {
          const sg = segments.get(cid)
          return sg ? { lastOutput: sg.lastOutput } : undefined
        },
      } as never
      removeVNodeTree(
        child,
        outputBase(child, oldCompId, slotId),
        removalParent(child, oldCompId, parent),
        (cmd) => { clearCmds.push(cmd as Command) },
        regP,
      )
    }
  }
  // **段 dispose 顺序（清理查询已结束——段表权威更新）**
  const disposes: string[] = []
  for (const c of clearCmds) {
    if (c.op === 'unmount' && segments.has(c.compId)) disposes.push(c.compId)
  }
  disposeSegment(oldCompId, segments)
  for (const cid of disposes) { if (segments.has(cid)) disposeSegment(cid, segments) }
  clearCmds.unshift({ op: 'unmount', compId: oldCompId } as Command)
  return clearCmds
}

/**
 * **段输出根枚举（VDOM-CORE-EXCELLENCE KEYED-MOVE M1——单一实现源）**：
 * keyed 组件输出的物理节点 id 清单——顺移物理 move 的命令目标。
 * **形态映射（四形态探针实证——2027-10）**：
 * - 单 vnode 元素/文本输出 → **槽位 id**（pathId——C2 锚点法——P 契约
 *   槽位 remap 有效实证）
 * - 数组输出 → **compId.i 平铺**（root.0.kk1.0/.1——与兄弟槽位隔离）
 * - null/空洞输出 → **compId.0 锚**（G11 修正——null 锚也挂子空间）
 * - 嵌套组件输出 → **compId.0**（单 vnode 组件输出——防冲突——HoverCard
 *   事故实证；嵌套段在 compId.0.0 递归子空间）
 */
export function outputRootIds(
  seg: Segment | undefined,
  kid: string,
  parent: string,
  index: number,
): string[] {
  const out = seg?.lastOutput
  if (out === undefined) return [kid + '.0'] // 段未知（保守——首根兜底）
  // **CompOutput 判别联合按 kind 分派（F1 探针实证：array 键是 items、
  // hole 无 v——统一解包 .v 会全落空——kind 分派是正解）**
  if (typeof out === 'object' && out !== null && 'kind' in out) {
    const co = out as { kind: string; v?: unknown; items?: unknown[] }
    if (co.kind === 'hole') return [kid + '.0'] // 锚（compId.0）
    if (co.kind === 'array') return ((co.items ?? []) as unknown[]).map((_, i) => `${kid}.${i}`)
    const v = co.v as VNode | null | undefined
    if (!v) return [kid + '.0'] // CompOutput.v 空守卫（TS 窄化——VNode 对象恒 truthy 语义等价）
    if (typeof v.type === 'function') return [kid + '.0'] // 嵌套组件输出
    return [pathId(parent, index)] // 单 el/text → 槽位 id
  }
  // CompOutput 三 kind 穷尽（类型保证——normalizeOutput 归一化）
  return [kid + '.0']
}

/** 任意子节点的物理输出根 id（M2 ref 链——新位置左邻定位）：
 *  元素/文本 → 槽位 id；keyed 组件 → 输出根[0]（compId.0/槽位） */
export function outputRootIdOf(
  c: VNodeChild,
  parent: string,
  index: number,
  segments?: SegmentMap,
): string {
  if (isHoleKind(c)) return pathId(parent, index) // 空洞槽位锚（kindOf 单一实现源）
  if (isTextKind(c)) return pathId(parent, index) // 文本槽位（isTextKind 单一实现源——红线）
  const v = c as VNode
  if (typeof v.type !== 'function') return pathId(parent, index) // 元素/Fragment 平铺首根（近似——ref 链容忍）
  const k = keyOf(v)
  if (k === null) return pathId(parent, index) // 无 key 组件槽位
  const kid = keyedId(parent, k)
  return outputRootIds(segments?.get(kid), kid, parent, index)[0]
}

/**
 * children 槽位对照循环（E2 纯移动拆解——fragment/array 与 element 两处
 * 同模式收敛——语义原样：槽位推进 + 越界渲染 + 尾部区间移除）
 * **removeFirst**：fragment 版移除命令先于渲染（unshift 逆序）、element 版
 * 后于渲染（push 正序）——命令顺序原样保留（槽位不重叠时等价——保守不合并）
 */
function diffChildrenSlots(
  oldCs: VNodeChild[],
  cs: VNodeChild[],
  parent: string,
  ctx: UIContext,
  segments: SegmentMap,
  registry: import('../node/component.ts').ComponentRegistry,
  requestRender: (() => void) | undefined,
  removeFirst: boolean,
): Observable<Command> {
  const parts: Array<Observable<Command>> = []
  const removes: Array<Observable<Command>> = []
  let slot = 0
  let lastRef: string | null = null
  for (let i = 0; i < cs.length; i++) {
    const sc = slotCount(cs[i])
    // **越界新项 = 渲染（v1 尾部 emit——hole→锚补全——空洞槽位首次出现
    //  需建锚——fuzz seed=42 i=359 实证 root.2 锚缺失）**
    parts.push(oldCs[i] === undefined
      ? renderV2Node(cs[i], parent, slot, lastRef, ctx, registry, segments, requestRender)
      : diffV2Node(oldCs[i], cs[i], parent, slot, lastRef, ctx, segments, registry, requestRender))
    lastRef = pathId(parent, slot + sc - 1)
    slot += sc
  }
  for (let i = oldCs.length - 1; i >= cs.length; i--) {
    removes.push(fromArray(removeTreeV2(oldCs[i], parent, slotOfV2(oldCs, i), segments)))
  }
  // **尾部区间移除顺序**：fragment 版 removes 先（unshift 逆序语义）——
  // element 版 removes 后（正序 push——数组已逆序收集——reverse 恢复原序）
  if (removeFirst) return concatObs([...removes.reverse(), ...parts])
  removes.reverse()
  return concatObs([...parts, ...removes])
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
  requestRender?: () => void,
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
    return concatObs([fromArray([{ op: 'remove', id } as Command]), renderV2Node(newC, parent, index, ref, ctx, registry, segments, requestRender)])
  }
  // 新空洞 → 旧侧让位（**复合旧侧（组件/Fragment/元素）→ 转换——完整
  // 卸载（unmount + 输出区间清理 + 锚替）——非简单移除**——v1 语义对齐）
  if (nk === 'hole') {
    // **所有非空洞旧侧 → 转换**（text/元素/组件/Fragment——完整转换：
    // 旧侧让位 + 锚创建——不是单 remove——v1 语义对齐）
    return transformV2(oldC, newC, parent, index, ref, ctx, registry, ok === 'component' ? v2CompId(oldC as VNode, parent, index) : undefined, segments, requestRender)
  }
  // **数组/Fragment 同态 → children 对照**（槽位推进——fuzz 根/嵌套）
  if ((ok === 'fragment' || ok === 'array') && (nk === 'fragment' || nk === 'array')) {
    const oldCs = expandFrag(Array.isArray(oldC) ? oldC : childrenOf(oldC as VNode))
    const cs = expandFrag(Array.isArray(newC) ? newC : childrenOf(newC as VNode))
    // **keyed 检测（2027-08——fragment 级 keyed 缺口实证）**：任一侧含
    // keyed 项 → keyed 列表对照（diffKeyedV2——首现优先/move/重建——element
    // children 同一规则源）——位置对照会让 keyed 项 DOM 不移动（内容就地
    // diff——最终位置错——repro-frag7 实证）——fragment keyed（items.map
    // 直接放射——无 wrapper div）必须身份跟随
    if (hasKeyedId(cs) || hasKeyedId(oldCs)) {
      return diffKeyedV2(oldCs, cs, parent, ctx, segments, registry, requestRender)
    }
    return diffChildrenSlots(oldCs, cs, parent, ctx, segments, registry, requestRender, true)
  }
  // 同态 → 递归对照
  if (ok === nk && typeof oldC !== 'string' && typeof oldC !== 'number') {
    const o = oldC as VNode
    const n = newC as VNode
    // 组件 → 组件（同 type：流段复用——核心；不同 type：替换）
    if (typeof o.type === 'function' && typeof n.type === 'function') {
      if (o.type === n.type) {
        return diffComponentV2(o, n, parent, index, ref, ctx, segments, registry, requestRender)
      }
      // **异 type 组件 → 旧实例卸载 + 输出区间递归清理 + 新段挂载**（v1
      // diffSame 异 type 分支对齐——非转换表——component→component 同态
      // 转换表无定义——违例）——清理逻辑单源（E2 纯移动拆解——G 系列
      // 「输出区间递归/顶层 unmount」语义内聚）
      const oldCompId = v2CompId(o, parent, index)
      const clearCmds = disposeComponentWithOutput(oldCompId, segments, pathId(parent, index), parent)
      return concatObs([
        fromArray(clearCmds),
        renderV2Node(n, parent, index, ref, ctx, registry, segments, requestRender),
      ])
    }
    // 元素 → 元素（同 tag：attrs + children 递归；异 tag：替换）
    if (typeof o.type === 'string' && typeof n.type === 'string') {
      if (o.type === n.type) {
        const attrCmds: Command[] = []
        diffAttrs(o, n, id, (cmd) => attrCmds.push(cmd as Command), { formControl: o.type === 'input' || o.type === 'textarea' })
        const oldCs = expandFrag(childrenOf(o))
        const cs = expandFrag(childrenOf(n))
        // **A 级检测（2027-08——v1 契约面移植——v2 默认后开发者引导保留）**：
        // 实槽翻转（组件占据/让出非空洞非组件实槽——位置移位风险）→ warn 引导
        // 声明 key——空洞槽条件渲染/尾部增删零漂移不报（v1 children.ts 同判定）
        aLevelCheck(oldCs, cs, id)
        // **keyed 检测**：任一侧含 keyed 项 → keyed 列表对照（merge 语义）
        if (hasKeyedId(cs) || hasKeyedId(oldCs)) {
          return concatObs([fromArray(attrCmds), diffKeyedV2(oldCs, cs, id, ctx, segments, registry, requestRender)])
        }
        // 旧侧多余项移除（**完整区间**——removeFirst=false 保留原命令顺序）
        const childObs = diffChildrenSlots(oldCs, cs, id, ctx, segments, registry, requestRender, false)
        return concatObs([fromArray(attrCmds), childObs])
      }
      // 异 tag：重建（v1 diffSame 语义——**完整区间移除**（removeVNodeTree
      // 等价——子树全部 remove）+ 新侧渲染——**非转换表**（element→element
      // 同态——转换表无定义））
      return concatObs([
        fromArray(removeTreeV2(o, parent, index, segments)),
        renderV2Node(n, parent, index, ref, ctx, registry, segments, requestRender),
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
  return transformV2(oldC, newC, parent, index, ref, ctx, registry, oldCompIdV2, segments, requestRender)
}

function slotOfV2(oldCs: VNodeChild[], i: number): number {
  let s = 0
  for (let j = 0; j < i; j++) s += slotCount(oldCs[j])
  return s
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
  requestRender?: () => void,
): Observable<Command> {
  const compId = v2CompId(newV, parent, index)
  const seg = segments.get(compId)
  if (!seg || seg.factory !== (newV.type as never)) {
    // 首见/段错配（同位置 type 相同但段缺失或工厂不一致——上一轮挂载失败
    // /泄漏/重建重挂 → 销毁重建）
    if (seg) disposeSegment(compId, segments)
    return renderV2Node(newV, parent, index, ref, ctx, registry, segments, requestRender)
  }
  // **复用：renderFn 重调（props 最新）——工厂不重跑**——输出对照（同一
  // 算子——旧输出 vs 新输出——组件输出特判收敛）
  let newOut: VNodeChild
  try {
    newOut = rerenderSegment(seg, newV.props)
  } catch (e) {
    noteRenderError(compId, e)
    return fromArray([])
  }
  const oldOut = seg.lastOutput !== undefined ? outputToChild(seg.lastOutput) : undefined
  seg.lastOutput = normalizeOutput(newOut)
  const pos = v2OutputPos(newOut, compId, parent, index)
  if (oldOut === undefined) {
    // 首次输出（段建后第一次渲染输出）——渲染（同输出位置规则）
    return renderV2Node(newOut, pos.parent, pos.index, ref, ctx, registry, segments, requestRender)
  }
  return diffV2NodeAt(oldOut, newOut, pos.parent, pos.index, ref, ctx, segments, registry, requestRender)
}

/** 组件输出的槽位对照（输出在 compId 子空间——index 0 起） */
function diffV2NodeAt(
  oldOut: VNodeChild,
  newOut: VNodeChild,
  base: string,
  index: number,
  ref: string | null,
  ctx: UIContext,
  segments: SegmentMap,
  registry: import('../node/component.ts').ComponentRegistry,
  requestRender?: () => void,
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
      parts.push(oldArr[i] === undefined
        ? renderV2Node(newArr[i], base, slot, lastRef, ctx, registry, segments, requestRender)
        : diffV2Node(oldArr[i], newArr[i], base, slot, lastRef, ctx, segments, registry, requestRender))
      lastRef = pathId(base, slot + sc - 1)
      slot += sc
    }
    for (let i = newArr.length; i < oldArr.length; i++) {
      parts.push(fromArray(removeTreeV2(oldArr[i], base, slotOf(oldArr, i), segments)))
    }
    return concatObs(parts)
  }
  return diffV2Node(oldOut, newOut, base, index, ref, ctx, segments, registry, requestRender)
}

/** **投影对齐（P5——v1 children.ts expandFrag 移植）**：FRAG vnode 展开为
 *  槽位序列（渲染 emit 同语义——槽位连续）——children 对照必须以展开槽位
 *  为单位——否则 FRAG 作 1 项对照——后续项槽位错位（fuzz 不等价实证——
 *  seed=42 的 root.0.2 错放 ul / span.c1 缺失） */
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

/** **A 级检测（实槽翻转——v1 children.ts 判定移植——单一实现）**：
 *  组件占据/让出「非空洞非组件」实槽（位置被占用——后续项按位置移位 →
 *  重挂 → 状态丢失）→ warn 引导声明 key；空洞槽条件渲染（§6.3 占位法——
 *  长度恒定 toggle）与纯尾部增删（越界 = 空洞槽）零漂移不报 */
function aLevelCheck(oldCs: VNodeChild[], newCs: VNodeChild[], id: string): void {
  if ((globalThis as { __WF_NO_A_CHECK__?: boolean }).__WF_NO_A_CHECK__) return
  const isBizNode = (c: VNodeChild): boolean => !isHoleKind(c) && !isTextKind(c) && !Array.isArray(c)
  const bizOld = oldCs.filter(isBizNode)
  const bizNew = newCs.filter(isBizNode)
  const isUnkeyedComp = (c: VNodeChild): boolean =>
    typeof (c as VNode | null)?.type === 'function' && keyOf(c) === null
  const isHoleSlot = (cs: VNodeChild[], i: number): boolean => i >= cs.length || isHoleKind(cs[i])
  const oldFree = (i: number): boolean => isHoleSlot(oldCs, i) || isUnkeyedComp(oldCs[i])
  const newFree = (i: number): boolean => isHoleSlot(newCs, i) || isUnkeyedComp(newCs[i])
  const risky =
    newCs.some((c, i) => isUnkeyedComp(c) && !oldFree(i)) ||
    oldCs.some((c, i) => isUnkeyedComp(c) && !newFree(i))
  if (risky) {
    detectMissingKey(bizNew, `children（${id}——无 key 组件实槽翻转 ${bizOld.length}→${bizNew.length}）`)
  }
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
  requestRender?: () => void,
): Observable<Command> {
  const oState = stateOf(oldTree)
  const nState = stateOf(newTree)
  const t = transitionOf(oState, nState)
  if (t) {
    // **异态根转换（2027-08——契约层实现——阶段 1b 登记补齐）**：diffStream
    // 契约（v1 删除前等价面）——element↔component/text 根转换走 v1 转换表
    // （transformV2——旧侧让位 + 新侧渲染——同 v1 语义——契约测试锁定）——
    // serve 层的「整树替换」是运行路径兜底（导航场景）——契约面必须等价
    return transformV2(
      oldTree as never, newTree as never, 'root', 0, null, ctx, registry,
      oState === 'component' ? v2CompId(oldTree, 'root', 0) : undefined,
      segments, requestRender,
    ).pipe(appendDone) as Observable<Command>
  }
  return diffV2Node(oldTree, newTree, 'root', 0, null, ctx, segments, registry, requestRender)
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
  requestRender?: () => void,
): Observable<Command> {
  if (oldC === undefined) return renderV2Node(newC, parent, index, ref, ctx, registry, segments, requestRender)
  return diffV2Node(oldC, newC, parent, index, ref, ctx, segments, registry, requestRender)
}

/** keyed 列表对照（流式——顺移 move / 冲突重建 / key 映射对照——v1 语义等价） */
export function diffKeyedV2(
  oldCs: VNodeChild[],
  newCs: VNodeChild[],
  parent: string,
  ctx: UIContext,
  segments: SegmentMap,
  registry: import('../node/component.ts').ComponentRegistry,
  requestRender?: () => void,
): Observable<Command> {
  const cmds: Command[] = []
  // **混合数组身份映射（设计契约——node/keyed.ts 落定）：无 key 项由位置
  //  接管——pos:{i} 身份——位置稳定 = 身份稳定（diff 复用——不再每轮
  //   remove+create 重建——unkeyed 子树状态/事件闭包保持——reports 图表
  //   tooltip 自持循环实证）；位置变化 = 身份变化（移除/新建——位置身份
  //   语义）——与 identityKey 单一规则源
  const identOf = (c: VNodeChild, i: number): string => keyOf(c) ?? positionKey(i)
  // 旧 key（真实 key + pos key）→ 旧索引（首现优先——与 v1 单一规则源）
  const oldIdxByKey = new Map<string, number>()
  oldCs.forEach((c, i) => { const k = identOf(c, i); if (!oldIdxByKey.has(k)) oldIdxByKey.set(k, i) })
  const newKeys = new Set(newCs.map((c, i) => identOf(c, i)))

  // 0. 旧侧清理（空洞/文本/unkeyed 项/重复 key 多余项——区间 remove）
  const keyCount = new Map<string, number>()
  for (let i = 0; i < oldCs.length; i++) {
    const oldC = oldCs[i]
    if (isHoleKind(oldC)) { cmds.push({ op: 'remove', id: pathId(parent, i) } as Command); continue }
    if (isTextKind(oldC)) { cmds.push({ op: 'remove', id: pathId(parent, i) } as Command); continue }
    if (Array.isArray(oldC)) continue
    const k = keyOf(oldC as VNode)
    if (k !== null) {
      const n = (keyCount.get(k) ?? 0) + 1
      keyCount.set(k, n)
      if (n === 1) continue
      cmds.push(...removeTreeV2(oldC as VNode, parent, i, segments))
      continue
    }
    // unkeyed 项**不立即移除**——位置身份接管（pos:{i}）——步骤 3 按
    // 位置对照（位置稳定 → diff 复用；位置消失 → 步骤 1 区间移除）——
    // 修复前：无条件 remove+create（每轮重建——组件状态丢失——reports
    // 图表 tooltip 闭包换代 → mouseenter 自持循环实证）
  }

  // 1. 真移除（key 不在新——**完整区间** + **段销毁（destroy$）**）
  for (const [k, oldIdx] of oldIdxByKey) {
    if (!newKeys.has(k)) {
      cmds.push(...removeTreeV2(oldCs[oldIdx] as VNode, parent, oldIdx, segments))
      // pos key = 位置身份（段挂位置 id 下——removeTreeV2 的 unmount 命令
      // 已覆盖清理——keyed dispose 仅真实业务 key）
      if (!isPositionKey(k)) {
        const kid = keyedId(parent, k)
        if (segments.has(kid)) disposeSegment(kid, segments) // 卸载信号——资源清理
      }
    }
  }

  // 2. 相对顺序检测（共有 key 的子序列）
  const keptOld = oldCs.map((c) => keyOf(c)).filter((k): k is string => k !== null && newKeys.has(k))
  const keptNew = newCs.map((c) => keyOf(c)).filter((k): k is string => k !== null && oldIdxByKey.has(k))
  // **组件占槽顺移排除（2027-10 VDOM-CORE-EXCELLENCE A2 fuzz 扩维实证）**：
  // keyed 组件多根输出挂 compId 子空间（root.0.kk%2E2.0）——槽位 id 无实体
  // ——顺移 move 的槽位 remap 无物可迁（DOM 不重排——终态错位 + tracker
  // 违例——旧生成器从不触发此组合故历史绿）。**组件项确实移动**时退冲突
  // 重建（renderV2Node 段复用 + create/insert——位置正确状态保持——已验证
  // 路径）；位置不变的组件项仍走原 diff 对照（段复用 rerender——G11 面）
  // **keyed 组件顺移全走物理 move（KEYED-COMPONENT-MOVE M2——2027-10
  // movedComp 撤销——A2「一律退重建」被 M2 分支替代）**：
  // - 单根 el 输出 → 槽位 remap（noMove: true——元素同路径——P 契约实证）
  // - compId 子空间输出（数组/锚/嵌套）→ 输出根逐节点物理 move
  //   （detach+insert——id 自映射——段/状态/DOM 引用零扰动）
  // - 段未知（首见防御）→ 退重建（正确性兜底——fuzz D5 实证安全网）
  // 仅当存在段未知的移动组件时退重建（movedComp 收窄为防御性判定）
  const movedComp = newCs.some((newC, i) => {
    const k = keyOf(newC)
    if (k === null || typeof (newC as VNode).type !== 'function') return false
    const oldIdx = oldIdxByKey.get(k)
    if (oldIdx === undefined || oldIdx === i) return false
    return segments?.get(keyedId(parent, k)) === undefined
  })
  let subseq = !movedComp
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
      if (isHoleKind(c) || isTextKind(c)) return
      if (Array.isArray(c)) return
      // **keyed 组件项区间移除（2027-10 扩维 fuzz 实证——单锚 remove 槽位
      // 够不着 compId 子空间物理节点——输出残留/幽灵 id）**：组件输出挂
      // compId（物理在 parent 下非槽位子树内）——必须完整区间。**状态保持
      // 判负记录**：keepSegments 方案（物理删 + 段保 + unmount 照发）语义
      // 不一致（消费端 unmount=段删除契约——mount 断言崩）——冲突重建是
      // 病态输入路径（环状 remap 必冲突）——正确性（契约一致）> 状态保持
      // ——工厂重跑可接受；正常路径（movedComp 排除——非移动组件）仍走
      // diff 对照段复用（G11 面——状态保持语义在正常路径兑现）
      if (keyOf(c as VNode) !== null && typeof (c as VNode).type === 'function') {
        cmds.push(...removeTreeV2(c as VNode, parent, i, segments, { keepSegments: true }))
        return
      }
      if (keyOf(c as VNode) !== null) { cmds.push({ op: 'remove', id: pathId(parent, i) } as Command); return }
      cmds.push(...removeTreeV2(c as VNode, parent, i, segments))
    })
    const rebuildParts: Array<Observable<Command>> = []
    let r: string | null = null
    for (let i = 0; i < newCs.length; i++) {
      const newC = newCs[i]
      const k = keyOf(newC)
      const kid = k !== null ? keyedId(parent, k) : pathId(parent, i)
      if (k !== null && typeof (newC as VNode).type === 'function') {
        // keyed 组件项——**全量渲染（非 diff 对照）**：冲突重建已把旧 DOM
        // 全部 remove——diff 对照无旧 DOM 可依（输出只 setProp 无 create——
        // 列表清空实证——keyed-reorder 场景）——renderV2Node 段复用 +
        // create/insert 重建（工厂不重跑——段保持状态——v1 emitWithKey
        // 重建语义）
        rebuildParts.push(renderV2Node(newC, parent, i, r, ctx, registry, segments, requestRender))
      } else {
        rebuildParts.push(renderV2Node(newC, parent, i, r, ctx, registry, segments, requestRender))
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
    const c = newCs[m.newIdx] as VNode
    const k = keyOf(c)
    if (k !== null && typeof c.type === 'function') {
      // **keyed 组件跨槽位移动（M2 分流）**
      const kid = keyedId(parent, k)
      const roots = outputRootIds(segments?.get(kid), kid, parent, m.oldIdx)
      const isSlotRoot = roots.length === 1 && !roots[0].startsWith(kid + '.')
      if (isSlotRoot) {
        // 单根 el 输出——槽位 remap（元素同路径——P 契约实证）
        cmds.push({ op: 'move', id: roots[0], parent, ref: null, newId: pathId(parent, m.newIdx), noMove: true } as Command)
      } else {
        // compId 子空间输出——输出根逐节点**物理 move**（id 自映射——
        // 段/状态零扰动）——ref 链（首节点 = 新位置左邻输出根——保持
        // 相对顺序；后续节点 = 前一输出根——数组多节点不逆序堆叠）
        const prev = m.newIdx > 0 ? (newCs[m.newIdx - 1] as VNode) : null
        let ref: string | null = prev === null
          ? null
          : outputRootIdOf(prev, parent, m.newIdx - 1, segments)
        for (const rid of roots) {
          cmds.push({ op: 'move', id: rid, parent, ref, newId: rid, noMove: false } as Command)
          ref = rid
        }
      }
    } else {
      cmds.push({ op: 'move', id: pathId(parent, m.oldIdx), parent, ref: null, newId: pathId(parent, m.newIdx), noMove: true } as Command)
    }
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
        parts.push(renderV2Node(newC, parent, i, lastRef, ctx, registry, segments, requestRender))
      } else if (typeof (newC as VNode).type === 'function') {
        parts.push(diffListItemV2(oldCs[oldIdx], newC, parent, i, lastRef, ctx, segments, registry, requestRender))
      } else {
        parts.push(diffV2Node(oldCs[oldIdx], newC, parent, i, lastRef, ctx, segments, registry, requestRender))
      }
    } else {
      // **unkeyed 项——位置身份对照（pos:{i} 匹配旧位置）**：位置稳定 →
      // diff 复用（不再每轮 remove+create）；旧位为空洞/文本/数组/缺失 →
      // 新建（旧侧空洞/文本在步骤 0 已移除——位置身份不适用）
      const oldIdx = oldIdxByKey.get(positionKey(i))
      const oldC = oldIdx === undefined ? undefined : oldCs[oldIdx]
      if (oldC !== undefined && !isHoleKind(oldC) && !isTextKind(oldC) && !Array.isArray(oldC)) {
        parts.push(diffV2Node(oldC, newC, parent, i, lastRef, ctx, segments, registry, requestRender))
      } else {
        parts.push(renderV2Node(newC, parent, i, lastRef, ctx, registry, segments, requestRender))
      }
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
  requestRender?: () => void,
): Observable<Command> {
  const seg = segments.get(kid)
  if (!seg || seg.factory !== (vn.type as never)) {
    if (seg) disposeSegment(kid, segments)
    return renderV2Node(vn, parent, index, ref, ctx, registry, segments, requestRender)
  }
  let newOut: VNodeChild
  try {
    newOut = rerenderSegment(seg, vn.props)
  } catch (e) {
    noteRenderError(kid, e)
    return fromArray([])
  }
  const oldOut = seg.lastOutput !== undefined ? outputToChild(seg.lastOutput) : undefined
  seg.lastOutput = normalizeOutput(newOut)
  const pos = v2OutputPos(newOut, kid, parent, index)
  if (oldOut === undefined) return renderV2Node(newOut, pos.parent, pos.index, ref, ctx, registry, segments, requestRender)
  return diffV2NodeAt(oldOut, newOut, pos.parent, pos.index, ref, ctx, segments, registry, requestRender)
}

/** 完整区间移除（v1 removeVNodeTree 等价——子树全部节点 remove——先子后父）
 *  **组件项 unmount 信号**：v1 removeVNodeTree 同语义（compId——消费端
 *  applier 的 registry 清理）
 *  **段 dispose 生成期（2027-08——段表是 v2 权威——同 compId 重渲染碰撞
 *  实证：列表→编辑器切换——旧按钮内 Icon 段残留 root.0.1.0.0——新 Button
 *  落同槽——段错配崩溃）**：段清理必须在 diff 生成期完成（命令流生产端
 *  完整自足——不依赖消费端时序——消费端 apply 循环的 dispose 是幂等兜底 */
export function removeTreeV2(
  v: VNodeChild, parent: string, index: number, segments?: SegmentMap,
  opts?: { keepSegments?: boolean },
): Command[] {
  const cmds: Command[] = []
  const id = pathId(parent, index)
  // **v1 removeVNodeTree 委托（2027-08——C1 fuzz seed=99 i=8 实证）**：
  // 组件项【输出子空间】递归（lastOutput 内嵌套组件的 unmount + DOM 区间
  // 移除——el 输出挂槽位/数组挂 compId.0——基线差异）——手写递归漏内层
  // 段（root.0.1.0 残留实证——新组件同 id 复用旧段——输出错位）——v1 清理
  // 路径（cleanup.ts）已覆盖全形态（G10 对账基线）——委托 + 段 dispose 汇集
  const regP = segments && segments.size > 0
    ? {
        get: (cid: string): unknown => {
          const sg = segments.get(cid)
          return sg ? { lastOutput: sg.lastOutput } : undefined
        },
      } as never
    : undefined
  removeVNodeTree(v, id, parent, (cmd) => cmds.push(cmd as Command), regP)
  // **段 dispose 生成期（unmount 全量收集后——lastOutput 查询完）**
  // **keepSegments（2027-10 VDOM-CORE-EXCELLENCE A2——keyed 组件冲突重建
  // 正解）**：物理区间照删 + 段保留不 dispose + lastOutput 清空（重建
  // renderV2Node 复用段——工厂不重跑——rerenderSegment 全量 emit 恢复
  // 输出物理）——unmount 信号不发（消费端 unmount=dispose 契约一致——
  // 生命周期信号由 rerender 全量路径隐含承担）——G 系列「重建段复用」
  // 语义 + 终态等价双兑现（扩维 fuzz + key-inject 双实证）
  if (segments && !opts?.keepSegments) {
    for (const c of cmds) {
      if (c.op === 'unmount' && segments.has((c as { compId: string }).compId)) {
        disposeSegment((c as { compId: string }).compId, segments)
      }
    }
  } else if (segments && opts?.keepSegments) {
    for (const c of cmds) {
      if (c.op === 'unmount') {
        const seg = segments.get((c as { compId: string }).compId)
        if (seg) (seg as { lastOutput?: unknown }).lastOutput = undefined
      }
    }
  }
  const finalCmds = opts?.keepSegments ? cmds.filter((c) => c.op !== 'unmount') : cmds
  return finalCmds
}

/** 列表含 keyed 项检测（v2——keyOf 桥） */
export function hasKeyedId(items: VNodeChild[]): boolean {
  return items.some((c) => keyOf(c) !== null)
}

// ── transform 6×6（v1 状态机语义——转换表共享——流式适配）──────────

/**
 * v2 转换（异态——v1 transitionOf 表语义单源——流式适配）
 * - 转换表同步执行（emit 收集让位命令 + emitNode 记录新侧）——**不 await**
 * - **顺序纪律三段流（2027-09——C1 fuzz seed=11 结构化修复）**：
 *   concatObs([disposeOp → removeCmds → 新侧渲染])——按序订阅：① 旧段
 *   dispose（段表权威更新）② 旧侧让位命令发射 ③ 新侧渲染构造（**订阅时**
 *   ——createSegment 在 dispose 后——同 id 命中旧段/工厂错配结构性不可能）
 *   ——pendingSink 时序 hack 删除（旧实现 Promise.resolve().then 时序不保）
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
  segments?: SegmentMap,
  requestRender?: () => void,
): Observable<Command> {
  const t = transitionOf(stateOf(oldC), stateOf(newC))
  if (!t) {
    // **显式 Reject（P2——消灭隐式路径）**：同态已被 diffV2Node 拦截——
    // 到达即状态机违例（fuzz#79 教训：静默落空）
    throw new Error(`[vdom] v2 状态机违例：未定义转换 ${stateOf(oldC)} → ${stateOf(newC)}`)
  }
  let outCmds: Command[] = []
  // **新侧记录（emitNode 不构造——订阅时构造——顺序纪律的前提）**
  let pendingSink: { v: VNodeChild; p: string; i: number; r: string | null } | null = null
  // **unmount 汇集**：转换表先 emit unmount 再经 regProxy 递归清理输出
  // 区间（查询段 lastOutput）——立即 dispose 会清数据导致清理不完整（G2
  // 教训）——**转换完成后统一 dispose**（生成端纪律：段表权威更新在转换
  // 命令全量产出后）
  const unmountIds: string[] = []
  // **registry 代理（v2 段表权威——transform 清理对齐）**：v1 转换表经
  // ctx.registry.get(compId).lastOutput 递归清理组件输出区间——v2 段化
  // 挂载不写 v1 registry——代理从段表查 lastOutput（转换表共享代码不改——
  // v2 下注入 v2 数据源）
  const regProxy = segments && segments.size > 0
    ? {
        get: (compId: string) => {
          const seg = segments.get(compId)
          return seg ? { lastOutput: seg.lastOutput } : undefined
        },
      } as never
    : registry
  const syncCtx = {
    emit: (cmd: unknown) => {
      // **unmount 命令 → 段生成端 dispose（C1 fuzz 同 id 段复用实证）**：
      // 转换表发 unmount（消费端 registry 清理）——v2 段表权威在生成端——
      // 不 dispose → 后续同 id 新组件命中旧段（输出错位——old A 段
      // root.0.0 被新 inner 复用）——同 removeTreeV2 纪律
      const c = cmd as Command
      if (c.op === 'unmount' && segments?.has(c.compId)) unmountIds.push(c.compId)
      outCmds.push(c)
    },
    emitNode: (v: VNodeChild, p: string, i: number, r: string | null) => {
      pendingSink = { v, p, i, r } // **记录——不构造（订阅时构造）**
    },
    oldId: pathId(parent, index),
    newId: pathId(parent, index),
    parent, index, ref,
    oldCompId,
    registry: regProxy,
  } as never
  t(oldC as never, newC, syncCtx) // **同步执行**（转换表——emit/emitNode 记录）
  // **三段流（顺序纪律——concatObs 按序订阅）**：① dispose 旧段（段表
  //  权威——C1 前提）② 旧侧让位命令 ③ 新侧渲染（**订阅时才构造**——
  //  createSegment 在 dispose 后——结构性保证）
  const newSide = pendingSink
    ? create<Command>((obs) => {
      const sink = pendingSink as { v: VNodeChild; p: string; i: number; r: string | null } // 捕获（订阅时非空——构造时已记录）
      const s = renderV2Node(sink.v, sink.p, sink.i, sink.r, ctx, registry, segments, requestRender)
      return s.subscribe({
        next: (c) => obs.next(c),
        error: (e) => obs.error(e),
        complete: () => obs.complete(),
      })
    })
    : fromArray([] as Command[])
  return concatObs([
    create<never>((obs) => {
      for (const cid of unmountIds) { if (segments?.has(cid)) disposeSegment(cid, segments) }
      obs.complete()
      return () => {}
    }),
    fromArray(outCmds),
    newSide,
  ])
}
