/**
 * vdom core — native（原生元素节点渲染——独立文件）
 *
 * 规则（AGENTS §4.0——原生元素 = string type）：
 * - 渲染序列：create（attrs 序列化面）→ insert → children 递归（sink——
 *   任意嵌套/空洞/组件统一出口——async）→ close（服务端闭合标签时机）
 * - attrs 序列化面：事件/ref/children/key 排除（函数值不可序列化——
 *   服务端吐 HTML 用——运行时面走 setProp）
 * - 单文本子节点扁平（h 单子节点形态——childrenOf 统一序列）
 */

import type { VNode } from '../vnode.ts'
import { childrenOf } from './children.ts'
import type { Command } from '../command/index.ts'
import type { ComponentSink } from './component.ts'

/** 节点 id——确定性路径（root.0.a0——锚点法——组件实例隔离） */
export function pathId(parent: string, i: number): string {
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

/** 原生元素渲染（create → insert → children 递归 → close——
 *  ref prop → **ref 指令**（insert 后——挂载完成）） */
export async function renderNative(
  vn: VNode,
  id: string,
  parent: string,
  ref: string | null,
  emitCommand: (cmd: Command) => void,
  sink: ComponentSink,
): Promise<void> {
  emitCommand({ op: 'create', id, tag: vn.type as string, attrs: serializableAttrs(vn.props) })
  // 运行时面（事件——函数值）→ setProp 命令（apply 绑定——
  // create 后立即发——节点已在表——挂载前绑定无碍）
  for (const [k, v] of Object.entries(vn.props)) {
    if (k === 'children' || k === 'key' || k === 'ref') continue
    if (typeof v === 'function') emitCommand({ op: 'setProp', id, key: k, value: v })
  }
  emitCommand({ op: 'insert', id, parent, ref })
  // **ref 指令（DOM 生命周期——挂载完成）**：insert 后发——patch 消费时
  // el 已连接——ref(el) 回调
  const refFn = vn.props.ref
  if (typeof refFn === 'function') emitCommand({ op: 'ref', id, fn: refFn })
  const cs = childrenOf(vn)
  let lastRef: string | null = null
  for (const [i, c] of cs.entries()) {
    await sink(c, id, i, lastRef)
    lastRef = pathId(id, i)
  }
  emitCommand({ op: 'close', id })
}
