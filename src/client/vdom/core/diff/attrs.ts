/**
 * vdom core/diff — attrs（属性精准 diff——值比较——最小命令集）
 *
 * 职责（diff 层的细节模块）：静态面值比较（只发变化键 + 旧有新的没有 →
 * undefined 移除）；函数面引用比较（prev !== next 才发——prev 传递）。
 */

import type { VNode } from '../vnode.ts'
import type { Command } from '../command/index.ts'
import { serializableAttrs } from '../node/native.ts'

/** 属性精准 diff（值比较——只发变化的键；函数面引用比较——prev 传递）
 *
 * **表单控件 value 特判（2027-09——输入残留实证）**：opts.formControl=true
 * 时 value 键**总是发**（即使渲染树新旧等值）——用户打字/IME 直改 DOM
 * 值（渲染树从不感知——打字零渲染类优化）——清空到 '' 时 diff 的旧渲染
 * 树值可能同为 '' → 不发 → DOM 残留旧文本——总是发 + patch 端现值比较
 * （同值不上 DOM——无副作用；异值必写——程序化清空/回流修复） */
export function diffAttrs(
  oldV: VNode, newV: VNode, id: string, emitCommand: (cmd: Command) => void,
  opts?: { formControl?: boolean },
): void {
  // 静态面（可序列化）——值比较——只发变化键；旧有新的没有 → 移除
  const oldAttrs = serializableAttrs(oldV.props)
  const newAttrs = serializableAttrs(newV.props)
  for (const [k, v] of Object.entries(newAttrs)) {
    if (k === 'value' && opts?.formControl) {
      // 表单控件 value：总是发（patch 现值比较——同值无副作用）
      emitCommand({ op: 'setProp', id, key: k, value: v })
    } else if (oldAttrs[k] !== v) {
      emitCommand({ op: 'setProp', id, key: k, value: v })
    }
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
  // **差集对称（定理 4——G4）**：旧有新无的函数键 → setProp undefined
  // （解绑——事件表/ref 表残留是结构性违例——旧 handler 继续触发——
  //  fuzz/探针实证）——静态面已有旧侧遍历——函数面必须对称
  for (const k of Object.keys(oldV.props)) {
    if (k === 'children' || k === 'key') continue
    if (typeof oldV.props[k] === 'function' && newV.props[k] === undefined) {
      emitCommand({ op: 'setProp', id, key: k, value: undefined, prev: oldV.props[k] })
    }
  }
}

