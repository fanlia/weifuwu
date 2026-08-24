/**
 * vdom core2 — transform（转换函数族——x2y 命名——6×6 全矩阵）
 *
 * 架构（可逆性契约 A4）：
 *   x2y(old, next, ctx)——每个转换生成**双事件流**：
 *     ctx.apply   —— 正向命令（应用后 DOM 变 y）
 *     ctx.reverse —— 逆向命令（**逆序**应用后 DOM 恢复 x）
 *   可逆性：f(E, yDom) = reverse 逆序应用 → xDom → dom2vnode → x
 *   ——"事件流 + 当前节点 → 原节点"由 reverse 流保证
 *
 * 转换模式（异态统一——让位 + 重建）：
 *   1. removeOld（旧侧让位——apply: remove；reverse: 完整重建命令——
 *      旧 vnode 信息在 old 参数——事件流自足）
 *   2. emitNew（新侧创建——apply: create 系列 + insert；reverse: remove）
 *   ——同态（对角）不走本表（diff 层就地对照——setText/setProp 精准）
 *
 * 一致性契约（A1）：emitNew 生成的 DOM 结构 ≡ vnode2dom 的 DOM 结构
 * （同 id 规则下——attrs 归一同规则）——测试断言锁定。
 *
 * 组件：x → component = 展开（工厂 + renderFn）→ 转换到输出形态；
 *       component → x = 展开读输出 → 移除输出 + 创建 x——组件无 DOM 实体。
 * 保真范围：与 vnode2dom 一致（字符串/归一 style/事件剔除/key 不编码）。
 */

import type { UIContext } from '../context/UIContext.ts'
import type { Event } from './command.ts'
import { classify, childrenOf, invalidDiagnostic, slotCount, pathId, forEachArraySlot, textMarks, type VNode, type VNodeChild, type Component } from './vnode.ts'
import { styleString } from './dom.ts'

/** 转换上下文（位置 + 双事件流） */
export interface TransformCtx {
  /** 当前槽位 id（锚点） */
  id: string
  /** 父容器 id（'root' = 根） */
  parent: string
  /** 槽位索引（children 序列内） */
  index: number
  /** 前一个兄弟 id（insert ref） */
  ref: string | null
  /** 正向事件流（应用后变新态） */
  apply: Event[]
  /** 逆向事件流（逆序应用恢复旧态） */
  reverse: Event[]
  /** 组件上下文（展开需要——可选） */
  ctx?: UIContext
}

/** 转换函数（x2y 命名——6×6 全矩阵——同态对角 = diff 层） */
export type Transform = (old: VNodeChild, next: VNodeChild, ctx: TransformCtx) => void | Promise<void>

/** 元素 attrs 归一（**单一实现源——dom.ts serializeAttrs——含 data-wf-types
 *  类型表**——与 vnode2dom/vnode2html 同规则——模块内用别名） */
import { serializeAttrs as serializableAttrs } from './dom.ts'

/** 新侧创建（apply: create 系列 + insert；reverse: remove——组件展开/数组
 *  递归——槽位推进——与 vnode2dom 结构一致） */
