/**
 * weifuwu/queue — 可靠任务队列（Redis Streams 消费组）
 *
 * 语义（文档红线）：
 *   - at-least-once：handler 可能重复执行（崩溃/超时重投）——幂等由业务保证
 *   - visibility timeout：处理失败不 XACK → 超时后被 XAUTOCLAIM 重新投递
 *   - attempts 用尽 → DLQ（q:{name}:dead）
 *   - 多 worker 实例安全：消费组内 entry 只被一个 consumer 处理
 *
 * 诚实裁剪：
 *   ✅ add / worker（concurrency / visibilityTimeout）/ 重试（固定间隔 =
 *      visibilityTimeout）/ DLQ / length
 *   ❌ 延迟调度、cron、优先级、指数退避、速率限制（间隔固定为
 *      visibilityTimeout）、流式进度（应用层实现）
 *
 * ```ts
 * import { queue } from 'weifuwu'
 *
 * const q = queue()          // 默认 REDIS_URL
 * app.use(q)                 // 注入 ctx.queue（handler 内 add）
 *
 * app.post('/api/jobs', async (req, ctx) => {
 *   await ctx.queue.add('llm.batch', { prompt: '...' }, { attempts: 3 })
 *   return accepted()
 * })
 *
 * const worker = q.worker('llm.batch', async (job) => {
 *   await runLLM(job.data)   // 失败 → 自动重试 → 用尽进 DLQ
 * }, { concurrency: 5, visibilityTimeout: 30_000 })
 * await worker.start()
 * ```
 */

import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import type { Context, Handler, Middleware } from '../types.ts'
import { RedisPool } from '../db/redis/pool.ts'

export interface QueueOptions {
  /** Redis 连接串（默认 REDIS_URL） */
  url?: string
  /** stream 名前缀。默认 'q:'。 */
  prefix?: string
  poolSize?: number
}

export interface AddOptions {
  /** 最大尝试次数（含首次）。默认 3。 */
  attempts?: number
}

export interface Job<T = unknown> {
  /** stream entry id */
  id: string
  data: T
  /** 已尝试次数 */
  attempts: number
  name: string
}

export interface WorkerOptions {
  /** 每次 XREADGROUP 批量拉取数（≈并发度）。默认 1。 */
  concurrency?: number
  /** 失败后重新投递间隔（ms）。默认 30_000。 */
  visibilityTimeout?: number
  /** 消费组 consumer 名（多实例自动 hostname-pid，可覆盖） */
  consumer?: string
}

export interface QueueWorker {
  /** 启动消费循环（阻塞直到 stop） */
  start: () => Promise<void>
  /** 优雅停止：停止拉取，等待 in-flight 完成 */
  stop: () => Promise<void>
}

export interface QueueClient {
  /** 入队（生产者） */
  add: (name: string, data: unknown, opts?: AddOptions) => Promise<{ id: string }>
  /** 创建 worker（消费者）。worker 独立于请求生命周期，启动时创建。 */
  worker: <T = unknown>(name: string, handler: (job: Job<T>) => Promise<void>, opts?: WorkerOptions) => QueueWorker
  /** 队列当前累积长度（XLEN）。注意：XACK 不删除 stream entry，
   *  消费后 length 不归零；待处理/进行中数量用 XPENDING（ctx.redis.command）。 */
  length: (name: string) => Promise<number>
}

export interface QueueInjected {
  queue: QueueClient
}

declare module '../types.ts' {
  interface Context {
    queue?: QueueClient
  }
}

export interface QueueClientModule extends Middleware<Context, Context & QueueInjected> {
  queue: QueueClient
  close: () => Promise<void>
}

const GROUP = 'workers'

function makePool(options?: QueueOptions): RedisPool {
  const url = options?.url ?? process.env.REDIS_URL ?? 'redis://localhost:6379'
  const u = new URL(url)
  return new RedisPool({
    host: u.hostname,
    port: Number(u.port || 6379),
    poolSize: options?.poolSize,
  })
}

