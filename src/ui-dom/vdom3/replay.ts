/**
 * vdom3 replay — 事件流回放 / 取消 / 断言（DOM = fold(事件流)）
 *
 * 回放（replay）：从目标容器重放事件流——node:create 建节点（id→节点映射）、
 * node:insert 挂载、prop:text update 应用——结果 = 原渲染的 DOM（fold 不变量）。
 *
 * 取消（undo）：从事件流末尾取 N 个事件 → 应用逆操作——insert→remove、
 * remove→恢复（registry 保存的节点）、update→恢复 prev。
 *
 * 断言（eventsOf/hasEvent）：渲染 = 事件序列断言（测试/调试）。
 *
 * 事件统一命名：对象 + 动作 + 参数（entity + action + target + payload）——
 * 键格式 `entity:action`（如 'node:create'）。
 */

import type { V3Event, EventStream } from './types.ts'
import { NodeRegistry } from './registry.ts'

/** 事件键（entity:action） */
function key(ev: V3Event): string {
  return `${ev.entity}:${ev.action}`
}

/** 应用单个事件（流式客户端逐事件消费——replay 循环的拆解） */
export function applyEvent(ev: V3Event, target: HTMLElement, reg: NodeRegistry): void {
  switch (key(ev)) {
    case 'node:create': {
      const pl = ev.payload as { tag: string; kind?: string }
      // 占位（阶段 1——空洞事件化）：kind=hole → 注释节点（DOM 与 children 同构——
      // 回放重建占位——与渲染同构）
      if (pl.kind === 'hole') {
        const hole = document.createComment('wf-hole')
        reg.register(ev.target!, hole)
        break
      }
      const el = document.createElement(pl.tag)
      el.setAttribute('data-v3-id', ev.target!)
      reg.register(ev.target!, el)
      break
    }
    case 'text:create': {
      const pl = ev.payload as { value: string }
      const t = document.createTextNode(pl.value)
      reg.register(ev.target!, t)
      break
    }
    case 'node:insert': {
      const pl = ev.payload as { parent: string; ref?: string | null }
      const parent = pl.parent === NodeRegistry.ROOT ? target : reg.resolveParent(pl.parent)
      const child = reg.get(ev.target!)
      const ref = pl.ref ? reg.get(pl.ref) : null
      if (parent && child) {
        if (ref && ref.parentNode === parent) parent.insertBefore(child, ref)
        else parent.appendChild(child)
      }
      break
    }
    case 'node:remove': {
      const child = reg.get(ev.target!)
      if (child?.parentNode) child.parentNode.removeChild(child)
      break
    }
    case 'node:move': {
      const pl = ev.payload as { parent: string; ref?: string | null }
      const node = reg.get(ev.target!)
      const parent = pl.parent === NodeRegistry.ROOT ? target : reg.resolveParent(pl.parent)
      const ref = pl.ref ? reg.get(pl.ref) : null
      if (node && parent && node.parentNode === parent) {
        if (ref && ref.parentNode === parent) parent.insertBefore(node, ref)
        else parent.appendChild(node)
      }
      break
    }
    case 'prop:update': {
      const pl = ev.payload as { key: string; value: unknown }
      const el = reg.get(ev.target!)
      if (el?.nodeType === 1) {
        if (pl.value == null || pl.value === false) (el as Element).removeAttribute(pl.key)
        else (el as Element).setAttribute(pl.key, String(pl.value))
      }
      break
    }
    case 'text:update': {
      const pl = ev.payload as { value: string }
      const el = reg.get(ev.target!)
      if (el?.nodeType === 3) el.nodeValue = pl.value
      break
    }
    default: break // route:change / comp:* 非 DOM 指令——跳过
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
  // 取最近的 n 个 DOM 指令（非 comp/route）
  const domEvents = events.filter((e) =>
    key(e) === 'node:insert' || key(e) === 'node:remove' || key(e) === 'prop:update' || key(e) === 'text:update' || key(e) === 'node:move',
  )
  const targets = domEvents.slice(-n)
  for (const ev of [...targets].reverse()) {
    switch (key(ev)) {
      case 'node:insert': {
        // 逆：移除插入的节点
        const child = reg.get(ev.target!)
        if (child?.parentNode) child.parentNode.removeChild(child)
        break
      }
      case 'node:remove': {
        // 逆：恢复被移除节点（registry 保存的快照）
        const pl = ev.payload as { parent: string }
        const node = reg.takeRemoved(ev.target!)
        const parent = pl.parent === NodeRegistry.ROOT ? null : reg.get(pl.parent)
        if (node && parent) parent.appendChild(node)
        break
      }
      case 'prop:update': {
        const pl = ev.payload as { key: string; prev: unknown }
        const el = reg.get(ev.target!)
        if (el?.nodeType === 1) {
          if (pl.prev == null || pl.prev === '') (el as Element).removeAttribute(pl.key)
          else (el as Element).setAttribute(pl.key, String(pl.prev))
        }
        break
      }
      case 'text:update': {
        const pl = ev.payload as { prev: string }
        const el = reg.get(ev.target!)
        if (el?.nodeType === 3) el.nodeValue = pl.prev
        break
      }
      case 'node:move': {
        // 逆：移回 prev 之后（prev 为空 → 移到父首）
        const pl = ev.payload as { parent: string; prev?: string | null }
        const node = reg.get(ev.target!)
        const parent = pl.parent === NodeRegistry.ROOT ? null : reg.get(pl.parent)
        if (node && parent && node.parentNode === parent) {
          if (pl.prev) {
            const prevNode = reg.get(pl.prev)
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

/** 断言工具：过滤事件（按 entity:action 键——如 'node:create'） */
export function eventsOf(events: V3Event[], type: string): V3Event[] {
  return events.filter((e) => key(e) === type)
}

/** 断言工具：是否存在匹配事件 */
export function hasEvent(events: V3Event[], predicate: (e: V3Event) => boolean): boolean {
  return events.some(predicate)
}

/** 断言：渲染 = 事件序列（测试——精确描述渲染做了什么；键格式 entity:action） */
export function expectEventSequence(events: V3Event[], expected: string[]): void {
  const actual = events.map(key)
  const diff = expected.map((t, i) => actual[i] === t).every(Boolean)
  if (!diff) {
    throw new Error(`事件序列不符：期望 [${expected.join(',')}] 实际 [${actual.slice(0, expected.length).join(',')}]`)
  }
}
