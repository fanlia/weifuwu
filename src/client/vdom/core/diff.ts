/**
 * vdom core — diff 阶段（旧树 vs 新树 → **精准 command 事件流**）
 *
 * 四阶段管线（route → build → diff → patch）：
 * - build：vnode → 全量命令事件流（首帧/导航——done.full）
 * - diff：旧树 vs 新树 → **精准增量命令事件流**（本文件——**diff 的本质：
 *   精准生成需要 patch 的事件流**——counter 点击 = 只 setText 文本节点）
 * - patch：command 事件流 → DOM（**唯一 DOM 接触点**——diff/build 零 DOM
 *   操作——纯事件流生产者——可流式/可序列化/可重放）
 *
 * 对照决策（diff 职责——新侧渲染复用 build 的 createRenderDispatcher——
 * 消除重复）：
 * - 同态（text→setText / element→属性+children 递归 / component→复用）：
 *   值比较——**无变化不发命令**（精准原则）
 * - 异类型：transform 转换表（旧侧让位 remove/unmountComp——新侧渲染）
 * - keyed 列表：身份映射复用（planKeyedDiff——增删/重排状态跟随 key）
 */

import type { VNode, VNodeChild } from './vnode.ts'
import { childrenOf } from './node/children.ts'
import { kindOf } from './node/index.ts'
import { stateOf } from './transform/states.ts'
import { transitionOf } from './transform/table.ts'
import { listKind, planKeyedDiff, keyOf, detectMissingKey } from './node/keyed.ts'
import { createRenderDispatcher, type RenderSink } from './build.ts'
import { renderComponent, type ComponentRegistry } from './node/component.ts'
import { pathId, serializableAttrs } from './node/native.ts'
import type { Ctx } from '../context/Ctx.ts'
import type { Command } from './command/index.ts'

/**
 * diff：旧树 → 新树——精准增量命令事件流
 * ctx：组件共享上下文（serve 创建）；registry：组件实例注册表（跨渲染保持）
 */
export function diffStream(
  oldTree: VNode,
  newTree: VNode,
  ctx: Ctx,
  registry: ComponentRegistry,
): ReadableStream<Command> {
  return new ReadableStream<Command>({
    async start(controller) {
      const emitCommand = (cmd: Command) => controller.enqueue(cmd)
      // 新侧渲染（共享分发器——build/diff 同一实现）
      const emit = createRenderDispatcher(emitCommand, ctx, registry)

      // ── diff 主循环（同位置对照）──
      const oldState = stateOf(oldTree)
      const newState = stateOf(newTree)
      const t = transitionOf(oldState, newState)
      if (t) {
        // 异类型（导航/整树替换）：transform 旧侧让位——新侧全量渲染
        await t(oldTree, newTree, {
          emit: emitCommand,
          oldId: 'root.0',
          newId: 'root.0',
          parent: 'root',
          ref: null,
        })
        await emit(newTree, 'root', 0, null)
      } else {
        // 同态：对照（组件复用/元素精准 diff/children 递归）
        await diffSame(oldTree, newTree, 'root', 0, null, emit, emitCommand, ctx, registry)
      }
      emitCommand({ op: 'done' })
      controller.close()
    },
  })
}

/**
 * 同态对照（同位置同类型——**精准命令生成**）：
 * 组件 → renderComponent 复用（工厂不重跑——lastOutput 对照递归）；
 * 元素 → 属性值比较（只发变化）+ 函数面引用比较 + children 递归（列表分类）
 */
async function diffSame(
  oldV: VNode,
  newV: VNode,
  parent: string,
  index: number,
  ref: string | null,
  emit: RenderSink,
  emitCommand: (cmd: Command) => void,
  ctx: Ctx,
  registry: ComponentRegistry,
): Promise<void> {
  const id = pathId(parent, index)
  // 组件同类型复用（工厂不重跑——renderFn 重新调用——输出对照上次——精准 patch）
  if (typeof newV.type === 'function') {
    const rec = registry.get(id)
    const oldOut = rec?.lastOutput ?? null
    await renderComponent(newV, parent, index, ref, id, ctx, registry, async (out, p, i, r) => {
      if (oldOut !== null && oldOut !== undefined && typeof oldV.type === 'function') {
        // 上次输出对照（同实例——精准增量）
        await diffSame(oldOut as VNode, out as VNode, p, i, r, emit, emitCommand, ctx, registry)
      } else {
        await emit(out, p, i, r)
      }
    })
    return
  }
  // 元素同标签：属性精准 diff + children 递归对照
  if (typeof newV.type === 'string' && typeof oldV.type === 'string' && oldV.type === newV.type) {
    diffAttrs(oldV, newV, id, emitCommand)
    await diffChildren(oldV, newV, id, emit, emitCommand, ctx, registry)
    return
  }
  // 其余同态（text/fragment 等）——首版：新侧重建（位置对照）
  await emit(newV, parent, index, ref)
}

