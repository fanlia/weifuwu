/**
 * vdom core — diff 阶段（旧树 vs 新树 → **command 事件流**）
 *
 * 四阶段管线（2026-12 决策）：route → build → diff → patch
 * - route：UIRouter 匹配（shared Trie）
 * - build：vnode → command 事件流（build.ts——首帧/新树构建）
 * - diff：旧树 vs 新树 → **command 事件流**（本文件——transform 状态机消费）
 * - patch：command 事件流 → DOM（patch.ts——**唯一 DOM 接触点**——
 *   diff/build 零 DOM 操作——纯事件流生产者——可流式/可序列化/可重放）
 *
 * **不是就地 patch**：diff 的产物是 command 事件流（增量更新命令——
 * setText/setProp/remove/insert/unmountComp）——事件流经 NDJSON 字节
 * 可传输（Response body）——patch 阶段消费（同一进程或服务端）。
 *
 * 首版范围（诚实裁剪）：
 * - 首帧（oldTree 不存在）→ 全量 build 命令流（等价 build）
 * - 更新（oldTree 存在）→ 增量命令：同位置同类型元素 → 属性 setProp +
 *   children 递归；文本 → setText；组件同类型复用（工厂不重跑——
 *   renderFn 重新调用——lastOutput 对照）；异类型 → transform 转换
 *   （旧侧让位 remove/unmountComp——新侧 build）
 *
 * 增量迭代：keyed 列表/空洞↔真实互换（transform 完整落地）。
 */

import type { VNode, VNodeChild } from './vnode.ts'
import { kindOf, textOf } from './node/index.ts'
import { childrenOf } from './node/children.ts'
import { emitHole, invalidDiagnostic } from './node/hole.ts'
import { isPortal, PORTAL_ID_PREFIX } from './node/portal.ts'
import { pathId, renderNative, serializableAttrs } from './node/native.ts'
import { renderComponent, createComponentRegistry, type ComponentRegistry } from './node/component.ts'
import { stateOf } from './transform/states.ts'
import { transitionOf } from './transform/table.ts'
import type { Ctx } from '../context/Ctx.ts'
import type { Command } from './command/index.ts'

/**
 * diff：旧树 → 新树——更新命令流
 * ctx：组件共享上下文（serve 创建）；registry：组件实例注册表（跨渲染保持）
 */
export function diffStream(
  oldTree: VNode | null,
  newTree: VNode,
  ctx: Ctx,
  registry: ComponentRegistry,
): ReadableStream<Command> {
  return new ReadableStream<Command>({
    async start(controller) {
      const emitCommand = (cmd: Command) => controller.enqueue(cmd)
      const emit = async (v: VNodeChild, parent: string, index: number, ref: string | null): Promise<void> => {
        const id = pathId(parent, index)
        switch (kindOf(v)) {
          case 'text': {
            const text = textOf(v)!
            emitCommand({ op: 'createText', id, value: text })
            emitCommand({ op: 'insert', id, parent, ref })
            return
          }
          case 'hole': {
            emitHole(controller, id, parent, ref)
            return
          }
          case 'array': {
            for (const [i, c] of (v as VNodeChild[]).entries()) await emit(c, parent, index + i, ref)
            return
          }
          case 'fragment': {
            const cs = childrenOf(v as VNode)
            let lastRef: string | null = ref
            for (const [i, c] of cs.entries()) {
              await emit(c, parent, index + i, lastRef)
              lastRef = pathId(parent, index + i)
            }
            return
          }
          case 'portal': {
            const key = (v as VNode).key ?? 'default'
            const base = `${PORTAL_ID_PREFIX}${key}`
            emitCommand({ op: 'createAnchor', id })
            emitCommand({ op: 'insert', id, parent, ref })
            const cs = childrenOf(v as VNode)
            let lastRef: string | null = null
            for (const [i, c] of cs.entries()) {
              await emit(c, base, i, lastRef)
              lastRef = pathId(base, i)
            }
            return
          }
          case 'element': {
            await renderNative(v as VNode, id, parent, ref, emitCommand, emit)
            return
          }
          case 'component': {
            await renderComponent(v as VNode, parent, index, ref, id, ctx, registry, emit)
            return
          }
          case 'invalid': {
            console.warn(`[vdom] 非法子节点——${invalidDiagnostic(v)}`)
            emitHole(controller, id, parent, ref, invalidDiagnostic(v))
            return
          }
        }
      }

      // ── diff 主循环（同位置对照——首版最小）──
      if (!oldTree) {
        // 首帧：全量 build
        await emit(newTree, 'root', 0, null)
      } else {
        // root 级对照（oldTree/newTree 同位置）——异类型 → 整树原子替换
        const oldState = stateOf(oldTree)
        const newState = stateOf(newTree)
        const t = transitionOf(oldState, newState)
        if (t) {
          // transform 转换（旧侧让位——新侧 build 到同一位置）
          await t(oldTree, newTree, {
            emit: emitCommand,
            oldId: 'root.0',
            newId: 'root.0',
            parent: 'root',
            ref: null,
          })
          await emit(newTree, 'root', 0, null)
        } else {
          // 同态：diffSame（增量命令——同位置同类型组件复用/元素属性更新）
          await diffSame(oldTree, newTree, 'root', 0, null, emit, emitCommand, ctx, registry)
        }
      }
      emitCommand({ op: 'done' })
      controller.close()
    },
  })
}

