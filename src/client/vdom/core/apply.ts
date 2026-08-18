/**
 * vdom core — applyCommand（命令 → DOM 操作——客户端消费）
 *
 * 设计（design/vdom-plan.md §3）：res.body.getReader() → 逐条 command →
 * apply 到 DOM。节点表（id → DOM 节点）随命令流构建。
 *
 * 属性三通道（AGENTS §4.0）：setProp 按通道分发——
 *   on[A-Z] → events（事件绑定）
 *   PROPERTY_KEYS → props（DOM property——value/checked...）
 *   ref → props.applyRef（挂载/卸载回调）
 *   其余 → attributes（setAttribute/style/enumerated 白名单）
 */

import type { Command } from './commands.ts'
import { applyAttribute, applyStyle } from './attributes.ts'
import { applyProperty, applyRef, isPropertyKey } from './props.ts'
import { bindEvent, EVENT_RE } from './events.ts'

export type WfNode = HTMLElement | Text | Comment

/** create 携带的 attrs——静态可序列化面（class/id/style/data-*） */
export function applyAttrs(el: HTMLElement, attrs: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'style') {
      applyStyle(el, v)
    } else {
      applyAttribute(el, k, v)
    }
  }
}

/** setProp 三通道分发 */
export function applySetProp(el: HTMLElement, key: string, value: unknown, prev?: unknown): void {
  if (key === 'ref') {
    applyRef(el, value, prev)
  } else if (EVENT_RE.test(key)) {
    bindEvent(el, key, value, prev)
  } else if (isPropertyKey(key)) {
    applyProperty(el, key, value)
  } else {
    applyAttribute(el, key, value)
  }
}

export class CommandApplier {
  private nodes = new Map<string, WfNode>()
  private container: HTMLElement
  private doc: Document

  constructor(container: HTMLElement, doc: Document) {
    this.container = container
    this.doc = doc
  }

  apply(cmd: Command): void {
    switch (cmd.op) {
      case 'create': {
        const el = this.doc.createElement(cmd.tag)
        applyAttrs(el, cmd.attrs)
        this.nodes.set(cmd.id, el)
        break
      }
      case 'createText':
        this.nodes.set(cmd.id, this.doc.createTextNode(cmd.value))
        break
      case 'createAnchor':
        this.nodes.set(cmd.id, this.doc.createComment('wf-hole'))
        break
      case 'insert': {
        const el = this.nodes.get(cmd.id)
        if (!el) return
        const parent = cmd.parent === 'root' ? this.container : (this.nodes.get(cmd.parent) as HTMLElement | null)
        if (!parent) return
        const ref = cmd.ref ? (this.nodes.get(cmd.ref) ?? null) : null
        parent.insertBefore(el, ref)
        break
      }
      case 'setText': {
        const t = this.nodes.get(cmd.id)
        if (t instanceof Text) t.textContent = cmd.value
        break
      }
      case 'setProp': {
        const el = this.nodes.get(cmd.id)
        if (el instanceof HTMLElement) applySetProp(el, cmd.key, cmd.value, cmd.prev)
        break
      }
      case 'remove': {
        this.nodes.get(cmd.id)?.remove()
        break
      }
      case 'close':
      case 'unmountComp':
      case 'done':
        break
    }
  }
}
