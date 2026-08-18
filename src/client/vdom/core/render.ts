/**
 * vdom core — renderToStream（vnode → 命令流）
 *
 * 设计（design/vdom-plan.md §3）：渲染 = 命令流——首帧命令同步入队
 * （start 内立即 enqueue——无需等待）——async 组件 resolve 后增量续推——
 * stream 关闭 = 渲染完成。无占位/无补渲染/无 resolve 回调。
 *
 * 本文件为初始最小实现：同步遍历 vnode 树生成命令（前序——create 携带
 * attrs + children 递归 + close）——增量更新（diff/async 组件）后续实现。
 */

import type { VNode, VNodeChild } from './vnode.ts'
import { childrenOf } from './vnode.ts'
import type { Command } from './commands.ts'

/** 节点 id——确定性路径（root.0.a0——锚点法——组件实例隔离） */
function pathId(parent: string, i: number): string {
  return `${parent}.${i}`
}

/** 可序列化属性面（服务端吐 HTML 用）——事件/ref/函数值排除 */
export function serializableAttrs(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    if (k === 'children' || k === 'key' || k === 'ref') continue
    if (typeof v === 'function') continue
    out[k] = v
  }
  return out
}

/**
 * vnode → ReadableStream<Command>
 * 前序遍历：create（含 attrs）→ 子节点递归 → close → insert 顺序见命令序
 * （先建后插——apply 侧按序执行——父子关系由 parent/ref id 确定）
 */
export function renderToStream(root: VNode): ReadableStream<Command> {
  return new ReadableStream<Command>({
    start(controller) {
      const emit = (v: VNodeChild, parent: string, index: number, ref: string | null) => {
        const id = pathId(parent, index)
        // 文本/数字 → createText + insert
        if (typeof v === 'string' || typeof v === 'number') {
          controller.enqueue({ op: 'createText', id, value: String(v) })
          controller.enqueue({ op: 'insert', id, parent, ref })
          return
        }
        // 空洞（false/null/undefined/boolean）→ 占位锚（同构——长度恒定）
        if (v === null || v === undefined || typeof v === 'boolean') {
          controller.enqueue({ op: 'createAnchor', id })
          controller.enqueue({ op: 'insert', id, parent, ref })
          return
        }
        // 数组（防御——childrenOf 已展开；任意嵌套=隐式 Fragment 由递归覆盖）
        if (Array.isArray(v)) {
          for (const [i, c] of v.entries()) emit(c, parent, index + i, ref)
          return
        }
        // 元素
        if (typeof v.type === 'string') {
          controller.enqueue({ op: 'create', id, tag: v.type, attrs: serializableAttrs(v.props) })
          controller.enqueue({ op: 'insert', id, parent, ref })
          // children 统一 emit（childrenOf 已递归展开——文本/空洞/元素同一路径）
          const cs = childrenOf(v)
          let lastRef: string | null = null
          cs.forEach((c, i) => {
            emit(c, id, i, lastRef)
            lastRef = pathId(id, i)
          })
          controller.enqueue({ op: 'close', id })
          return
        }
        // 组件/符号——后续实现（组件工厂/diff）
        controller.enqueue({ op: 'createAnchor', id })
        controller.enqueue({ op: 'insert', id, parent, ref })
      }
      emit(root, 'root', 0, null)
      controller.enqueue({ op: 'done' })
      controller.close()
    },
  })
}
