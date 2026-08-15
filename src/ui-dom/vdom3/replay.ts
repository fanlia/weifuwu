/**
 * vdom3 replay — 事件流回放 / 取消 / 断言（DOM = fold(事件流)）
 *
 * 回放（replay）：从目标容器重放事件流——NODE_CREATE 建节点（id→节点映射）、
 * INSERT 挂载、PROP/TEXT_UPDATE 应用——结果 = 原渲染的 DOM（fold 不变量）。
 *
 * 取消（undo）：从事件流末尾取 N 个事件 → 应用逆操作——INSERT→REMOVE、
 * REMOVE→恢复（registry 保存的节点）、PROP/TEXT_UPDATE→恢复 prev。
 *
 * 断言（eventsOf/hasEvent）：渲染 = 事件序列断言（测试/调试）。
 */

import type { V3Event, EventStream } from './types.ts'
import { NodeRegistry } from './registry.ts'

/** 应用单个事件（流式客户端逐事件消费——replay 循环的拆解） */
export function applyEvent(ev: V3Event, target: HTMLElement, reg: NodeRegistry): void {
  switch (ev.type) {
    case 'NODE_CREATE': {
      const el = document.createElement(ev.tag)
      el.setAttribute('data-v3-id', ev.id)
      reg.register(ev.id, el)
      break
    }
    case 'TEXT_CREATE': {
      const t = document.createTextNode(ev.value)
      reg.register(ev.id, t)
      break
    }
    case 'INSERT': {
      const parent = ev.parent === NodeRegistry.ROOT ? target : reg.resolveParent(ev.parent)
      const child = reg.get(ev.child)
      const ref = ev.ref ? reg.get(ev.ref) : null
      if (parent && child) {
        if (ref && ref.parentNode === parent) parent.insertBefore(child, ref)
        else parent.appendChild(child)
      }
      break
    }
    case 'REMOVE': {
      const child = reg.get(ev.child)
      if (child?.parentNode) child.parentNode.removeChild(child)
      break
    }
    case 'MOVE': {
      const node = reg.get(ev.node)
      const parent = ev.parent === NodeRegistry.ROOT ? target : reg.resolveParent(ev.parent)
      const ref = ev.ref ? reg.get(ev.ref) : null
      if (node && parent && node.parentNode === parent) {
        if (ref && ref.parentNode === parent) parent.insertBefore(node, ref)
        else parent.appendChild(node)
      }
      break
    }
    case 'PROP_UPDATE': {
      const el = reg.get(ev.target)
      if (el?.nodeType === 1) {
        if (ev.value == null || ev.value === false) (el as Element).removeAttribute(ev.key)
        else (el as Element).setAttribute(ev.key, String(ev.value))
      }
      break
    }
    case 'TEXT_UPDATE': {
      const el = reg.get(ev.target)
      if (el?.nodeType === 3) el.nodeValue = ev.value
      break
    }
    default: break // ROUTE/COMP_* 非 DOM 指令——跳过
  }
}

/** 回放事件流到目标容器（DOM = fold(events)——结果与原始渲染同构） */
export function replay(events: V3Event[], target: HTMLElement, reg = new NodeRegistry()): void {
  reg.register(NodeRegistry.ROOT, target)
  target.innerHTML = ''
  for (const ev of events) applyEvent(ev, target, reg)
}

/** 取消：从事件流末尾取 n 个 DOM 指令 → 应用逆操作（撤销渲染变化） */
export function undo(events: V3Event[], n: number, reg = new NodeRegistry()): void {
  // 取最近的 n 个 DOM 指令（非 COMP/ROUTE）
  const domEvents = events.filter((e) =>
    e.type === 'INSERT' || e.type === 'REMOVE' || e.type === 'PROP_UPDATE' || e.type === 'TEXT_UPDATE' || e.type === 'MOVE',
  )
  const targets = domEvents.slice(-n)
  for (const ev of [...targets].reverse()) {
    switch (ev.type) {
      case 'INSERT': {
        // 逆：移除插入的节点
        const child = reg.get(ev.child)
        if (child?.parentNode) child.parentNode.removeChild(child)
        break
      }
      case 'REMOVE': {
        // 逆：恢复被移除节点（registry 保存的快照）
        const node = reg.takeRemoved(ev.child)
        const parent = ev.parent === NodeRegistry.ROOT ? null : reg.get(ev.parent)
        if (node && parent) parent.appendChild(node)
        break
      }
      case 'PROP_UPDATE': {
        const el = reg.get(ev.target)
        if (el?.nodeType === 1) {
          if (ev.prev == null || ev.prev === '') (el as Element).removeAttribute(ev.key)
          else (el as Element).setAttribute(ev.key, String(ev.prev))
        }
        break
      }
      case 'TEXT_UPDATE': {
        const el = reg.get(ev.target)
        if (el?.nodeType === 3) el.nodeValue = ev.prev
        break
      }
      case 'MOVE': {
        // 逆：移回 prev 之后（prev 为空 → 移到父首）
        const node = reg.get(ev.node)
        const parent = ev.parent === NodeRegistry.ROOT ? null : reg.get(ev.parent)
        if (node && parent && node.parentNode === parent) {
          if (ev.prev) {
            const prevNode = reg.get(ev.prev)
            if (prevNode && prevNode.parentNode === parent) parent.insertBefore(node, prevNode.nextSibling)
          } else {
            parent.insertBefore(node, parent.firstChild)
          }
        }
        break
      }
      default: break
    }
  }
}

/** 断言工具：过滤事件（按类型/谓词） */
export function eventsOf(events: V3Event[], type: V3Event['type']): V3Event[] {
  return events.filter((e) => e.type === type)
}

/** 断言工具：是否存在匹配事件 */
export function hasEvent(events: V3Event[], predicate: (e: V3Event) => boolean): boolean {
  return events.some(predicate)
}

/** 断言：渲染 = 事件序列（测试——精确描述渲染做了什么） */
export function expectEventSequence(events: V3Event[], expected: V3Event['type'][]): void {
  const actual = events.map((e) => e.type)
  const diff = expected.map((t, i) => actual[i] === t).every(Boolean)
  if (!diff) {
    throw new Error(`事件序列不符：期望 [${expected.join(',')}] 实际 [${actual.slice(0, expected.length).join(',')}]`)
  }
}
