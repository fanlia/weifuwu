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

import type { Command } from './command/index.ts'
import { applyAttribute } from './attributes.ts'
import { applyStyle } from './style.ts'
import { applyProperty, isPropertyKey } from './props.ts'
import { applyRef } from './ref.ts'
import { bindEvent, EVENT_RE } from './events.ts'
import { PORTAL_CONTAINER_ID, PORTAL_ID_PREFIX, portalContainerId } from './portal.ts'

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
  private portalContainers = new Map<string, HTMLElement>()

  constructor(container: HTMLElement, doc: Document) {
    this.container = container
    this.doc = doc
  }

  /** portal 容器（#__wf_portal 下按 key——惰性创建——挂 body） */
  private portalContainer(key: string): HTMLElement {
    let c = this.portalContainers.get(key)
    if (c) return c
    let host = this.doc.getElementById(PORTAL_CONTAINER_ID)
    if (!host) {
      host = this.doc.createElement('div')
      host.id = PORTAL_CONTAINER_ID
      this.doc.body.appendChild(host)
    }
    c = this.doc.createElement('div')
    c.id = portalContainerId(key)
    host.appendChild(c)
    this.portalContainers.set(key, c)
    return c
  }

  /** 父节点解析（root/portal 容器/节点表）——portal 子节点在节点表
   *  （id 前缀 portal:——'portal:menu.0' 是内容节点；'portal:menu' 是容器） */
  private parentOf(cmd: { parent: string }): HTMLElement | null {
    if (cmd.parent === 'root') return this.container
    if (cmd.parent.startsWith(PORTAL_ID_PREFIX)) {
      const node = this.nodes.get(cmd.parent)
      if (node) return node as HTMLElement
      return this.portalContainer(cmd.parent.slice(PORTAL_ID_PREFIX.length))
    }
    return (this.nodes.get(cmd.parent) as HTMLElement | null) ?? null
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
        this.nodes.set(cmd.id, this.doc.createComment(cmd.detail ? `wf-hole: ${cmd.detail}` : 'wf-hole'))
        break
      case 'insert': {
        const el = this.nodes.get(cmd.id)
        if (!el) return
        const parent = this.parentOf(cmd)
        if (!parent) return
        // ref = 已插入的**前一个兄弟**（流式渲染——后一个尚未插入）——
        // 插到 prev 之后；ref null = 追加尾部
        const prev = cmd.ref ? (this.nodes.get(cmd.ref) ?? null) : null
        parent.insertBefore(el, prev ? prev.nextSibling : null)
        break
      }
      case 'setText': {
        const t = this.nodes.get(cmd.id)
        if (t && t.nodeType === 3) t.textContent = cmd.value
        break
      }
      case 'setProp': {
        const el = this.nodes.get(cmd.id)
        // nodeType 判断（jsdom 隔离环境——instanceof 跨 realm 恒 false）
        if (el && el.nodeType === 1) applySetProp(el as HTMLElement, cmd.key, cmd.value, cmd.prev)
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
