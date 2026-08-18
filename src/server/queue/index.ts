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
import type { Redis, RedisPoolConnection } from '../db/contracts.ts'

export interface QueueOptions {
  /**
   * Redis 客户端（必传——模式 A 显式注入，对齐 userSystem({ sql })）：
   * 池命令（add/length）走轮询连接，worker 阻塞读走 redis.createConnection()（不占池）。
   * 所有权在调用方：queue.close() 不关闭注入的 redis。
   */
  redis: Redis
  /** stream 名前缀。默认 'q:'。 */
  prefix?: string
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
  /** XREADGROUP 阻塞等待时长（ms）。默认 1000。
   *  越小失败重投延迟越低（重投间隔 = max(visibilityTimeout, blockMs)），
   *  测试用短值提速；生产保持默认。 */
  blockMs?: number
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

export function queue(options: QueueOptions): QueueClientModule {
  const redis = options.redis
  const prefix = options.prefix ?? 'q:'
  const stream = (name: string) => `${prefix}${name}`
  const deadStream = (name: string) => `${prefix}${name}:dead`

  /** XADD 一个 job 到 stream（payload 序列化为单个 field） */
  async function pushJob(name: string, payload: Record<string, unknown>): Promise<string> {
    const id = await redis.command('XADD', stream(name), '*', 'payload', JSON.stringify(payload))
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

    length: async (name) => Number(await redis.command('XLEN', stream(name))),

    worker<T = unknown>(name: string, handler: (job: Job<T>) => Promise<void>, opts?: WorkerOptions) {
      const consumer = opts?.consumer ?? `${hostname()}-${process.pid}-${Math.random().toString(36).slice(2, 6)}`
      const concurrency = opts?.concurrency ?? 1
      const visibilityTimeout = opts?.visibilityTimeout ?? 30_000
      const blockMs = opts?.blockMs ?? 1000
      const s = stream(name)
      const dead = deadStream(name)
      const delayed = `${prefix}${name}:delayed`

      let running = false
      let lastErrAt = 0 // 错误日志抑制（5s 窗口最多打一次——NOGROUP 自愈路径静默）
      let epoch = 0 // 世代标记：stop 时 ++，旧 loop 检查失效退出（防 stop/start 交替时旧 loop 复活）
      let conn: RedisPoolConnection | null = null
      let connEpoch = -1 // 连接所属世代（stop 在途的旧连接与 start 的新连接区分）
      const loops = new Map<number, Promise<void>>() // epoch → loop（stop 只等自己的旧 loop）
      const inflight = new Set<Promise<void>>()

      /** 独立连接：BLOCK 命令不占池连接（池只服务 add/length 等短命令）。
       *  连接绑定 epoch——stop 在途的旧连接（connEpoch !== myEpoch）关闭重建，
       *  不与被 stop 摘除的旧连接混淆。 */
      async function getConn(myEpoch: number): Promise<RedisPoolConnection> {
        if (conn && connEpoch === myEpoch) return conn
        if (conn) {
          // 旧连接（stop 在途已摘除引用，但 start 并发时可能还在）——安全关闭
          const c = conn
          conn = null
          connEpoch = -1
          await c.close().catch(() => {})
        }
        const c = await redis.createConnection()
        conn = c
        connEpoch = myEpoch
        return c
      }

      /** 消费组幂等创建（瞬时错误重试 3 次 × 50ms；确定性错误如 WRONGTYPE 同样 reject） */
      async function ensureGroup(): Promise<void> {
        let lastErr: unknown
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await conn!.command('XGROUP', 'CREATE', s, GROUP, '0', 'MKSTREAM')
            return
          } catch (e) {
            if (String((e as Error).message).includes('BUSYGROUP')) return
            lastErr = e
            if (attempt < 2) await new Promise((r) => setTimeout(r, 50))
          }
        }
        throw lastErr
      }

      /** 处理一个 entry：成功 XACK；失败按 attempts 决定延迟重试（ZSET）或 DLQ */
      async function processEntry(entryId: string, fields: Record<string, string>): Promise<void> {
        let payload: Record<string, any>
        try {
          payload = JSON.parse(fields.payload ?? '{}')
        } catch {
          // 无法解析的 entry：XACK 丢弃 + 记 DLQ（避免无限重试坏消息）
          await conn!.command('XACK', s, GROUP, entryId)
          await conn!.command('XADD', dead, '*', 'payload', JSON.stringify({
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
          await conn!.command('XACK', s, GROUP, entryId)
        } catch (err) {
          const nextAttempt = attempts + 1
          // 无论重试还是 DLQ 都先 XACK（清 pending）——entry 字段不可变，
          // attempts 计数必须持久化到新载体，否则重新 claim 读到旧值无限重试
          await conn!.command('XACK', s, GROUP, entryId)
          if (nextAttempt >= maxAttempts) {
            // 用尽 → DLQ
            await conn!.command('XADD', dead, '*', 'payload', JSON.stringify({
              originalId: entryId,
              name,
              data: payload.data,
              error: err instanceof Error ? err.message : String(err),
              attempts: nextAttempt,
            }))
            console.error(`[queue] ${name} job failed permanently (attempt ${nextAttempt}/${maxAttempts}):`, err)
          } else {
            // 延迟重试：ZSET（score = now + visibilityTimeout），到期后重新入队
            await conn!.command('ZADD', delayed, String(Date.now() + visibilityTimeout), JSON.stringify({
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
          due = await conn!.command('ZRANGEBYSCORE', delayed, 0, now)
        } catch (e) {
          if (isConnClosed(e)) {
            running = false
            return
          }
          if (running && shouldLogError()) {
            console.error('[queue] ZRANGEBYSCORE:', e instanceof Error ? e.message : e)
          }
          return
        }
        for (const member of due as string[]) {
          const removed = await conn!.command('ZREM', delayed, member)
          if (removed) {
            // 到期重新入队（attempts 已持久化在 member JSON 里）
            await conn!.command('XADD', s, '*', 'payload', member)
          }
        }
      }

      /** 认领超时 pending（崩溃 worker 遗留 / 失败重投） */
      async function claimStale(): Promise<void> {
        try {
          const result = await conn!.command(
            'XAUTOCLAIM', s, GROUP, consumer, visibilityTimeout, '0', 'COUNT', String(concurrency),
          )
          const entries = (result as unknown[])[1] as Array<[string, string[]]>
          for (const [entryId, fields] of entries) {
            await processEntry(entryId, flatFieldsToRecord(fields))
          }
        } catch (e) {
          // 连接关闭 → 退出循环（否则无限刷屏）；NOGROUP → 重建 group 自愈；其他错误下一轮重试
          if (isConnClosed(e)) {
            running = false
            return
          }
          if (await recoverGroupIfMissing(e)) return
          if (running && shouldLogError()) {
            console.error('[queue] XAUTOCLAIM:', e instanceof Error ? e.message : e)
          }
        }
      }

      /** NOGROUP 自愈：group 被外部删除（运维）→ 重建后继续（XREADGROUP/XAUTOCLAIM 报 NOGROUP 时） */
      async function recoverGroupIfMissing(e: unknown): Promise<boolean> {
        const msg = e instanceof Error ? e.message : String(e)
        if (!/NOGROUP/.test(msg)) return false
        try {
          await ensureGroup()
          return true
        } catch {
          return false
        }
      }

      /** 错误日志抑制：5s 窗口最多打一次（持续瞬时错误不刷屏） */
      function shouldLogError(): boolean {
        const now = Date.now()
        if (now - lastErrAt > 5000) {
          lastErrAt = now
          return true
        }
        return false
      }

      async function loop(myEpoch: number): Promise<void> {
        while (running && myEpoch === epoch) {
          await claimStale()
          await requeueDelayed()
          let result: unknown
          try {
            result = await conn!.command(
              'XREADGROUP', 'GROUP', GROUP, consumer,
              'COUNT', String(concurrency), 'BLOCK', String(blockMs),
              'STREAMS', s, '>',
            )
          } catch (e) {
            if (isConnClosed(e)) {
              running = false
              return
            }
            // NOGROUP（group 被删）→ 重建后继续；其他错误降频打印后重试
            if (await recoverGroupIfMissing(e)) continue
            if (running && shouldLogError()) {
              console.error('[queue] XREADGROUP:', e instanceof Error ? e.message : e)
            }
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
          const myEpoch = epoch
          try {
            // 就绪等待：独立连接 + 消费组建好后才 resolve（调用方可知 group 可用）
            await getConn(myEpoch)
            await ensureGroup()
          } catch (e) {
            // 失败回退：running 复位 + 清理（否则 start 永久卡死无法重试）
            running = false
            if (conn) {
              const c = conn
              conn = null
              connEpoch = -1
              await c.close().catch(() => {})
            }
            throw e
          }
          // fire-and-forget：loop 是无限循环，不能阻塞 start 调用者
          const lp = loop(myEpoch)
          loops.set(myEpoch, lp)
          lp.finally(() => loops.delete(myEpoch)).catch((e) =>
            console.error('[queue] worker loop crashed:', e),
          )
        },
        stop: async () => {
          if (!running) {
            await Promise.allSettled([...loops.values()])
            return
          }
          epoch++ // 旧 loop 的 while 检查失效——即使 stop 未完成时 start，旧 loop 也必然退出
          running = false
          // 摘除旧连接引用（start 并发时建新连接，不被误关）
          const oldConn = conn
          conn = null
          connEpoch = -1
          // 只等本世代（epoch < 当前）的旧 loop——start 并发的新 loop 不受 stop 影响
          const oldLoops = [...loops.entries()].filter(([e]) => e < epoch).map(([, p]) => p)
          await Promise.allSettled([...inflight]) // in-flight 的 XACK 用 oldConn，等完成
          await Promise.allSettled(oldLoops) // 旧 loop 退出（BLOCK 返回后 epoch 检查）
          await oldConn?.close().catch(() => {}) // 最后关连接（in-flight 已完）
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
  mw.close = async () => {} // 注入的 redis 所有权在调用方（queue 不关闭）

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

/** 连接已关闭/池已关 → worker 循环应退出（避免无限刷屏） */
function isConnClosed(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /pool is closed|connection closed/.test(msg)
}
