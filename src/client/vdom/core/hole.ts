/**
 * vdom core — hole（特殊值渲染——空洞占位 + 非法输入诊断——独立文件）
 *
 * 规则（AGENTS §4.0/§6.3——占位法）：
 * - 空洞（null/undefined/boolean——无渲染值）→ 占位锚节点
 *   （<!--wf-hole: xxx-->）——**childNodes 长度恒等于 children 数组长度**
 *   （数组第 i 项 ⟷ childNodes 第 i 个节点——同构不变量——对齐从结构上
 *   保证——不靠消费侧猜测）——filter(Boolean) 是红线（消除空洞破坏长度）
 * - 非法输入（对象/数字 type/未知 Symbol）→ 诊断占位 + warn（不崩溃不静默）
 * - 占位是静态的零 resolve 回调——≠ 动态挂载占位——不触发任何补渲染
 */

import type { Command } from './commands.ts'

/** 空洞判定（无渲染值——false/null/undefined/true——占位法保同构） */
export function isHole(v: unknown): boolean {
  return v === null || v === undefined || typeof v === 'boolean'
}

/** 非法输入判定（对象/数字 type/未知 Symbol——诊断占位 + warn） */
export function isInvalid(v: unknown): boolean {
  if (v === null || v === undefined || typeof v === 'boolean') return false
  if (typeof v === 'string' || typeof v === 'number') return false
  if (Array.isArray(v)) return false
  if (typeof v === 'object' && (typeof (v as { type?: unknown }).type === 'string')) return false
  if (typeof (v as { type?: unknown }).type === 'function') return false
  if (typeof (v as { type?: unknown }).type === 'symbol') return false
  return true
}

/** 非法输入诊断信息（warn 提示——不崩溃） */
export function invalidDiagnostic(v: unknown): string {
  if (v === null || v === undefined) return 'null/undefined'
  if (typeof v === 'object') {
    const t = (v as { type?: unknown }).type
    return `object（type: ${typeof t}）`
  }
  return typeof v
}

/** 占位锚命令对（createAnchor + insert——同构长度恒定） */
export function holeCommands(id: string, parent: string, ref: string | null, detail?: string): Command[] {
  return [
    { op: 'createAnchor', id, ...(detail !== undefined ? { detail } : {}) },
    { op: 'insert', id, parent, ref },
  ]
}

/** 占位锚入队（controller 直发——render/hydrate 共用） */
export function emitHole(
  controller: ReadableStreamDefaultController<Command>,
  id: string,
  parent: string,
  ref: string | null,
  detail?: string,
): void {
  for (const cmd of holeCommands(id, parent, ref, detail)) controller.enqueue(cmd)
}
