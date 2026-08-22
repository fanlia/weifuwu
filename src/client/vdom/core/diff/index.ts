/**
 * vdom core/diff — index（diff 阶段中转站）
 *
 * 职责：**中转站——自身不处理细节逻辑**——root 级对照决策
 * （transitionOf 查表——异态交 transform / 同态交 diffSame）——细节
 * 下沉独立模块：
 * - same.ts：同态对照决策（组件/元素分支——再中转）
 * - attrs.ts：属性值比较（精准命令）
 * - children.ts：children 对照 + keyed 列表策略
 * - output.ts：组件输出对照（null ↔ vnode/数组对照）
 * - cleanup.ts：旧输出递归清理
 * - transform/：类型转换状态机（异态执行）
 */

import type { VNode } from '../vnode.ts'
import { stateOf } from '../transform/states.ts'
import { transitionOf } from '../transform/table.ts'
import { createRenderDispatcher, type RenderSink } from '../build.ts'
import type { ComponentRegistry } from '../node/component.ts'
import type { UIContext } from '../../context/UIContext.ts'
import type { Command } from '../command/index.ts'
import { diffSame } from './same.ts'

/**
 * diff：旧树 → 新树——精准增量命令事件流
 * ctx：组件共享上下文；registry：组件实例注册表（跨渲染保持）
 */
export function diffStream(
  oldTree: VNode,
  newTree: VNode,
  ctx: UIContext,
  registry: ComponentRegistry,
): ReadableStream<Command> {
  return new ReadableStream<Command>({
    async start(controller) {
      const emitCommand = (cmd: Command) => controller.enqueue(cmd)
      const emit: RenderSink = createRenderDispatcher(emitCommand, ctx, registry)

      // ── root 对照（中转决策——异态交 transform / 同态交 diffSame） ──
      const oldState = stateOf(oldTree)
      const newState = stateOf(newTree)
      const t = transitionOf(oldState, newState)
      if (t) {
        // 异类型（整树替换）：transform 完整转换（旧侧让位 + 新侧渲染）
        await t(oldTree, newTree, {
          emit: emitCommand,
          emitNode: emit,
          oldId: 'root.0',
          newId: 'root.0',
          parent: 'root',
          index: 0,
          ref: null,
          registry,
        })
      } else {
        // 同态：对照（组件/元素——细节在 same.ts）
        await diffSame(oldTree, newTree, 'root', 0, null, emit, emitCommand, ctx, registry)
      }
      emitCommand({ op: 'done' })
      controller.close()
    },
  })
}