export function queue(options?: QueueOptions): QueueClientModule {
  const prefix = options?.prefix ?? 'q:'
  const pool = makePool(options)
  const stream = (name: string) => `${prefix}${name}`
  const deadStream = (name: string) => `${prefix}${name}:dead`

  /** XADD 一个 job 到 stream（payload 序列化为单个 field） */
  async function pushJob(name: string, payload: Record<string, unknown>): Promise<string> {
    const id = await pool.command('XADD', stream(name), '*', 'payload', JSON.stringify(payload))
    return String(id)
  }

  const queueClient: QueueClient = {
    async add(name, data, opts) {
      const id = await pushJob(name, {
        id: randomUUID(),
        name,
        data,
        attempts: 0,
        maxAttempts: opts?.attempts ?? 3,
        addedAt: Date.now(),
      })
      return { id }
    },

    length: async (name) => Number(await pool.command('XLEN', stream(name))),

    worker<T = unknown>(name: string, handler: (job: Job<T>) => Promise<void>, opts?: WorkerOptions) {
      const consumer = opts?.consumer ?? `${hostname()}-${process.pid}-${Math.random().toString(36).slice(2, 6)}`
      const concurrency = opts?.concurrency ?? 1
      const visibilityTimeout = opts?.visibilityTimeout ?? 30_000
      const s = stream(name)
      const dead = deadStream(name)
      const delayed = `${prefix}${name}:delayed`

      let running = false
      const inflight = new Set<Promise<void>>()

      /** 消费组幂等创建 */
      async function ensureGroup(): Promise<void> {
        try {
          await pool.command('XGROUP', 'CREATE', s, GROUP, '0', 'MKSTREAM')
        } catch (e) {
          if (!String((e as Error).message).includes('BUSYGROUP')) throw e
        }
      }

      /** 处理一个 entry：成功 XACK；失败按 attempts 决定延迟重试（ZSET）或 DLQ */
      async function processEntry(entryId: string, fields: Record<string, string>): Promise<void> {
        let payload: Record<string, any>
        try {
          payload = JSON.parse(fields.payload ?? '{}')
        } catch {
          // 无法解析的 entry：XACK 丢弃 + 记 DLQ（避免无限重试坏消息）
          await pool.command('XACK', s, GROUP, entryId)
          await pool.command('XADD', dead, '*', 'payload', JSON.stringify({
            originalId: entryId, name, error: 'unparseable payload', attempts: -1,
          }))
          return
        }
        const attempts = Number(payload.attempts ?? 0)
        const maxAttempts = Number(payload.maxAttempts ?? 3)
        try {
          await handler({
            id: entryId,
            name,
            data: payload.data as T,
            attempts,
          })
          await pool.command('XACK', s, GROUP, entryId)
        } catch (err) {
          const nextAttempt = attempts + 1
          // 无论重试还是 DLQ 都先 XACK（清 pending）——entry 字段不可变，
          // attempts 计数必须持久化到新载体，否则重新 claim 读到旧值无限重试
          await pool.command('XACK', s, GROUP, entryId)
          if (nextAttempt >= maxAttempts) {
            // 用尽 → DLQ
            await pool.command('XADD', dead, '*', 'payload', JSON.stringify({
              originalId: entryId,
              name,
              data: payload.data,
              error: err instanceof Error ? err.message : String(err),
              attempts: nextAttempt,
            }))
            console.error(`[queue] ${name} job failed permanently (attempt ${nextAttempt}/${maxAttempts}):`, err)
          } else {
            // 延迟重试：ZSET（score = now + visibilityTimeout），到期后重新入队
            await pool.command('ZADD', delayed, String(Date.now() + visibilityTimeout), JSON.stringify({
              ...payload,
              attempts: nextAttempt,
            }))
            console.error(
              `[queue] ${name} job failed (attempt ${nextAttempt}/${maxAttempts}), retry in ${visibilityTimeout}ms:`,
              err,
            )
          }
        }
      }

      /** 把到期的延迟 job 重新入队（ZSET → XADD 主 stream） */
      async function requeueDelayed(): Promise<void> {
        const now = Date.now()
        let due: unknown
        try {
          due = await pool.command('ZRANGEBYSCORE', delayed, 0, now)
        } catch (e) {
          if (isPoolClosed(e)) {
            running = false
            return
          }
          if (running) console.error('[queue] ZRANGEBYSCORE:', e instanceof Error ? e.message : e)
          return
        }
        for (const member of due as string[]) {
          const removed = await pool.command('ZREM', delayed, member)
          if (removed) {
            // 到期重新入队（attempts 已持久化在 member JSON 里）
            await pool.command('XADD', s, '*', 'payload', member)
          }
        }
      }

      /** 认领超时 pending（崩溃 worker 遗留 / 失败重投） */
      async function claimStale(): Promise<void> {
        try {
          const result = await pool.command(
            'XAUTOCLAIM', s, GROUP, consumer, visibilityTimeout, '0', 'COUNT', String(concurrency),
          )
          const entries = (result as unknown[])[1] as Array<[string, string[]]>
          for (const [entryId, fields] of entries) {
            await processEntry(entryId, flatFieldsToRecord(fields))
          }
        } catch (e) {
          // 池关闭 → 退出循环（否则无限刷屏）；其他错误下一轮重试
          if (isPoolClosed(e)) {
            running = false
            return
          }
          if (running) console.error('[queue] XAUTOCLAIM:', e instanceof Error ? e.message : e)
        }
      }

      async function loop(): Promise<void> {
        await ensureGroup()
        while (running) {
          await claimStale()
          await requeueDelayed()
          let result: unknown
          try {
            result = await pool.command(
              'XREADGROUP', 'GROUP', GROUP, consumer,
              'COUNT', String(concurrency), 'BLOCK', '1000',
              'STREAMS', s, '>',
            )
          } catch (e) {
            if (isPoolClosed(e)) {
              running = false
              return
            }
            if (running) console.error('[queue] XREADGROUP:', e instanceof Error ? e.message : e)
            continue
          }
          if (!result) continue // BLOCK 超时无新消息
          const streamEntries = (result as unknown[])[0] as [string, Array<[string, string[]]>]
          const entries = streamEntries[1]
          for (const [entryId, fields] of entries) {
            const p = processEntry(entryId, flatFieldsToRecord(fields))
            inflight.add(p)
            p.finally(() => inflight.delete(p)).catch(() => {})
          }
        }
      }

      return {
        start: async () => {
          if (running) return
          running = true
          // fire-and-forget：loop 是无限循环，不能阻塞 start 调用者
          loop().catch((e) => console.error('[queue] worker loop crashed:', e))
        },
        stop: async () => {
          running = false
          await Promise.allSettled([...inflight])
        },
      }
    },
  }

  const mw = (async (req: Request, ctx: Context, next: Handler) => {
    ctx.queue = queueClient
    return next(req, ctx)
  }) as unknown as QueueClientModule

  mw.__meta = { injects: ['queue'], depends: [] }
  mw.queue = queueClient
  mw.close = () => pool.close()

  return mw
}

/** XREADGROUP 返回的扁平字段数组 [k1,v1,k2,v2...] → Record */
function flatFieldsToRecord(fields: string[]): Record<string, string> {
  const rec: Record<string, string> = {}
  for (let i = 0; i + 1 < fields.length; i += 2) {
    rec[String(fields[i])] = String(fields[i + 1])
  }
  return rec
}

/** 池已关闭/连接已断 → worker 循环应退出（避免无限刷屏） */
function isPoolClosed(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /pool is closed|connection closed/.test(msg)
}
