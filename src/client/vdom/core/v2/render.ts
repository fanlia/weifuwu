/**
 * vdom v2 — render（命令流 Observable 化——表达层原型）
 *
 * VDOM-V2-BLUEPRINT 阶段 1：
 * - renderV2(root, ctx, registry) → Observable<Command>——与 v1 renderToStream
 *   完全同构（同命令/同 id/同序——深度优先）——但**流式表达**
 * - 每段子流可 tap（审计钩子——透明机制 1）——回放/快照随流自然
 * - 阶段 1 验证点：① 命令流等价（v1/v2 最小场景相等）② 性能不低于 v1
 * - **组件实例流化（渲染流层——流段共享=复用）为阶段 2**（本层先做
 *   表达层——组件挂载复用 v1 renderComponent——内部检查语义零改）
 */
import type { VNode, VNodeChild } from '../vnode.ts'
import type { Command } from '../command/index.ts'
import type { UIContext } from '../../context/UIContext.ts'
import { createComponentRegistry, type ComponentRegistry } from '../node/component.ts'
import { renderComponent } from '../node/component.ts'
import { renderNative } from '../node/native.ts'
import { childrenOf, slotCount } from '../node/children.ts'
import { keyedId, detectDuplicateKey } from '../node/keyed.ts'
import { spyEvent } from './spy.ts'
import { pathId } from '../node/native.ts'
import { kindOf, textOf } from '../node/index.ts'
import { emitHole, invalidDiagnostic } from '../node/hole.ts'
import { serializableAttrs } from '../node/native.ts'
import { Observable, create } from '../../observable/index.ts'
import type { OperatorFn } from '../../observable/index.ts'
import { createSegment, rerenderSegment, disposeSegment, type Segment as V2Seg } from './diff.ts'
import { normalizeOutput } from '../node/component.ts'

/** **输出位置单一实现源**（v1 outputBase 语义——组件输出挂哪）：
 *  - 组件输出组件/数组/空洞 → compId 子空间（compId.0 起——与兄弟隔离）
 *  - 单元素/文本 → 槽位（parent/index——v1 C2 规则）
 *  v2 的渲染（段化）与 diff（输出对照）共用——**单一实现——防漂移** */
export function v2OutputPos(
  out: VNodeChild, compId: string, parent: string, index: number,
): { parent: string; index: number } {
  if (typeof (out as VNode)?.type === 'function' || Array.isArray(out) || kindOf(out) === 'hole') {
    return { parent: compId, index: 0 }
  }
  return { parent, index }
}

/** 节点展开（vnode → 命令流——惰性——订阅驱动） */
export function renderV2Node(
  v: VNodeChild, parent: string, index: number, ref: string | null,
  ctx: UIContext, registry: ComponentRegistry,
  segments?: Map<string, import('./diff.ts').Segment>,
  requestRender?: () => void,
): Observable<Command> {
  const id = pathId(parent, index)
  switch (kindOf(v)) {
    case 'text': {
      const text = textOf(v)!
      return fromArray([
        { op: 'createText', id, value: text } as Command,
        { op: 'insert', id, parent, ref } as Command,
      ])
    }
    case 'hole': {
      const out: Command[] = []
      emitHole((cmd) => out.push(cmd as Command), id, parent, ref)
      return fromArray(out)
    }
    case 'array': {
      const items = v as VNodeChild[]
      detectDuplicateKey(items, `数组展开（${parent}）`)
      let slot = index
      let lastRef2: string | null = ref
      const parts: Array<Observable<Command>> = []
      for (const c of items) {
        parts.push(renderV2Node(c, parent, slot, lastRef2, ctx, registry, segments, requestRender))
        const sc = slotCount(c)
        lastRef2 = pathId(parent, slot + sc - 1)
        slot += sc
      }
      return concatObs(parts)
    }
    case 'fragment': {
      const cs = childrenOf(v as VNode)
      detectDuplicateKey(cs, `Fragment 展开（${parent}）`)
      let slot = index
      let lastRef2: string | null = ref
      const parts: Array<Observable<Command>> = []
      for (const c of cs) {
        parts.push(renderV2Node(c, parent, slot, lastRef2, ctx, registry, segments, requestRender))
        const sc = slotCount(c)
        lastRef2 = pathId(parent, slot + sc - 1)
        slot += sc
      }
      return concatObs(parts)
    }
    case 'element': {
      const vn = v as VNode
      // 元素：create → setProp（函数值）→ insert → ref → children 递归 → close
      const cmds: Command[] = [{ op: 'create', id, tag: vn.type as string, attrs: serializableAttrs(vn.props) } as Command]
      for (const [k, val] of Object.entries(vn.props)) {
        if (k === 'children' || k === 'key' || k === 'ref') continue
        if (typeof val === 'function') cmds.push({ op: 'setProp', id, key: k, value: val } as Command)
      }
      cmds.push({ op: 'insert', id, parent, ref } as Command)
      const refFn = vn.props.ref
      if (typeof refFn === 'function') cmds.push({ op: 'ref', id, fn: refFn } as Command)
      const cs = childrenOf(vn)
      detectDuplicateKey(cs, `元素 children（${id}）`)
      let lastRef: string | null = null
      let slot = 0
      const parts: Array<Observable<Command>> = []
      for (const c of cs) {
        parts.push(renderV2Node(c, id, slot, lastRef, ctx, registry, segments, requestRender))
        const sc = slotCount(c)
        lastRef = pathId(id, slot + sc - 1)
        slot += sc
      }
      // 头命令 + 子流 + close
      return concatObs([fromArray(cmds), ...parts, fromArray([{ op: 'close', id } as Command])])
    }
    case 'component': {
      const vn = v as VNode
      const compId = vn.key !== null ? keyedId(parent, vn.key) : id
      // **v2 段化挂载（2027-08——完整重构）**——段创建（工厂+hooks 面）+
      // 输出渲染 + mount 命令（v1 命令形态等价——消费端不变）——diff 的
      // 复用通路依赖段（本渲染建段——diff 查段——闭环）
      const segs = segments ?? new Map<string, V2Seg>()
      let seg = segs.get(compId)
      // **工厂身份校验（2027-08——C1 fuzz 段错配实证）**：同 compId 段工厂
      // 不一致 = 陈旧段（移动/重建路径泄漏——位置同而复用错配——输出错位）
      // ——销毁重建（泄漏不隐身——错误工厂永不复用）
      if (seg && seg.factory !== (vn.type as never)) {
        disposeSegment(compId, segs)
        seg = undefined
      }
      if (!seg) {
        seg = createSegment(vn.type as never, vn.props, ctx, compId, requestRender)
        segs.set(compId, seg)
        spyEvent('seg:create', compId) // 工厂执行（新增段）——诊断器复用轴
      } else {
        spyEvent('seg:reuse', compId) // 段复用（工厂不重跑）
      }
      // **renderFn 错误降级（2027-08——v1 R2 契约移植——D3 实证）**：
      // 组件 renderFn 抛错 → 组件级 hole 降级（锚 + 段保留——下一拍重试
      // 自愈）——单组件失败不炸整树（v1 catch 语义——console.error + out=null）
      let out: VNodeChild
      try {
        out = rerenderSegment(seg, vn.props)
      } catch (e) {
        console.error(`[vdom] renderFn 错误（${compId}）——组件级 hole 降级（下一拍重试自愈）:`, e)
        out = null
      }
      seg.lastOutput = normalizeOutput(out)
      // **输出位置（单一实现源——v2OutputPos）**——渲染与 diff 共用同规则
      const pos = v2OutputPos(out, compId, parent, index)
      return concatObs([
        renderV2Node(out, pos.parent, pos.index, ref, ctx, registry, segs, requestRender),
        fromArray([{ op: 'mount', compId } as Command]),
      ])
    }
    case 'invalid': {
      console.warn(`[vdom] 非法子节点——${invalidDiagnostic(v)}`)
      const out: Command[] = []
      emitHole((cmd) => out.push(cmd as Command), id, parent, ref, invalidDiagnostic(v))
      return fromArray(out)
    }
  }
}

