/**
 * vdom core — renderToStream（vnode → 命令流）
 *
 * 设计（design/vdom-plan.md §3）：渲染 = 命令流——首帧命令同步入队
 * （start 内立即 enqueue——无需等待）——async 组件 resolve 后增量续推——
 * stream 关闭 = 渲染完成。无占位/无补渲染/无 resolve 回调。
 *
 * 节点分发（node.ts kindOf 唯一判定点——渲染职责归各文件）：
 * - text → 文本节点（createText + insert）
 * - hole/invalid → hole.ts（占位锚/诊断占位——长度恒定）
 * - array/fragment → children.ts（隐式 Fragment 展开）
 * - element → native.ts（create + children 递归 + close）
 * - portal → portal.ts（插槽锚 + 内容到 portal 容器）
 * - component → component.ts（两阶段工厂 + renderFn——可 await）
 */

import type { VNode, VNodeChild } from './vnode.ts'
import { childrenOf } from './children.ts'
import { kindOf, textOf } from './node.ts'
import { emitHole, invalidDiagnostic } from './hole.ts'
import { isPortal, PORTAL_ID_PREFIX } from './portal.ts'
import { pathId, renderNative } from './native.ts'
import { renderComponent, createComponentRegistry, type ComponentRegistry } from './component.ts'
import type { Ctx } from '../context/Ctx.ts'
import type { Command } from './command/index.ts'

/**
 * vnode → ReadableStream<Command>
 * 前序遍历：create（含 attrs）→ 子节点递归 → close → insert 顺序见命令序
 * （先建后插——apply 侧按序执行——父子关系由 parent/ref id 确定）。
 *
 * ctx：组件共享上下文（serve 创建——render/data/onUnmount/browser/ui）
 * registry：组件实例注册表（同位置同类型复用——工厂不重跑——diff 消费）
 */
export function renderToStream(
  root: VNode,
  ctx?: Ctx,
  registry?: ComponentRegistry,
): ReadableStream<Command> {
  const sharedCtx = (ctx ?? {}) as Ctx
  const reg = registry ?? createComponentRegistry()
  return new ReadableStream<Command>({
    async start(controller) {
      const emitCommand = (cmd: Command) => controller.enqueue(cmd)
      const emit = async (v: VNodeChild, parent: string, index: number, ref: string | null): Promise<void> => {
        const id = pathId(parent, index)
        switch (kindOf(v)) {
          // 文本 → createText + insert
          case 'text': {
            const text = textOf(v)!
            controller.enqueue({ op: 'createText', id, value: text })
            controller.enqueue({ op: 'insert', id, parent, ref })
            return
          }
          // 空洞 → 占位锚（hole.ts——同构——长度恒定）
          case 'hole': {
            emitHole(controller, id, parent, ref)
            return
          }
          // 数组（防御——childrenOf 已展开——任意嵌套=隐式 Fragment）
          case 'array': {
            for (const [i, c] of (v as VNodeChild[]).entries()) await emit(c, parent, index + i, ref)
            return
          }
          // Fragment 符号 vnode（`<></>`——与数组同义——展开）
          case 'fragment': {
            const cs = childrenOf(v as VNode)
            let lastRef: string | null = ref
            for (const [i, c] of cs.entries()) {
              await emit(c, parent, index + i, lastRef)
              lastRef = pathId(parent, index + i)
            }
            return
          }
          // Portal（浮层——usePopup 内部机制）：主树插槽占位锚 + 内容
          // create/insert 到 portal 容器（parent = 'portal:<key>'——apply 侧
          // 解析容器 id——命名空间隔离——与主树 id 永不冲突）
          case 'portal': {
            const key = (v as VNode).key ?? 'default'
            const base = `${PORTAL_ID_PREFIX}${key}`
            controller.enqueue({ op: 'createAnchor', id })
            controller.enqueue({ op: 'insert', id, parent, ref })
            const cs = childrenOf(v as VNode)
            let lastRef: string | null = null
            for (const [i, c] of cs.entries()) {
              await emit(c, base, i, lastRef)
              lastRef = pathId(base, i)
            }
            return
          }
          // 元素 → native.ts（create + children 递归 + close）
          case 'element': {
            await renderNative(v as VNode, id, parent, ref, emitCommand, emit)
            return
          }
          // 组件 → component.ts（两阶段工厂 + renderFn——可 await——
          // compId = 锚点 id——同位置同类型复用）
          case 'component': {
            await renderComponent(v as VNode, parent, index, ref, id, sharedCtx, reg, emit)
            return
          }
          // 非法输入——诊断占位 + warn（hole.ts——不崩溃不静默）
          case 'invalid': {
            console.warn(`[vdom] 非法子节点——${invalidDiagnostic(v)}`)
            emitHole(controller, id, parent, ref, invalidDiagnostic(v))
            return
          }
        }
      }
      await emit(root, 'root', 0, null)
      controller.enqueue({ op: 'done' })
      controller.close()
    },
  })
}
