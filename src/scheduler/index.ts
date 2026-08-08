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
import { parseCron, nextRun } from './cron.ts'

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
  /**
   * cron 定时任务（重复）：到点自动入队（name）。
   * 同 name 重复注册 = 覆盖更新（改表达式/数据直接重新注册，旧定义不残留）。
   * 定义持久化在 HASH——进程重启后守护循环恢复即继续触发（无需重新注册）。
   */
  cron: (expr: string, name: string, data?: unknown) => Promise<void>
  /** 取消 cron：删除定义 + 清理 ZSET 中该 cron 的 pending 触发点（不再触发） */
  cancelCron: (name: string) => Promise<boolean>
  /** 取消未到期的延时任务（按 id；已到期入队/已执行的不受影响） */
  cancelSchedule: (id: string) => Promise<boolean>
}

export interface SchedulerInjected {
  schedule: SchedulerClient['schedule']
  cron: SchedulerClient['cron']
  cancelCron: SchedulerClient['cancelCron']
  cancelSchedule: SchedulerClient['cancelSchedule']
}

declare module '../types.ts' {
  interface Context {
    schedule?: SchedulerClient['schedule']
    cron?: SchedulerClient['cron']
    cancelCron?: SchedulerClient['cancelCron']
    cancelSchedule?: SchedulerClient['cancelSchedule']
  }
}

export interface SchedulerClientModule extends Middleware<Context, Context & SchedulerInjected> {
  schedule: SchedulerClient['schedule']
  cron: SchedulerClient['cron']
  cancelCron: SchedulerClient['cancelCron']
  cancelSchedule: SchedulerClient['cancelSchedule']
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
  const cronsKey = `${prefix}crons`
  const connOpts = parseUrl(options)
  const queueModule = options.queue

  // 独立连接：守护循环专用（不占应用连接池）
  const conn = new RedisConnection(connOpts)
  let running = false
  let tickTimer: NodeJS.Timeout | null = null

  /** 守护循环：扫描到期延时任务 + 推进 cron next-run → 入队 */
  async function tick(): Promise<void> {
    // ── cron：读注册表 → 到期则原子推进 nextRunAt + 入队 ──
    await tickCrons()
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

  /**
   * cron 扫描：滚动生成到期触发点到延时 ZSET（ZADD NX 幂等，多实例不重复）
   * → 由延时扫描统一 ZREM 抢占入队（完全复用延时机制 + 原子性）
   */
  async function tickCrons(): Promise<void> {
    let crons: unknown
    try {
      crons = await conn.command('HGETALL', cronsKey)
    } catch {
      return
    }
    const now = Date.now()
    const entries = crons as string[]
    for (let i = 0; i + 1 < entries.length; i += 2) {
      const field = entries[i]
      const value = entries[i + 1]
      let def: { expr: string; name: string; data: unknown; nextRunAt: number }
      try {
        def = JSON.parse(value)
      } catch {
        continue
      }
      const parsed = parseCron(def.expr)
      let next = def.nextRunAt
      // 生成 [nextRunAt, now] 区间内所有到期触发点（每个 = 唯一 ZSET member）
      while (next <= now) {
        const ts = next
        const member = JSON.stringify({ id: `cron:${field}:${ts}`, name: def.name, data: def.data })
        try {
          await conn.command('ZADD', delayedKey, 'NX', ts, member) // NX：多实例只加一次
        } catch {
          break
        }
        next = nextRun(parsed, new Date(ts)).getTime()
      }
      if (next !== def.nextRunAt) {
        // 推进 nextRunAt（幂等：重复 tick 计算同值）
        await conn.command('HSET', cronsKey, field, JSON.stringify({ ...def, nextRunAt: next }))
      }
    }
  }

  const cron: SchedulerClient['cron'] = async (expr, name, data) => {
    const parsed = parseCron(expr) // 非法表达式立即抛错（诚实裁剪）
    const firstRun = nextRun(parsed, new Date())
    // field = name（唯一）：同 name 重新注册 = HSET 覆盖——改表达式不残留旧定义
    const def = JSON.stringify({ expr, name, data, nextRunAt: firstRun.getTime() })
    await conn.command('HSET', cronsKey, name, def)
  }

  const cancelCron: SchedulerClient['cancelCron'] = async (name) => {
    // 1. 删 HASH 定义
    const removed = await conn.command('HDEL', cronsKey, name)
    // 2. 清理 ZSET 中该 cron 的 pending 触发点（member = {"id":"cron:{name}:{ts}"...}）
    try {
      const pending = (await conn.command('ZRANGE', delayedKey, 0, -1)) as string[]
      for (const member of pending) {
        if (member.includes(`"id":"cron:${name}:`)) {
          await conn.command('ZREM', delayedKey, member)
        }
      }
    } catch {
      // 清理失败不影响取消结果（定义已删，tick 不再生成）
    }
    return removed === 1
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

  const cancelSchedule: SchedulerClient['cancelSchedule'] = async (id) => {
    // 扫描 ZSET pending 触发点，按 member JSON 的 id 精确匹配删除
    try {
      const pending = (await conn.command('ZRANGE', delayedKey, 0, -1)) as string[]
      for (const member of pending) {
        if (member.includes(`"id":"${id}"`)) {
          const removed = await conn.command('ZREM', delayedKey, member)
          if (removed === 1) return true
        }
      }
    } catch {
      // 扫描失败返回 false（连接瞬断——下个 tick 不受影响）
    }
    return false
  }

  const mw = (async (req: Request, ctx: Context, next: Handler) => {
    ctx.schedule = schedule
    ctx.cron = cron
    ctx.cancelCron = cancelCron
    ctx.cancelSchedule = cancelSchedule
    return next(req, ctx)
  }) as unknown as SchedulerClientModule

  mw.__meta = { injects: ['schedule', 'cron', 'cancelCron', 'cancelSchedule'], depends: ['queue'] }
  mw.schedule = schedule
  mw.cron = cron
  mw.cancelCron = cancelCron
  mw.cancelSchedule = cancelSchedule
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