export async function emitNew(v: VNodeChild, base: string, parent: string, ctx: TransformCtx, ref: string | null): Promise<void> {
  const c = classify(v)
  switch (c.kind) {
    case 'text': {
      if (typeof c.value === 'number') {
        // **number 文本：tn 标记 + 文本双事件（类型保真——A3——槽位 2）**
        const baseIdx = Number(base.slice(parent.length + 1))
        ctx.apply.push({ op: 'create', id: base, payload: { kind: 'hole', value: 'textNumber' }, parent, ref })
        ctx.apply.push({ op: 'create', id: pathId(parent, baseIdx + 1), payload: { kind: 'text', value: String(c.value) }, parent, ref: base })
        ctx.reverse.push({ op: 'delete', id: pathId(parent, baseIdx + 1) })
        ctx.reverse.push({ op: 'delete', id: base })
      } else {
        ctx.apply.push({ op: 'create', id: base, payload: { kind: 'text', value: c.value }, parent, ref })
        ctx.reverse.push({ op: 'delete', id: base })
      }
      return
    }
    case 'hole': {
      ctx.apply.push({ op: 'create', id: base, payload: { kind: 'hole', value: c.value }, parent, ref })
      ctx.reverse.push({ op: 'delete', id: base })
      return
    }
    case 'element': {
      ctx.apply.push({ op: 'create', id: base, payload: { kind: 'element', tag: c.v.type as string, attrs: serializableAttrs(c.v.props) }, parent, ref })
      ctx.reverse.push({ op: 'delete', id: base })
      let slot = 0
      let lastRef: string | null = null
      const kids = childrenOf(c.v)
      const marks = textMarks(kids)
      let mi = 0
      for (let i = 0; i < kids.length; i++) {
        // **连续 string 文本 → split 锚事件（元素 children 同样保真）**
        while (mi < marks.length && marks[mi]!.index === i) {
          const sid = pathId(base, slot)
          ctx.apply.push({ op: 'create', id: sid, payload: { kind: 'hole', value: 'split' }, parent: base, ref: lastRef })
          ctx.reverse.push({ op: 'delete', id: sid })
          lastRef = sid
          slot += 1
          mi += 1
        }
        await emitNew(kids[i]!, pathId(base, slot), base, ctx, lastRef)
        lastRef = pathId(base, slot + slotCount(kids[i]!) - 1)
        slot += slotCount(kids[i]!)
      }
      return
    }
    case 'component': {
      // 组件展开（两阶段）——输出递归——组件无 DOM 实体（区间语义）
      const renderFn = await (c.v.type as Component)(c.v.props, ctx.ctx ?? ({} as UIContext))
      const out = await renderFn(c.v.props)
      await emitNew(out, base, parent, ctx, ref)
      return
    }
    case 'array': {
      // 数组边界锚（start/end + 连续文本 split——**forEachArraySlot 单一
      //  实现源**——与 removeOld/slotCount 推进一致——消灭 split 错位）
      const baseIdx = Number(base.slice(parent.length + 1)) // 当前槽位（数组作为整体输入——嵌套时由外层推进）
      const tasks: Promise<void>[] = []
      let lastRef2: string | null = ref
      forEachArraySlot(c.items, (slot, kind, i) => {
        const id = pathId(parent, baseIdx + slot)
        if (kind !== 'item') {
          // start/split/end 锚
          ctx.apply.push({ op: 'create', id, payload: { kind: 'hole', value: kind }, parent, ref: lastRef2 })
          ctx.reverse.push({ op: 'delete', id })
          lastRef2 = id
        } else {
          // 项递归（push 同步顺序——ref 链同步推进——await 仅组件展开）
          tasks.push(emitNew(c.items[i]!, id, parent, ctx, lastRef2))
          lastRef2 = pathId(parent, baseIdx + slot + slotCount(c.items[i]!) - 1)
        }
      })
      await Promise.all(tasks)
      return
    }
    case 'invalid': {
      console.warn(`[core2] 非法子节点——${invalidDiagnostic(c.v)}`)
      return
    }
  }
}

/** 旧侧让位（apply: delete——**区间语义**；reverse: 完整重建命令
 *  ——旧 vnode 信息在 old 参数——事件流自足——可逆性 A4 的核心）
 *  **区间删除（证明审计——数组兄弟槽位）**：array 展开挂父容器连续槽位
 *  （root.0/root.1/root.2——兄弟关系——非前缀）——单锚 delete root.0 只删
 *  首项——后续槽位残留（array2element 实证：b/hole 残留）——逐槽位
 *  delete（slotCount 推进——与 emitNew 同规则）；单节点 delete base（子树
 *  由消费端前缀级联）；**逆序 push 重建**（reverse 整体逆序应用——重建
 *  顺序父先子后） */
