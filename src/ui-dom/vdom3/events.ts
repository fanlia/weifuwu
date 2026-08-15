/**
 * vdom3 events — 事件流（引擎本体——渲染全程可记录/回放/取消）
 *
 * 不变量：DOM = fold(事件流)——初始 DOM + 事件序列 = 任意时刻 DOM。
 * 事件不可变；DOM 指令可逆（取消 = 应用逆事件）。
 */

import type { EventStream, V3Event, Entity, Action } from './types.ts'

/** 事件构造（统一命名：对象 + 动作 + 参数——每层同构） */
export function ev(entity: Entity, action: Action, target?: string, payload?: Record<string, unknown>): V3Event {
  const e: V3Event = { entity, action, ts: Date.now() }
  if (target != null) e.target = target
  if (payload != null) e.payload = payload
  return e
}

/** 事件键（断言/审计：'comp:render'——对象:动作） */
export function evKey(ev: V3Event): string {
  return `${ev.entity}:${ev.action}`
}

export function createEventStream(max = 20000): EventStream {
  // 环形缓冲（head/tail 指针——溢出不 shift——O(1) emit）
  const buf: V3Event[] = []
  let head = 0
  let len = 0
  const at = (i: number): V3Event => buf[(head + i) % max]
  const set = (i: number, evt: V3Event): void => { buf[(head + i) % max] = evt }
  return {
    emit(evt: V3Event): void {
      if (len < max) { set(len, evt); len++ }
      else { set(0, evt); head = (head + 1) % max }
    },
    events(): V3Event[] {
      const out: V3Event[] = new Array(len)
      for (let i = 0; i < len; i++) out[i] = at(i)
      return out
    },
    inverse(evt: V3Event): V3Event | null {
      switch (evt.entity + ':' + evt.action) {
        case 'node:insert':
          return ev('node', 'remove', evt.target, { parent: evt.payload?.parent })
        case 'node:remove':
          return null // 逆操作需保存被移除节点完整信息——执行器快照配合
        case 'prop:update':
          return ev('prop', 'update', evt.target, { key: evt.payload?.key, value: evt.payload?.prev, prev: evt.payload?.value })
        case 'text:update':
          return ev('text', 'update', evt.target, { value: evt.payload?.prev, prev: evt.payload?.value })
        case 'node:move':
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
