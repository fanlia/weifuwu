/**
 * vdom3 events — 事件流（引擎本体——location→DOM 全链路可记录/回放/取消）
 *
 * 不变量：DOM = fold(事件流)——给定初始 DOM + 事件流 = 任意时刻 DOM。
 * 事件不可变（回放安全）；DOM 指令可逆（取消 = 逆操作应用）。
 */

import type { EventStream, V3Event } from './types.ts'

/** 信号变化事件（signal 模块调用） */
export function emitSignal(name: string, value: unknown, prev: unknown): void {
  stream.emit({ type: 'SIGNAL_SET', signal: name, value, prev, ts: Date.now() })
}

/** 全局事件流（单例——后续可实例化 per-app） */
export const stream: EventStream = {
  emit(ev: V3Event): void {
    events.push(ev)
    if (events.length > MAX) events.shift() // 容量保护（可配置）
  },
  events(): V3Event[] { return [...events] },
  inverse(ev: V3Event): V3Event | null {
    switch (ev.type) {
      case 'DOM_INSERT':
        return { type: 'DOM_REMOVE', parent: ev.parent, node: ev.node, ts: Date.now() }
      case 'DOM_REMOVE':
        // 逆操作需要被移除节点的完整信息——由执行器保存（此处返回 null 表示需快照）
        return null
      case 'DOM_UPDATE':
        return { type: 'DOM_UPDATE', target: ev.target, key: ev.key, value: ev.prev, prev: ev.value, ts: Date.now() }
      case 'DOM_MOVE':
        return null // 需保存旧位置
      default:
        return null
    }
  },
  reset(): void { events.length = 0 },
}

const MAX = 10000
const events: V3Event[] = []