export async function removeOld(v: VNodeChild, base: string, parent: string, ctx: TransformCtx, ref: string | null): Promise<void> {
  // 重建命令（reverse 方向——emitNew 的 apply 序列**逆序**入 reverse——
  // 整体逆序应用时以原顺序执行：先删新节点再重建旧节点）
  const rebuildCtx: TransformCtx = { ...ctx, apply: [], reverse: [] }
  await emitNew(v, base, parent, rebuildCtx, ref)
  // apply 区间删除（array → 逐槽位；单节点 → 单锚 + 消费端前缀级联）
  const c = classify(v)
  if (c.kind === 'text' && typeof c.value === 'number') {
    // number 文本：tn + 文本双槽位删除
    const baseIdx = Number(base.slice(parent.length + 1))
    ctx.apply.push({ op: 'delete', id: base })
    ctx.apply.push({ op: 'delete', id: pathId(parent, baseIdx + 1) })
    return
  }
  if (c.kind === 'array') {
    // 区间删除（start/split/end + 各项——forEachArraySlot 单一实现源——
    //  与 emitNew 推进一致——split 锚不漏删）
    forEachArraySlot(c.items, (slot) => {
      ctx.apply.push({ op: 'delete', id: pathId(parent, ctx.index + slot) })
    })
  } else {
    ctx.apply.push({ op: 'delete', id: base })
  }
  ctx.reverse.push(...[...rebuildCtx.apply].reverse())
}

// ── 转换实现（核心对——让位 + 重建统一模式） ──

/** hole → element（条件渲染展开——最常见——**旧锚必须让位**（锚是
 *  DOM 实体 Comment——不 remove 则残留——reverse 重建锚） */
export const hole2element: Transform = async (old, next, ctx) => {
  await removeOld(old, ctx.id, ctx.parent, ctx, ctx.ref)
  await emitNew(next, ctx.id, ctx.parent, ctx, ctx.ref)
}

/** element → hole（收缩——占位锚替换——同构不变量） */
export const element2hole: Transform = async (old, _next, ctx) => {
  await removeOld(old, ctx.id, ctx.parent, ctx, ctx.ref)
  await emitNew(null, ctx.id, ctx.parent, ctx, ctx.ref)
}

/** text → element */
export const text2element: Transform = async (old, next, ctx) => {
  await removeOld(old, ctx.id, ctx.parent, ctx, ctx.ref)
  await emitNew(next, ctx.id, ctx.parent, ctx, ctx.ref)
}

/** element → text */
export const element2text: Transform = async (old, next, ctx) => {
  await removeOld(old, ctx.id, ctx.parent, ctx, ctx.ref)
  await emitNew(next, ctx.id, ctx.parent, ctx, ctx.ref)
}

/** hole → text */
export const hole2text: Transform = async (old, next, ctx) => {
  await removeOld(old, ctx.id, ctx.parent, ctx, ctx.ref)
  await emitNew(next, ctx.id, ctx.parent, ctx, ctx.ref)
}

/** text → hole */
export const text2hole: Transform = async (old, _next, ctx) => {
  await removeOld(old, ctx.id, ctx.parent, ctx, ctx.ref)
  await emitNew(null, ctx.id, ctx.parent, ctx, ctx.ref)
}

/** element → array（单节点 → 多根——区间让位） */
export const element2array: Transform = async (old, next, ctx) => {
  await removeOld(old, ctx.id, ctx.parent, ctx, ctx.ref)
  await emitNew(next, ctx.id, ctx.parent, ctx, ctx.ref)
}

/** array → element（多根 → 单节点） */
export const array2element: Transform = async (old, next, ctx) => {
  await removeOld(old, ctx.id, ctx.parent, ctx, ctx.ref)
  await emitNew(next, ctx.id, ctx.parent, ctx, ctx.ref)
}

/** hole → array（条件渲染空数组） */
export const hole2array: Transform = async (old, next, ctx) => {
  await removeOld(old, ctx.id, ctx.parent, ctx, ctx.ref)
  await emitNew(next, ctx.id, ctx.parent, ctx, ctx.ref)
}

/** array → hole */
export const array2hole: Transform = async (old, _next, ctx) => {
  await removeOld(old, ctx.id, ctx.parent, ctx, ctx.ref)
  await emitNew(null, ctx.id, ctx.parent, ctx, ctx.ref)
}

/** text → array */
export const text2array: Transform = async (old, next, ctx) => {
  await removeOld(old, ctx.id, ctx.parent, ctx, ctx.ref)
  await emitNew(next, ctx.id, ctx.parent, ctx, ctx.ref)
}

/** array → text */
export const array2text: Transform = async (old, next, ctx) => {
  await removeOld(old, ctx.id, ctx.parent, ctx, ctx.ref)
  await emitNew(next, ctx.id, ctx.parent, ctx, ctx.ref)
}

