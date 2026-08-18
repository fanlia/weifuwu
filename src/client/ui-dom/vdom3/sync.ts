/**
 * vdom3 sync — 多端同步（事件流 = 操作日志 → 镜像容器）
 *
 * 协作基础：一端渲染/交互 → 事件流（操作日志）→ 另一端增量应用（applyEvent）→
 * DOM 同构——**无需重放全量**（增量同步——日志位置游标）。
 *
 * 裁剪（诚实）：单向往复（一端事件 → 多端镜像）；双向 OT/冲突解决不在本层
 * （事件流是不可变日志——双向 = 双方各自日志 + 合并策略——后续工作）。
 */

import type { V3Event } from './types.ts'
import { NodeRegistry } from './registry.ts'
import { applyEvent } from './replay.ts'

export interface SyncHandle {
  /** 增量应用新事件（返回本批应用数）——新事件到达时调用 */
  sync(): number
  /** 已应用事件数（日志游标） */
  applied(): number
  /** 最近一次同步的截断事件流（诊断） */
  lastBatch(): V3Event[]
}

/** 创建多端镜像：目标容器 + 事件日志源（getEvents）→ 增量同步 */
export function createSync(target: HTMLElement, getEvents: () => V3Event[]): SyncHandle {
  const reg = new NodeRegistry()
  reg.register(NodeRegistry.ROOT, target)
  target.innerHTML = ''
  let applied = 0
  let lastBatch: V3Event[] = []
  return {
    sync(): number {
      const evs = getEvents()
      const batch = evs.slice(applied)
      lastBatch = batch
      for (const ev of batch) applyEvent(ev, target, reg)
      applied = evs.length
      return batch.length
    },
    applied(): number { return applied },
    lastBatch(): V3Event[] { return [...lastBatch] },
  }
}

/** 自动同步（监听回调驱动的镜像——如 store 变化/WS 消息 → 自动 sync） */
export function autoSync(target: HTMLElement, getEvents: () => V3Event[], subscribe: (cb: () => void) => () => void): () => void {
  const handle = createSync(target, getEvents)
  handle.sync()
  return subscribe(() => { handle.sync() })
}
