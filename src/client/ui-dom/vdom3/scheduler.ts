/**
 * vdom3 scheduler — 渲染调度（同 tick 合并 + 批处理 + 防死循环）
 *
 * 语义：
 *  - schedule(fn)：收集渲染请求——同 tick 多次 schedule 合并为一次 flush（微任务）
 *  - flush：批量执行（一次事件循环内所有待渲染请求）
 *  - 渲染中再次 schedule（组件 renderFn 内触发）→ 排队到下一轮（合并补跑）
 *  - 防死循环：单次 flush 内重渲染次数上限（吸取 vdom2 pending 死循环教训）
 */

const MAX_ITERATIONS = 10 // 单次 flush 内最大重渲染轮数（防死循环）

export class Scheduler {
  private queue: Array<() => void> = []
  private running = false
  private iterations = 0

  /** 调度渲染（同 tick 合并——微任务批量执行） */
  schedule(fn: () => void): void {
    this.queue.push(fn)
    if (!this.running) {
      this.running = true
      this.iterations = 0
      queueMicrotask(() => this.flush())
    }
  }

  /** 立即执行队列（测试/显式刷新用） */
  flush(): void {
    if (!this.running && this.queue.length === 0) return
    this.running = true
    do {
      if (++this.iterations > MAX_ITERATIONS) {
        console.error('[vdom3/scheduler] 渲染循环超限（疑似死循环）——中止本轮 flush')
        this.queue = []
        break
      }
      const batch = this.queue
      this.queue = []
      for (const fn of batch) {
        try { fn() } catch (e) { console.error('[vdom3/scheduler] render error:', e) }
      }
    } while (this.queue.length > 0)
    this.running = false
    this.iterations = 0
  }

  /** 待处理数量（测试断言——合并语义） */
  pending(): number {
    return this.queue.length
  }

  get isRunning(): boolean {
    return this.running
  }
}

/** 全局调度器（默认实例——后续 per-app 实例化）
 * 内部名 v3Scheduler：避免 esbuild bundle 顶层 var 提升为全局与
 * Chrome 只读 Web API window.scheduler 冲突（真实事故：普通 script 加载
 * 顶层 var 泄漏为全局 → Cannot assign to read only property 'scheduler'） */
const v3Scheduler = new Scheduler()
export { v3Scheduler as scheduler }