/** x → component（组件无 DOM——**旧侧让位** + 展开后转换到输出形态——递归） */
export async function toComponent(old: VNodeChild, compV: VNode, ctx: TransformCtx): Promise<void> {
  await removeOld(old, ctx.id, ctx.parent, ctx, ctx.ref)
  const renderFn = await (compV.type as Component)(compV.props, ctx.ctx ?? ({} as UIContext))
  const out = await renderFn(compV.props)
  await emitNew(out, ctx.id, ctx.parent, ctx, ctx.ref)
}

/** component → x（展开读输出——移除输出区间 + 创建 x） */
export async function fromComponent(compV: VNode, next: VNodeChild, ctx: TransformCtx): Promise<void> {
  const renderFn = await (compV.type as Component)(compV.props, ctx.ctx ?? ({} as UIContext))
  const out = await renderFn(compV.props)
  await removeOld(out, ctx.id, ctx.parent, ctx, ctx.ref)
  await emitNew(next, ctx.id, ctx.parent, ctx, ctx.ref)
}

/** 转换表（6×6——异态全矩阵——对角 = diff 层就地对照） */
export const TRANSFORMS: Record<string, Record<string, Transform | undefined>> = {
  text: {
    hole: text2hole,
    element: text2element,
    component: (o, n, c) => toComponent(o, n as VNode, c),
    array: text2array,
  },
  hole: {
    text: hole2text,
    element: hole2element,
    component: (o, n, c) => toComponent(o, n as VNode, c),
    array: hole2array,
  },
  element: {
    text: element2text,
    hole: element2hole,
    component: (o, n, c) => toComponent(o, n as VNode, c),
    array: element2array,
  },
  component: {
    text: (o, n, c) => fromComponent(o as VNode, n, c),
    hole: (o, n, c) => fromComponent(o as VNode, n, c),
    element: (o, n, c) => fromComponent(o as VNode, n, c),
    array: (o, n, c) => fromComponent(o as VNode, n, c),
  },
  array: {
    text: array2text,
    hole: array2hole,
    element: array2element,
    component: (o, n, c) => toComponent(o, n as VNode, c),
  },
  invalid: {
    text: (o, n, c) => { console.warn('[core2] invalid 让位'); return emitNew(n, c.id, c.parent, c, c.ref) },
    hole: (o, n, c) => { console.warn('[core2] invalid 让位'); return emitNew(n, c.id, c.parent, c, c.ref) },
    element: (o, n, c) => { console.warn('[core2] invalid 让位'); return emitNew(n, c.id, c.parent, c, c.ref) },
    component: (o, n, c) => { console.warn('[core2] invalid 让位'); return toComponent(o, n as VNode, c) },
    array: (o, n, c) => { console.warn('[core2] invalid 让位'); return emitNew(n, c.id, c.parent, c, c.ref) },
  },
}

/** 转换调度（异态——同态显式 Reject——P2 无静默路径纪律） */
export async function transformTo(old: VNodeChild, next: VNodeChild, ctx: TransformCtx): Promise<void> {
  const ok = classify(old).kind
  const nk = classify(next).kind
  if (ok === nk) {
    throw new Error(`[core2] 同态 ${ok}→${nk} 走 diff 就地对照（转换表只处理异态——P2 显式 Reject）`)
  }
  const t = TRANSFORMS[ok]?.[nk]
  if (!t) throw new Error(`[core2] 未定义转换 ${ok}→${nk}（必须显式迁移或显式 Reject）`)
  await t(old, next, ctx)
}

/** 转换执行（生成双事件流） */
export async function runTransform(old: VNodeChild, next: VNodeChild, id: string, parent: string, index: number, ref: string | null, ctx?: UIContext): Promise<{ apply: Event[]; reverse: Event[] }> {
  const tctx: TransformCtx = { id, parent, index, ref, apply: [], reverse: [], ctx }
  await transformTo(old, next, tctx)
  return { apply: tctx.apply, reverse: tctx.reverse }
}

/** 新侧渲染（emitNew 封装——生成 apply 流——初始态构建/同态 diff 新侧） */
export async function runEmit(v: VNodeChild, id: string, parent: string, index: number, ref: string | null, ctx?: UIContext): Promise<Event[]> {
  const tctx: TransformCtx = { id, parent, index, ref, apply: [], reverse: [], ctx }
  await emitNew(v, id, parent, tctx, ref)
  return tctx.apply
}
