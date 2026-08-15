/**
 * vdom3 events — 事件流（引擎本体——渲染全程可记录/回放/取消）
 *
 * 不变量：DOM = fold(事件流)——初始 DOM + 事件序列 = 任意时刻 DOM。
 * 事件不可变；DOM 指令可逆（取消 = 应用逆事件）。
 */

import type { EventStream, V3Event } from './types.ts'

export function createEventStream(max = 20000): EventStream {
  // 环形缓冲（head/tail 指针——溢出不 shift——O(1) emit）
  const buf: V3Event[] = []
  let head = 0
  let len = 0
  const at = (i: number): V3Event => buf[(head + i) % max]
  const set = (i: number, ev: V3Event): void => { buf[(head + i) % max] = ev }
  return {
    emit(ev: V3Event): void {
      if (len < max) { set(len, ev); len++ }
      else { set(0, ev); head = (head + 1) % max }
    },
    events(): V3Event[] {
      const out: V3Event[] = new Array(len)
      for (let i = 0; i < len; i++) out[i] = at(i)
      return out
    },
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
    reset(): void { head = 0; len = 0 },
  }
}

/** 全局流（默认实例——后续 per-app 实例化） */
export const stream = createEventStream()

/** 节点 id 分配（渲染指令目标定位） */
let nodeUid = 0
export function nextNodeId(): string {
  return `n${++nodeUid}`
}
