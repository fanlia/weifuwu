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
import { noteRenderError, clearRenderError } from '../../dev/error-counter.ts'
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
import { kindOf, textOf, isHoleKind } from '../node/index.ts'
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
  // **同步收集（2027-09——React 基准对比实证）**：v2 全部命令流同步完成
  // （工厂/渲染同步）——原实现每节点 fromArray + concatObs（24000 节点 =
  //  48000 流对象——Node 实测生成+流化 69ms + toArray 38ms——React 对照
  //  mount 慢 3.3x 主因之一）——改为单数组收集 + 外层单 fromArray（对外
  //  Observable 形态/管线纪律（原子性在 toArray/周期层）不变——内部零流对象）
  const out: Command[] = []
  renderV2Collect(v, parent, index, ref, ctx, registry, segments, requestRender, out)
  return fromArray(out)
}

/** 渲染核心（同步收集——与 renderV2Node 命令序列完全同构——流形态
 *  分离：collect 产出数组——外层包装 Observable——序列等价） */
function renderV2Collect(
  v: VNodeChild, parent: string, index: number, ref: string | null,
  ctx: UIContext, registry: ComponentRegistry,
  segments: Map<string, import('./diff.ts').Segment> | undefined,
  requestRender: (() => void) | undefined,
  out: Command[],
): void {
  const id = pathId(parent, index)
  switch (kindOf(v)) {
    case 'text': {
      const text = textOf(v)!
      out.push(
        { op: 'createText', id, value: text } as Command,
        { op: 'insert', id, parent, ref } as Command,
      )
      break
    }
    case 'hole': {
      emitHole((cmd) => out.push(cmd as Command), id, parent, ref)
      break
    }
    case 'array': {
      const items = v as VNodeChild[]
      detectDuplicateKey(items, `数组展开（${parent}）`)
      let slot = index
      let lastRef2: string | null = ref
      for (const c of items) {
        renderV2Collect(c, parent, slot, lastRef2, ctx, registry, segments, requestRender, out)
        const sc = slotCount(c)
        lastRef2 = pathId(parent, slot + sc - 1)
        slot += sc
      }
      break
    }
    case 'fragment': {
      const cs = childrenOf(v as VNode)
      detectDuplicateKey(cs, `Fragment 展开（${parent}）`)
      let slot = index
      let lastRef2: string | null = ref
      for (const c of cs) {
        renderV2Collect(c, parent, slot, lastRef2, ctx, registry, segments, requestRender, out)
        const sc = slotCount(c)
        lastRef2 = pathId(parent, slot + sc - 1)
        slot += sc
      }
      break
    }
    case 'element': {
      const vn = v as VNode
      // 元素：create → setProp（函数值）→ insert → ref → children 递归 → close
      out.push({ op: 'create', id, tag: vn.type as string, attrs: serializableAttrs(vn.props) } as Command)
      for (const [k, val] of Object.entries(vn.props)) {
        if (k === 'children' || k === 'key' || k === 'ref') continue
        if (typeof val === 'function') out.push({ op: 'setProp', id, key: k, value: val } as Command)
      }
      out.push({ op: 'insert', id, parent, ref } as Command)
      const refFn = vn.props.ref
      if (typeof refFn === 'function') out.push({ op: 'ref', id, fn: refFn } as Command)
      const cs = childrenOf(vn)
      detectDuplicateKey(cs, `元素 children（${id}）`)
      let lastRef: string | null = null
      let slot = 0
      for (const c of cs) {
        renderV2Collect(c, id, slot, lastRef, ctx, registry, segments, requestRender, out)
        const sc = slotCount(c)
        lastRef = pathId(id, slot + sc - 1)
        slot += sc
      }
      out.push({ op: 'close', id } as Command)
      break
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
      let compOut: VNodeChild
      try {
        compOut = rerenderSegment(seg, vn.props)
      } catch (e) {
        // **错误计数哨兵（VDOM-CORE-EXCELLENCE D2——去重 + 计数单源）**
        noteRenderError(compId, e)
        compOut = null
      }
      // **恢复清出（renderFn 成功即恢复——再错再报）**
      if (compOut !== null) clearRenderError(compId)
      seg.lastOutput = normalizeOutput(compOut)
      // **输出位置（单一实现源——v2OutputPos）**——渲染与 diff 共用同规则
      const pos = v2OutputPos(compOut, compId, parent, index)
      // **Hole 输出的挂载分离（2027-09——tour 违例实证——G11 可变输出的
      //  挂载面修正）**：组件输出 null 时——子空间锚（compId.0——id 命名
      //  保持 C2）但 DOM 挂载必须用**槽位父**（真实容器）——v2OutputPos
      //  的 {parent: compId} 是命名空间——DOM insert 到 compId（组件槽——
      //  洞→组件转换后 compId 可能是旧空洞锚——插到锚——id 空间违例——
      //  且旧锚未移除时锚后插入倒序残留）——与 diff 的「洞→组件 remove
      //  旧锚 + 渲染」（语义缺口：渲染路径无 remove——done.full 清理在
      //  insert 之后——中途态 parentOf 命中残留锚）——**分离命名与挂载**：
      //  锚挂槽位父（isConnected 容器——parentOf 直中）——命名仍 compId.0
      if (isHoleKind(compOut)) {
        const anchorId = pathId(compId, 0)
        out.push(
          { op: 'createAnchor', id: anchorId } as Command,
          { op: 'insert', id: anchorId, parent, ref } as Command,
          { op: 'mount', compId } as Command,
        )
        break
      }
      renderV2Collect(compOut, pos.parent, pos.index, ref, ctx, registry, segs, requestRender, out)
      out.push({ op: 'mount', compId } as Command)
      break
    }
    case 'invalid': {
      console.warn(`[vdom] 非法子节点——${invalidDiagnostic(v)}`)
      emitHole((cmd) => out.push(cmd as Command), id, parent, ref, invalidDiagnostic(v))
      break
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
