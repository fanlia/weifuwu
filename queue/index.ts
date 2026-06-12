import { Redis as IORedis } from 'ioredis'
import crypto from 'node:crypto'
import type { Context, Handler } from '../types.ts'
import type { Queue, QueueOptions, QueueJob } from './types.ts'

function cronNext(expr: string, from: Date = new Date()): number {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) throw new Error(`Invalid cron expression "${expr}": expected 5 fields`)

  const fields = parts.map((f, i) => {
    const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]] as const
    const [min, max] = ranges[i]
    return parseField(f, min, max)
  })

  let candidate = new Date(from.getTime() + 60_000)
  candidate.setSeconds(0, 0)

  for (let i = 0; i < 525600; i++) {
    const m = candidate.getMonth() + 1
    const d = candidate.getDate()
    const h = candidate.getHours()
    const min = candidate.getMinutes()
    const dw = candidate.getDay()

    if (
      fields[4].has(dw) &&
      fields[3].has(m) &&
      fields[2].has(d) &&
      fields[1].has(h) &&
      fields[0].has(min)
    ) {
      return candidate.getTime()
    }

    candidate.setTime(candidate.getTime() + 60_000)
  }

  throw new Error(`No future date found for cron expression "${expr}"`)
}

function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>()

  for (const part of field.split(',')) {
    if (part === '*') {
      for (let i = min; i <= max; i++) values.add(i)
    } else if (part.includes('/')) {
      const [range, stepStr] = part.split('/')
      const step = parseInt(stepStr, 10)
      let start = min
      let end = max
      if (range !== '*') {
        const parts = range.split('-')
        start = parseInt(parts[0], 10)
        end = parts.length > 1 ? parseInt(parts[1], 10) : max
      }
      for (let i = start; i <= end; i += step) values.add(i)
    } else if (part.includes('-')) {
      const [s, e] = part.split('-').map(Number)
      for (let i = s; i <= e; i++) values.add(i)
    } else {
      values.add(parseInt(part, 10))
    }
  }

  const result = new Set<number>()
  for (const v of values) {
    if (v >= min && v <= max) result.add(v)
  }
  return result
}

export function queue(opts?: QueueOptions): Queue {
  const redis = opts?.redis ?? new IORedis(opts?.url ?? process.env.REDIS_URL ?? 'redis://localhost:6379')
  const prefix = opts?.prefix ?? 'queue'
  const pollInterval = opts?.pollInterval ?? 200
  const handlers = new Map<string, (job: any) => Promise<void>>()
  let running = false
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let epoch = 0
  let _processed = 0
  let _failed = 0

  const jobKey = `${prefix}:jobs`

  const mw = ((req: Request, ctx: Context, next: Handler) => {
    ctx.queue = q
    return next(req, ctx)
  }) as unknown as Queue

  const q: Queue = mw

  const MAX_CONCURRENT = 16
  let inflight = 0

  async function processJob(job: QueueJob, jobHandler: (job: QueueJob) => Promise<void>): Promise<void> {
    inflight++
    try {
      await jobHandler(job)
      _processed++
    } catch (e) {
      _failed++
      console.error('[queue] handler error:', (e as Error).message)
    } finally {
      inflight--
    }
    if (job.schedule) {
      try {
        const nextRun = cronNext(job.schedule)
        const nextJob = { ...job, id: crypto.randomUUID(), runAt: nextRun, createdAt: Date.now() }
        await redis.zadd(jobKey, nextRun, JSON.stringify(nextJob))
      } catch (e) {
        console.error('[queue] cron re-queue failed:', (e as Error).message)
      }
    }
  }

  async function poll(): Promise<void> {
    const currentEpoch = epoch
    if (!running) return

    try {
      const now = Date.now()

      while (running && inflight < MAX_CONCURRENT) {
        const result = await redis.zpopmin(jobKey)
        if (result.length < 2) break
        const raw = result[0]
        const score = parseInt(result[1], 10)
        if (score > now) {
          await redis.zadd(jobKey, score, raw)
          break
        }

        let job: QueueJob
        try {
          job = JSON.parse(raw)
        } catch {
          continue
        }

        const jobHandler = handlers.get(job.type)
        if (jobHandler) {
          processJob(job, jobHandler)
        }
      }
    } catch (e) {
      console.error('[queue] poll error:', (e as Error).message)
    }

    if (running && currentEpoch === epoch) {
      pollTimer = setTimeout(poll, pollInterval)
    }
  }

  mw.add = function add<T>(type: string, payload: T, opts?: { delay?: number; schedule?: string }): Promise<string> {
    const id = crypto.randomUUID()
    let runAt: number

    if (opts?.schedule) {
      runAt = cronNext(opts.schedule)
    } else if (opts?.delay) {
      runAt = Date.now() + opts.delay
    } else {
      runAt = Date.now()
    }

    const job: QueueJob<T> = { id, type, payload, createdAt: Date.now(), runAt }
    if (opts?.schedule) job.schedule = opts.schedule

    return redis.zadd(jobKey, runAt, JSON.stringify(job)).then(() => id)
  }

  mw.process = function process<T>(type: string, handler: (job: QueueJob<T>) => Promise<void>): void {
    handlers.set(type, handler as (job: any) => Promise<void>)
  }

  mw.run = async function run(): Promise<void> {
    if (running) return
    running = true
    poll()
  }

  mw.stop = function stop(): void {
    running = false
    epoch++
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  mw.close = async function close(): Promise<void> {
    mw.stop()
    while (inflight > 0) await new Promise(r => setTimeout(r, 50))
    redis.disconnect()
  }

  ;(mw as any).stats = () => ({
    running,
    inflight,
    processed: _processed,
    failed: _failed,
    handlers: handlers.size,
    maxConcurrent: MAX_CONCURRENT,
  })

  return q
}
