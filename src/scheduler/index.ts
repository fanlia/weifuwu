/**
 * scheduler 中间件 — 延时任务（迭代 2）
 *
 * ctx.schedule(name, data, { delayMs | when }) → ZSET（score=触发时间戳）
 * → 守护循环（独立连接 + 定时扫描）到期 ZREM（原子抢占，多实例安全）
 * → queue.add（复用 queue 可靠执行）
 *
 * 依赖：queue（参数传入——触发后入队执行）
 */

import { randomUUID } from 'node:crypto'
import type { Context, Handler, Middleware } from '../types.ts'
import { RedisConnection, type RedisConnectionOptions } from '../db/redis/connection.ts'
import type { QueueClientModule } from '../queue/index.ts'

export interface SchedulerOptions {
  /** Redis 连接串（默认 REDIS_URL） */
  url?: string
  /** key 前缀。默认 'wf:sched:'。 */
  prefix?: string
  /** 守护循环扫描间隔 ms。默认 1000（延时任务精度上限）。 */
  tickMs?: number
  /** queue 模块（触发后入队）——应用已 `const q = queue()` 时传入复用 */
  queue: QueueClientModule
}

export interface ScheduleOptions {
  /** 延迟 ms（>=0，0 = 尽快，下一 tick 触发） */
  delayMs?: number
  /** 指定触发时间（Date） */
  when?: Date
}

export interface SchedulerClient {
  /**
   * 延时任务（单次）：delayMs 或 when 指定触发时间。
   * 到期自动入队（name）——由 queue.worker 消费。
   */
  schedule: (name: string, data: unknown, opts?: ScheduleOptions) => Promise<{ id: string }>
}

export interface SchedulerInjected {
  schedule: SchedulerClient['schedule']
}

declare module '../types.ts' {
  interface Context {
    schedule?: SchedulerClient['schedule']
  }
}

export interface SchedulerClientModule extends Middleware<Context, Context & SchedulerInjected> {
  schedule: SchedulerClient['schedule']
  /** 关闭守护循环 + 连接 */
  close: () => Promise<void>
}

function parseUrl(options?: SchedulerOptions): RedisConnectionOptions {
  const url = options?.url ?? process.env.REDIS_URL ?? 'redis://localhost:6379'
  const u = new URL(url)
  return { host: u.hostname, port: Number(u.port || 6379) }
}

export function scheduler(options: SchedulerOptions): SchedulerClientModule {
  const prefix = options.prefix ?? 'wf:sched:'
  const tickMs = options.tickMs ?? 1000
  const delayedKey = `${prefix}delayed`
  const connOpts = parseUrl(options)
  const queueModule = options.queue

  // 独立连接：守护循环专用（不占应用连接池）
  const conn = new RedisConnection(connOpts)
  let running = false
  let tickTimer: NodeJS.Timeout | null = null

  /** 守护循环：扫描到期任务 → ZREM 原子抢占 → 入队 */
  async function tick(): Promise<void> {
    let due: unknown
    try {
      due = await conn.command('ZRANGEBYSCORE', delayedKey, 0, Date.now())
    } catch {
      return // 连接未就绪/瞬断——下一 tick 重试
    }
    for (const member of due as string[]) {
      let removed: unknown
      try {
        removed = await conn.command('ZREM', delayedKey, member)
      } catch {
        return
      }
      // 只有抢占成功（ZREM 返回 1）的实例入队——多实例不重复
      if (removed !== 1) continue
      try {
        const task = JSON.parse(member) as { id: string; name: string; data: unknown }
        await queueModule.queue.add(task.name, task.data)
      } catch (e) {
        console.error('[scheduler] enqueue:', e instanceof Error ? e.message : e)
      }
    }
  }

  async function start(): Promise<void> {
    if (running) return
    running = true
    await conn.connect()
    // 先补一次到期扫描（进程重启后恢复：ZSET 里的到期任务立即触发）
    await tick()
    tickTimer = setInterval(() => {
      tick().catch((e) => console.error('[scheduler] tick:', e instanceof Error ? e.message : e))
    }, tickMs)
    tickTimer.unref?.()
  }

  const schedule: SchedulerClient['schedule'] = async (name, data, opts = {}) => {
    const delayMs = opts.delayMs ?? 0
    const runAt = opts.when ? opts.when.getTime() : Date.now() + delayMs
    if (!Number.isFinite(runAt)) throw new Error('scheduler: invalid when/delayMs')
    const id = randomUUID()
    const member = JSON.stringify({ id, name, data })
    await conn.command('ZADD', delayedKey, runAt, member)
    return { id }
  }

  const mw = (async (req: Request, ctx: Context, next: Handler) => {
    ctx.schedule = schedule
    return next(req, ctx)
  }) as unknown as SchedulerClientModule

  mw.__meta = { injects: ['schedule'], depends: ['queue'] }
  mw.schedule = schedule
  mw.close = async () => {
    running = false
    if (tickTimer) {
      clearInterval(tickTimer)
      tickTimer = null
    }
    await conn.close().catch(() => {})
  }

  // 守护循环启动（模块初始化即开始扫描——与 queue worker 同模式）
  start().catch((e) => console.error('[scheduler] start:', e instanceof Error ? e.message : e))

  return mw
}
