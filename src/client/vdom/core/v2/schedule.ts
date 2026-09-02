/**
 * vdom v2 — 调度流（render$——buffer + flush——batching）
 *
 * v2 引擎蓝图 阶段 1d：
 * - render() 请求 = 流 next——**同微任务拍 N 次 → 1 次渲染循环**（React 18
 *   同级优化——渲染频率防线）
 * - 渲染中请求 → 排队（下拍 flush——FIFO 不丢——v1 语义保持）
 * - 透明：request/flush 可 tap（频率/合并率——调度可视化）
 *
 * VDOM-OBSERVABLE-OPTIMIZE 波次 3（时序显式化）：
 * - **风暴检测流化**：consecutive 计数清零原为 setTimeout(0)（隐式时序——
 *   同拍双 flush 竞态隐患）——改为**事件间隔判定**（距上次 flush < 16ms =
 *   连续风暴计数；≥ 16ms = 合法下拍流——重置）——无 timer hack
 * - **request 观测点**：spyEvent('sched:request')——时间线回放原料 +
 *   诊断器频率轴直接数据源
 * - **可回放**：request 时间线（spy 事件）→ 重喂 → 同 flush 序列
 *   （回放测试——记录/重放标准模式）
 */
import type { Observable } from '../../observable/index.ts'
import { Subject } from '../../observable/index.ts'
import { spyEvent } from './spy.ts'

export interface RenderScheduler {
  /** 请求渲染（**来源 tag——W4 诊断归因**：navigate/component-rerender/timer——
   *  渲染健康频率轴可归因——默认 'unknown'）——同拍合并（batching） */
  request(source?: string): void
  /** 渲染执行点（订阅——每次 flush 触发一次） */
  renders$: Observable<void>
  /** 统计（透明——合并率诊断） */
  stats(): { requested: number; flushed: number }
}

/** 风暴间隔阈值（< 16ms = 连续拍——风暴计数——16ms ≈ 一帧） */
const STORM_GAP_MS = 16
/** 连续重渲染上限（超限丢弃 + warn——v1 MAX_RENDER_ERRORS 同类防御） */
const MAX_CONSECUTIVE = 20

function performanceNow(): number {
  return (globalThis as { performance?: { now(): number } }).performance?.now?.() ?? Date.now()
}

/** 创建调度流（微任务拍合并——渲染中合并排队） */
export function createRenderScheduler(): RenderScheduler {
  const renders = new Subject<void>()
  let requested = 0
  let flushed = 0
  let pending = false        // 微任务已排（拍内有待 flush）
  let running = false        // 渲染中（请求排队——下拍 flush）
  let consecutive = 0        // 连续风暴计数（间隔判定——无 timer 清零）
  let lastFlushAt = 0

  const flush = (): void => {
    pending = false
    if (running) return
    running = true
    try {
      const now = performanceNow()
      // **风暴检测（事件间隔——显式时序）**：距上次 flush < 16ms →
      // 连续（同拍循环风暴——计数）；≥ 16ms → 合法下拍流（重置）
      consecutive = now - lastFlushAt < STORM_GAP_MS ? consecutive + 1 : 0
      lastFlushAt = now
      flushed++
      spyEvent('sched:flush')
      renders.next()
    } finally {
      running = false
      if (pending) {
        if (consecutive >= MAX_CONSECUTIVE) {
          console.warn('[vdom] v2 调度：连续重渲染超限（', consecutive, '）——请求丢弃（渲染风暴防护）')
          pending = false
        } else {
          queueMicrotask(flush)
        }
      }
    }
  }

  return {
    request(source?: string): void {
      requested++
      spyEvent('sched:request', source ?? 'unknown')
      // **渲染中请求：标记 pending（flush finally 会再排一次——不丢）**
      if (running) { pending = true; return }
      if (pending) return // 已排——合并（1 拍 1 次）
      pending = true
      queueMicrotask(flush)
    },
    renders$: renders.asObservable(),
    stats: () => ({ requested, flushed }),
  }
}
