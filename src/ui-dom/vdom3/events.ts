/**
 * vdom3 events — 事件流（引擎本体——渲染全程可记录/回放/取消）
 *
 * 不变量：DOM = fold(事件流)——初始 DOM + 事件序列 = 任意时刻 DOM。
 * 事件不可变；DOM 指令可逆（取消 = 应用逆事件）。
 */

import type { EventStream, V3Event } from './types.ts'

export function createEventStream(max = 20000): EventStream {
  const events: V3Event[] = []
  let uid = 0
  return {
    emit(ev: V3Event): void {
      events.push(ev)
      if (events.length > max) events.shift()
    },
    events(): V3Event[] { return [...events] },
    inverse(ev: V3Event): V3Event | null {
      switch (ev.type) {
        case 'INSERT':
          return { type: 'REMOVE', parent: ev.parent, child: ev.child, ts: Date.now() }
        case 'REMOVE':
          return null // 逆操作需保存被移除节点完整信息——执行器快照配合
        case 'PROP_UPDATE':
          return { type: 'PROP_UPDATE', target: ev.target, key: ev.key, value: ev.prev, prev: ev.value, ts: Date.now() }
        case 'TEXT_UPDATE':
          return { type: 'TEXT_UPDATE', target: ev.target, value: ev.prev, prev: ev.value, ts: Date.now() }
        case 'MOVE':
          return null // 需保存旧位置
        default:
          return null
      }
    },
    reset(): void { events.length = 0 },
  }
}

/** 全局流（默认实例——后续 per-app 实例化） */
export const stream = createEventStream()

/** 节点 id 分配（渲染指令目标定位） */
let nodeUid = 0
export function nextNodeId(): string {
  return `n${++nodeUid}`
}