/** 根渲染（v2）——renderToStream 的 Observable 等价 */
export function renderV2(
  root: VNode, ctx?: UIContext, registry?: ComponentRegistry,
  segments?: Map<string, import('./diff.ts').Segment>,
  requestRender?: () => void,
): Observable<Command> {
  const sharedCtx = (ctx ?? {}) as UIContext
  const reg = registry ?? createComponentRegistry()
  return renderV2Node(root, 'root', 0, null, sharedCtx, reg, segments, requestRender).pipe(
    concatWith(fromArray([{ op: 'done', full: true } as Command])),
  ) as Observable<Command>
}

// ── 极简辅助（Observable 组合——流式表达的基石）─────────────

/** 数组 → 同步 Observable（逐项发射 + complete） */
export function fromArray<T>(items: T[]): Observable<T> {
  return create<T>((obs) => {
    for (const it of items) obs.next(it)
    obs.complete()
    return () => {}
  })
}

/** 顺序拼接（流串联——命令序号保持）
 *  **同步完成迭代化（2027-08——大 flat 列表栈溢出实证——QRCode 页）**：
 *  旧实现 complete → nextStream() 递归——N 个同步完成流 = N 层调用栈——
 *  数百 rect/svg 链即溢出。新实现：同步完成由 while 循环推进（迭代——
 *  零深栈）；异步完成仍由回调驱动（新调用栈——深度 1）。 */
export function concatObs<T>(streams: Array<Observable<T>>): Observable<T> {
  return create<T>((obs) => {
    let idx = 0
    let current: { unsubscribe(): void } | null = null
    let cancelled = false
    let driving = false
    const drive = (): void => {
      if (cancelled || driving) return
      driving = true
      while (!cancelled) {
        if (idx >= streams.length) { obs.complete(); break }
        const s = streams[idx++]
        let done = false
        let sync = true
        current = s.subscribe({
          next: (v) => obs.next(v),
          error: (e) => { if (!cancelled) { cancelled = true; obs.error(e) } },
          complete: () => {
            if (done || cancelled) return
            done = true
            if (sync) return // 同步完成——外层 while 已接管推进
            drive() // 异步完成——驱动下一流（深度 1——无深递归）
          },
        })
        sync = false
        if (!done) break // 流存活——等待其 complete
      }
      driving = false
    }
    drive()
    return () => { cancelled = true; current?.unsubscribe() }
  })
}

/** append 算子（concat 语义——合成尾部流） */
export function concatWith<T>(tail: Observable<T>): OperatorFn<T, T> {
  return (source) => concatObs([source as Observable<T>, tail])
}
