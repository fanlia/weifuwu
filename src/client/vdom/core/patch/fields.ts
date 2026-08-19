/**
 * vdom core/patch — fields（属性应用——三通道分发）
 *
 * 职责：create attrs 静态面应用（attribute/style）；setProp 三通道
 * （ref → RefRegistry / 事件 → EventRegistry / property / attribute）。
 */

import type { Command } from '../command/index.ts'
import { applyAttribute } from '../field/attributes.ts'
import { applyStyle } from '../field/style.ts'
import { applyProperty, isPropertyKey } from '../field/props.ts'
import { eventName, EVENT_RE } from '../field/events.ts'
import type { EventRegistry } from '../field/events.ts'

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

/** setProp 三通道分发（事件 → **代理注册**（事件表——不直接绑定）） */
export function applySetProp(
  registry: EventRegistry, nodeId: string, el: HTMLElement, key: string, value: unknown, prev?: unknown,
): void {
  if (key === 'ref') {
    // ref 由 RefRegistry 管理（patch 处理——此处不直接应用）
    return
  } else if (EVENT_RE.test(key)) {
    const name = eventName(key)
    if (name) registry.set(nodeId, name, value)
  } else if (key === 'style') {
    // **style 独立通道**（真实 bug）：diff 更新走 applyAttribute（对象
    // String 化不生效——style 永不更新——拖拽 live 等）——create 路径
    // 有 style 分支——setProp 路径必须一致
    applyStyle(el, value)
  } else if (isPropertyKey(key)) {
    applyProperty(el, key, value)
  } else {
    applyAttribute(el, key, value)
  }
}

