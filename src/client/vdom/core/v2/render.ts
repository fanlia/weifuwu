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
import { pathId } from '../node/native.ts'
import { kindOf, textOf } from '../node/index.ts'
import { emitHole, invalidDiagnostic } from '../node/hole.ts'
import { serializableAttrs } from '../node/native.ts'
import { Observable, create } from '../../observable/index.ts'
import type { OperatorFn } from '../../observable/index.ts'

/** 节点展开（vnode → 命令流——惰性——订阅驱动） */
export function renderV2Node(v: VNodeChild, parent: string, index: number, ref: string | null, ctx: UIContext, registry: ComponentRegistry): Observable<Command> {
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
        parts.push(renderV2Node(c, parent, slot, lastRef2, ctx, registry))
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
        parts.push(renderV2Node(c, parent, slot, lastRef2, ctx, registry))
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
        parts.push(renderV2Node(c, id, slot, lastRef, ctx, registry))
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
      // **组件挂载（复用 v1 renderComponent——阶段 1 表达层——内部检查
      //   语义零改——streaming 化的 sink（命令进流））**
      return create<Command>((obs) => {
        let done = false
        // **订阅到 complete（不主动退订）**：内嵌组件的 mount（then
        // 微任务）在 complete 前发出——「订阅-立即退订」会丢失异步
        // mount（v1/v2 差异实证）——完整消费
        const useEmit = async (child: VNodeChild, p: string, i: number, r: string | null): Promise<void> => {
          await new Promise<void>((resolve, reject) => {
            if (done) { resolve(); return }
            renderV2Node(child, p, i, r, ctx, registry).subscribe({
              next: (c) => { if (!done) obs.next(c) },
              error: (e) => { if (!done) { done = true; reject(e) } },
              complete: () => resolve(),
            })
          })
        }
        void renderComponent(vn, parent, index, ref, compId, ctx, registry, useEmit, (cmd) => { if (!done) obs.next(cmd) })
          .then((isNew) => { if (!done && isNew) obs.next({ op: 'mount', compId } as Command); if (!done) { obs.complete(); done = true } })
          .catch((e) => { if (!done) { done = true; obs.error(e) } })
        return () => { done = true }
      })
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
export function renderV2(root: VNode, ctx?: UIContext, registry?: ComponentRegistry): Observable<Command> {
  const sharedCtx = (ctx ?? {}) as UIContext
  const reg = registry ?? createComponentRegistry()
  return renderV2Node(root, 'root', 0, null, sharedCtx, reg).pipe(
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

/** 顺序拼接（流串联——命令序号保持） */
export function concatObs<T>(streams: Array<Observable<T>>): Observable<T> {
  return create<T>((obs) => {
    let idx = 0
    let current: { unsubscribe(): void } | null = null
    let cancelled = false
    const nextStream = (): void => {
      if (cancelled) return
      if (idx >= streams.length) { obs.complete(); return }
      const s = streams[idx++]
      current = s.subscribe({
        next: (v) => obs.next(v),
        error: (e) => { if (!cancelled) { cancelled = true; obs.error(e) } },
        complete: () => nextStream(),
      })
    }
    nextStream()
    return () => { cancelled = true; current?.unsubscribe() }
  })
}

/** append 算子（concat 语义——合成尾部流） */
export function concatWith<T>(tail: Observable<T>): OperatorFn<T, T> {
  return (source) => concatObs([source as Observable<T>, tail])
}