/** 属性精准 diff（值比较——只发变化的键；函数面引用比较——prev 传递） */
function diffAttrs(
  oldV: VNode, newV: VNode, id: string, emitCommand: (cmd: Command) => void,
): void {
  // 静态面（可序列化）——值比较——只发变化键；旧有新的没有 → 移除
  const oldAttrs = serializableAttrs(oldV.props)
  const newAttrs = serializableAttrs(newV.props)
  for (const [k, v] of Object.entries(newAttrs)) {
    if (oldAttrs[k] !== v) emitCommand({ op: 'setProp', id, key: k, value: v })
  }
  for (const k of Object.keys(oldAttrs)) {
    if (!(k in newAttrs)) emitCommand({ op: 'setProp', id, key: k, value: undefined })
  }
  // 函数面（事件/ref）——引用比较——变化才重发（prev 传递——patch 解绑重绑）
  for (const [k, v] of Object.entries(newV.props)) {
    if (k === 'children' || k === 'key') continue
    if (typeof v === 'function' && oldV.props[k] !== v) {
      emitCommand({ op: 'setProp', id, key: k, value: v, prev: oldV.props[k] })
    }
  }
}

/** children 对照（列表分类：全 unkeyed 位置身份 / 全 keyed 身份复用 / 混合） */
async function diffChildren(
  oldV: VNode, newV: VNode, id: string,
  emit: RenderSink, emitCommand: (cmd: Command) => void,
  ctx: Ctx, registry: ComponentRegistry,
): Promise<void> {
  const oldCs = childrenOf(oldV)
  const newCs = childrenOf(newV)
  // A 级检测（长度变化 + 无 key 组件项 → warn 引导声明 key——
  // 无 key = 位置身份——长度变化时有状态组件位置继承漂移）
  if (oldCs.length !== newCs.length) {
    detectMissingKey(newCs, `children（长度 ${oldCs.length} → ${newCs.length}）`)
  }
  // 全 keyed：身份映射复用（增删/重排——状态跟随 key）
  if (listKind(newCs) === 'all-keyed' && listKind(oldCs) === 'all-keyed') {
    await diffKeyedChildren(oldCs, newCs, id, emit, emitCommand, ctx, registry)
    return
  }
  // 全 unkeyed / 混合：位置身份对照（混合数组——无 key 项位置接管）
  let lastRef: string | null = null
  const maxLen = Math.max(oldCs.length, newCs.length)
  for (let i = 0; i < maxLen; i++) {
    const oldC = oldCs[i] ?? null
    const newC = newCs[i] ?? null
    const cid = pathId(id, i)
    await diffSlot(oldC, newC, id, i, lastRef, cid, emit, emitCommand, ctx, registry)
    lastRef = cid
  }
}

/** 单槽对照（unkeyed 位置身份——文本/插入/移除/同态递归/异类型转换） */
async function diffSlot(
  oldC: VNodeChild | null, newC: VNodeChild | null,
  parent: string, index: number, ref: string | null, cid: string,
  emit: RenderSink, emitCommand: (cmd: Command) => void,
  ctx: Ctx, registry: ComponentRegistry,
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
  // 新项不存在（数组缩短）→ 移除
  if (newC === null || newC === undefined) {
    emitCommand({ op: 'remove', id: cid })
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
  // 异类型转换（transform——旧侧让位 + 新侧渲染）
  const t = transitionOf(stateOf(oldC), stateOf(newC))
  if (t) {
    await t(oldC, newC, { emit: emitCommand, oldId: cid, newId: cid, parent, ref })
  }
  await emit(newC, parent, index, ref)
}

/** keyed 列表对照（身份映射——planKeyedDiff——增删/重排状态跟随 key）
 *  首版：整块重建 + 组件实例复用（.k{key}——工厂不重跑——状态保持——
 *  DOM 重建；位置保持项 diffSame 精准/移动节点 move 为后续优化——已知限制） */
async function diffKeyedChildren(
  oldCs: VNodeChild[], newCs: VNodeChild[], parent: string,
  emit: RenderSink, emitCommand: (cmd: Command) => void,
  ctx: Ctx, registry: ComponentRegistry,
): Promise<void> {
  // 1. 移除旧全部（重建——组件实例经 .k{key} 复用——状态保持）
  oldCs.forEach((_, i) => emitCommand({ op: 'remove', id: pathId(parent, i) }))
  // 2. 按新顺序渲染（组件复用——工厂不重跑——输出全量）
  let lastRef: string | null = null
  for (let i = 0; i < newCs.length; i++) {
    const newC = newCs[i]
    const k = keyOf(newC)
    if (k !== null && typeof (newC as VNode).type === 'function') {
      await emitWithKey(newC, parent, i, lastRef, k, emit, ctx, registry)
    } else {
      await emit(newC, parent, i, lastRef)
    }
    lastRef = pathId(parent, i)
  }
}

/** keyed 项渲染（compId = 位置路径 + .k{key}——身份稳定——增删/重排复用） */
async function emitWithKey(
  v: VNodeChild, parent: string, index: number, ref: string | null, key: string,
  emit: RenderSink, ctx: Ctx, registry: ComponentRegistry,
): Promise<void> {
  const vn = v as VNode
  if (typeof vn.type === 'function') {
    // 组件：keyed compId（`{parent}.k{key}`——**位置无关**——增删/重排复用）
    const keyedId = `${parent}.k${key}`
    await renderComponent(vn, parent, index, ref, keyedId, ctx, registry, emit)
    return
  }
  await emit(v, parent, index, ref)
}
