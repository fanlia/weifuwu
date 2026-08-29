/**
 * vdom v2 — 调度流（render$——buffer + flush——batching）
 *
 * VDOM-V2-BLUEPRINT 阶段 1d：
 * - render() 请求 = 流 next——**同微任务拍 N 次 → 1 次渲染循环**（React 18
 *   同级优化——渲染频率防线）
 * - 渲染中请求 → 排队（下拍 flush——FIFO 不丢——v1 语义保持）
 * - 透明：request/flush 可 tap（频率/合并率——调度可视化）
 */
import type { Observable } from '../../observable/index.ts'
import { Subject } from '../../observable/index.ts'
import { spyEvent } from './spy.ts'

export interface RenderScheduler {
  /** 请求渲染（同拍合并——batching） */
  request(): void
  /** 渲染执行点（订阅——每次 flush 触发一次） */
  renders$: Observable<void>
  /** 统计（透明——合并率诊断） */
  stats(): { requested: number; flushed: number }
}

/** 创建调度流（微任务拍合并——渲染中合并排队）——**连续重渲染上限**
 *  （防风暴：渲染回调内无条件 request → 无限循环——Map 爆炸实证——
 *  超限丢弃 + warn——v1 MAX_RENDER_ERRORS 同类防御） */
export function createRenderScheduler(): RenderScheduler {
  const renders = new Subject<void>()
  let requested = 0
  let flushed = 0
  let pending = false        // 微任务已排（拍内有待 flush）
  let running = false        // 渲染中（请求排队——下拍 flush）
  let consecutive = 0        // 连续重渲染计数（无间隔 = 风暴）
  const MAX_CONSECUTIVE = 20

  const flush = (): void => {
    pending = false
    if (running) return
    running = true
    try {
      consecutive++
      spyEvent('sched:flush')
      renders.next()
      // 正常完成（非风暴）——计数重置（下拍更新是合法流）
      setTimeout(() => { if (consecutive <= MAX_CONSECUTIVE) consecutive = 0 }, 0)
    } finally {
      running = false
      if (pending) {
        if (consecutive >= MAX_CONSECUTIVE) {
          console.warn('[vdom] v2 调度：连续重渲染超限（', consecutive, '）——请求丢弃（渲染风暴防护）')
          pending = false
        } else {
          pending = false
          queueMicrotask(flush)
        }
      }
    }
  }

  return {
    request(): void {
      requested++
      // **渲染中请求：标记 pending（flush finally 会再排一次——不丢）**
      if (running) { pending = true; return }
      if (pending) return // 已排——合并（1 拍 1 次）
      pending = true
      queueMicrotask(flush)
    },
    renders$: renders.asObservable(),
    stats: () => ({ requested, flushed: flushed + 0 }),
  }
}