/** 同态对照（同位置同类型——生成增量命令：属性 setProp/文本 setText/children 递归） */
async function diffSame(
  oldV: VNode | null,
  newV: VNode,
  parent: string,
  index: number,
  ref: string | null,
  emit: (v: VNodeChild, parent: string, index: number, ref: string | null) => Promise<void>,
  emitCommand: (cmd: Command) => void,
  ctx: Ctx,
  registry: ComponentRegistry,
): Promise<void> {
  const id = pathId(parent, index)
  // 组件同类型复用（工厂不重跑——renderFn 重新调用——输出对照上次——就地 patch）
  if (typeof newV.type === 'function') {
    const rec = registry.get(id)
    const oldOut = rec?.lastOutput ?? null
    await renderComponent(newV, parent, index, ref, id, ctx, registry, async (out, p, i, r) => {
      // 上次输出对照：就地 patch（不重建）；无上次输出（首帧）→ 全量 build
      if (oldOut !== null && oldOut !== undefined) {
        await diffSame(oldOut as VNode, out as VNode, p, i, r, emit, emitCommand, ctx, registry)
      } else {
        await emit(out, p, i, r)
      }
    })
    return
  }
  // 元素同标签：属性更新 + children 递归对照
  if (typeof newV.type === 'string' && oldV && typeof oldV.type === 'string' && oldV.type === newV.type) {
    // 属性 diff（首版：序列化面全量 setProp——增量比较后续）
    for (const [k, v] of Object.entries(serializableAttrs(newV.props))) {
      emitCommand({ op: 'setProp', id, key: k, value: v })
    }
    // children 对照（位置递归）
    const oldCs = oldV ? childrenOf(oldV) : []
    const newCs = childrenOf(newV)
    let lastRef: string | null = null
    const maxLen = Math.max(oldCs.length, newCs.length)
    for (let i = 0; i < maxLen; i++) {
      const oldC = oldCs[i] ?? null
      const newC = newCs[i] ?? null
      const cid = pathId(id, i)
      // 文本 ↔ 文本：就地 setText（不重建节点——焦点保持）
      if (typeof oldC === 'string' && typeof newC === 'string') {
        emitCommand({ op: 'setText', id: cid, value: newC })
      } else if (typeof oldC === 'number' && typeof newC === 'number') {
        emitCommand({ op: 'setText', id: cid, value: String(newC) })
      } else if (newC === null || newC === undefined) {
        // 旧项多余——移除（旧侧让位）
        emitCommand({ op: 'remove', id: cid })
      } else if (oldC === null || oldC === undefined || typeof oldC === 'boolean') {
        // 新项插入（旧位是空洞——锚移除 + 插入）
        if (oldC === null || oldC === undefined || typeof oldC === 'boolean') {
          emitCommand({ op: 'remove', id: cid })
        }
        await emit(newC, id, i, lastRef)
      } else if (kindOf(oldC) === kindOf(newC)) {
        await diffSame(oldC as VNode, newC as VNode, id, i, lastRef, emit, emitCommand, ctx, registry)
      } else {
        // 异类型转换（transform——旧侧让位 + 新侧 build）
        const t = transitionOf(stateOf(oldC), stateOf(newC))
        if (t) {
          await t(oldC, newC, { emit: emitCommand, oldId: cid, newId: cid, parent: id, ref: lastRef })
        }
        await emit(newC, id, i, lastRef)
      }
      lastRef = cid
    }
    return
  }
  // 文本同态（root 级——div('v1') → div('v2') 的 children 已在上方处理；
  // 此处兜底）——其余同态：新侧重建
  await emit(newV, parent, index, ref)
}
