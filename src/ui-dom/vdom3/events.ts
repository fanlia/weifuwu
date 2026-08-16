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

export function createEventStream(max = 20000, opts?: { watermark?: number }): EventStream {
  // 环形缓冲（head/tail 指针——溢出不 shift——O(1) emit）
  const buf: V3Event[] = []
  let head = 0
  let len = 0
  let overflowCount = 0
  let watermarkFired = false
  const watermark = opts?.watermark ?? 0.8
  // 实时订阅（emit 同步回调——缓冲溢出也不丢事件——观测/调试可靠通道）
  const listeners = new Set<(ev: V3Event) => void>()
  const at = (i: number): V3Event => buf[(head + i) % max]
  const set = (i: number, evt: V3Event): void => { buf[(head + i) % max] = evt }
  const emitOne = (evt: V3Event, suppressOverflow: boolean): void => {
    if (len < max) { set(len, evt); len++ }
    else {
      set(0, evt); head = (head + 1) % max
      // 溢出：最旧事件被覆盖（静默丢失）——纳入事件流（stream:overflow——
      // buffer 状态可观测；suppress 防 overflow 事件自身递归触发）
      if (!suppressOverflow) {
        overflowCount++
        // overflow 事件降频（每 64 次溢出一条——避免高频溢出自身占满缓冲成噪音）
        if (overflowCount % 64 === 1 || overflowCount === 1) {
          emitOne(ev('stream', 'overflow', undefined, {
            capacity: max,
            count: overflowCount,
            dropped: `${evt.entity}:${evt.action}`,
            droppedTarget: evt.target ?? null,
          }), true)
        }
      }
    }
  }
  return {
    emit(evt: V3Event): void {
      emitOne(evt, false)
      // 水位预警（达到阈值发一次 stream:watermark——早于溢出的提醒——可观测；
      // watermark <= 0 禁用——纯溢出语义隔离）
      if (watermark > 0 && !watermarkFired && len >= max * watermark) {
        watermarkFired = true
        emitOne(ev('stream', 'watermark', undefined, { usage: len, capacity: max, ratio: watermark }), true)
      }
      for (const fn of listeners) { try { fn(evt) } catch { /* 订阅者失败隔离 */ } }
    },
    /** 实时订阅（emit 同步回调——不丢事件——返回退订）。
     *  重载（见 EventStream 类型）：subscribe(fn) 全部；subscribe(filter, fn) 按层过滤 */
    subscribe(filterOrFn: Entity[] | Entity | ((ev: V3Event) => void), maybeFn?: (ev: V3Event) => void): () => void {
      const filter = typeof filterOrFn === 'function' ? null : filterOrFn
      const fn = typeof filterOrFn === 'function' ? filterOrFn as (ev: V3Event) => void : maybeFn!
      const wrapped = (ev: V3Event) => {
        if (filter == null) { fn(ev); return }
        const list = Array.isArray(filter) ? filter : [filter]
        if (list.includes(ev.entity)) fn(ev)
      }
      listeners.add(wrapped)
      return () => { listeners.delete(wrapped) }
    },
    /** 当前有效条数（缓冲占用） */
    size(): number { return len },
    /** 缓冲容量 */
    capacity(): number { return max },
    /** 溢出次数（最旧事件被覆盖的次数——事件丢失可审计） */
    overflowCount(): number { return overflowCount },
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
    reset(): void { head = 0; len = 0; overflowCount = 0; watermarkFired = false },
  }
}

/** 全局流（默认实例——后续 per-app 实例化） */
export const stream = createEventStream()

/** 节点 id 分配（渲染指令目标定位） */
let nodeUid = 0
export function nextNodeId(): string {
  return `n${++nodeUid}`
}
