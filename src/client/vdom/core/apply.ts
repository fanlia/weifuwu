/**
 * vdom core — applyCommand（命令 → DOM 操作——客户端消费）
 *
 * 设计（design/vdom-plan.md §3）：res.body.getReader() → 逐条 command →
 * apply 到 DOM。节点表（id → DOM 节点）随命令流构建。
 *
 * 本文件为初始最小实现：create/createText/createAnchor/insert/setText/
 * close(no-op)/done(no-op)——事件/ref 绑定（setProp）后续实现。
 */

import type { Command } from './commands.ts'

export type WfNode = HTMLElement | Text | Comment

/** 静态属性应用（create 携带的 attrs——可序列化面） */
export function applyAttrs(el: HTMLElement, attrs: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue
    if (k === 'class' || k === 'className') {
      el.setAttribute('class', String(v))
    } else if (k === 'style' && typeof v === 'object' && v !== null) {
      for (const [sk, sv] of Object.entries(v)) {
        ;(el.style as any)[sk] = sv
      }
    } else {
      el.setAttribute(k, String(v))
    }
  }
}

export class CommandApplier {
  private nodes = new Map<string, WfNode>()
  private container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container
  }

  apply(cmd: Command): void {
    switch (cmd.op) {
      case 'create': {
        const el = document.createElement(cmd.tag)
        applyAttrs(el, cmd.attrs)
        this.nodes.set(cmd.id, el)
        break
      }
      case 'createText':
        this.nodes.set(cmd.id, document.createTextNode(cmd.value))
        break
      case 'createAnchor':
        this.nodes.set(cmd.id, document.createComment('wf-hole'))
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
      case 'setProp':
        // 运行时面（事件/ref/property）——后续实现
        break
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
