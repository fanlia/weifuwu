import { Redis as IORedis } from 'ioredis'
import crypto from 'node:crypto'
import type { Context, Handler } from '../types.ts'
import { Router } from '../router.ts'
import type { Queue, QueueOptions, QueueJob, QueueJobWithError } from './types.ts'
import { cronNext, parsePattern, matches, parseField } from '../cron-utils.ts'

// ── Factory — auto-selects mode based on Redis availability ─────────────────

export function queue(opts?: QueueOptions): Queue {
  if (opts?.redis || opts?.url) {
    return createRedisQueue(opts)
  }
  return createMemoryQueue(opts)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Memory mode — no Redis required
// ═══════════════════════════════════════════════════════════════════════════════

function createMemoryQueue(opts?: QueueOptions): Queue {
  const pollInterval = opts?.pollInterval ?? 200
  const handlers = new Map<string, (job: any) => Promise<void>>()
  const jobs: QueueJob[] = []          // sorted by runAt ascending
  const failed: QueueJobWithError[] = []
  const MAX_FAILED = 1000
  let running = false
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let _processed = 0
  let _failed = 0
  let inflight = 0
  const MAX_CONCURRENT = 16

  function insertJob(job: QueueJob): void {
    // Insert sorted by runAt
    let i = 0
    while (i < jobs.length && jobs[i].runAt <= job.runAt) i++
    jobs.splice(i, 0, job)
  }

  function removeJob(id: string): void {
    const idx = jobs.findIndex(j => j.id === id)
    if (idx >= 0) jobs.splice(idx, 1)
  }

  async function execute(job: QueueJob, handler: (job: QueueJob) => Promise<void>): Promise<void> {
    inflight++
    try {
      await handler(job)
      _processed++
    } catch (e) {
      _failed++
      const errMsg = (e as Error).message
      console.error('[queue] handler error:', errMsg)
      const failedEntry: QueueJobWithError = {
        ...job,
        error: errMsg,
        failedAt: Date.now(),
      }
      failed.unshift(failedEntry)
      if (failed.length > MAX_FAILED) failed.length = MAX_FAILED
    } finally {
      inflight--
    }

    // Re-queue recurring jobs
    if (job.schedule) {
      try {
        const nextRun = cronNext(job.schedule)
        insertJob({ ...job, id: crypto.randomUUID(), runAt: nextRun, createdAt: Date.now() })
      } catch (e) {
        console.error('[queue] cron re-queue failed:', (e as Error).message)
      }
    }
  }

  async function poll(): Promise<void> {
    if (!running) return
    const now = Date.now()

    while (running && inflight < MAX_CONCURRENT && jobs.length > 0 && jobs[0].runAt <= now) {
      const job = jobs.shift()!
      const handler = handlers.get(job.type)
      if (handler) {
        execute(job, handler)
      }
    }

    if (running) {
      pollTimer = setTimeout(poll, pollInterval)
    }
  }

  const mw = ((req: Request, ctx: Context, next: Handler) => {
    ctx.queue = q
    return next(req, ctx)
  }) as unknown as Queue

  const q: Queue = mw

  mw.add = function add<T>(type: string, payload: T, opts?: { delay?: number; schedule?: string }): Promise<string> {
    const id = crypto.randomUUID()
    let runAt: number

    if (opts?.schedule) {
      // If the pattern matches right now, fire immediately; otherwise schedule next occurrence
      try {
        const fields = parsePattern(opts.schedule)
        if (matches(fields, new Date())) {
          runAt = Date.now()
        } else {
          runAt = cronNext(opts.schedule)
        }
      } catch {
        runAt = cronNext(opts.schedule)
      }
    } else if (opts?.delay) {
      runAt = Date.now() + opts.delay
    } else {
      runAt = Date.now()
    }

    const job: QueueJob<T> = { id, type, payload, createdAt: Date.now(), runAt }
    if (opts?.schedule) job.schedule = opts.schedule
    insertJob(job)
    return Promise.resolve(id)
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
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  mw.close = async function close(): Promise<void> {
    mw.stop()
    while (inflight > 0) await new Promise(r => setTimeout(r, 50))
    // no-op for memory mode
  }

  mw.jobs = async function listJobs(limit?: number): Promise<QueueJob[]> {
    return jobs.slice(0, limit ?? 50)
  }

  mw.failedJobs = async function listFailed(limit?: number): Promise<QueueJobWithError[]> {
    return failed.slice(0, limit ?? 50)
  }

  mw.retryFailed = async function retry(jobId: string): Promise<boolean> {
    const idx = failed.findIndex(j => j.id === jobId)
    if (idx < 0) return false
    const [entry] = failed.splice(idx, 1)
    _failed--
    insertJob({ ...entry, runAt: Date.now() })
    delete (entry as any).error
    delete (entry as any).failedAt
    return true
  }

  mw.retryAllFailed = async function retryAll(type?: string): Promise<number> {
    let count = 0
    for (let i = failed.length - 1; i >= 0; i--) {
      const entry = failed[i]
      if (type && entry.type !== type) continue
      failed.splice(i, 1)
      _failed--
      insertJob({ ...entry, runAt: Date.now() })
      count++
    }
    return count
  }

  mw.dashboard = function dashboard(): Router {
    return buildDashboard(q)
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

// ═══════════════════════════════════════════════════════════════════════════════
// Redis mode — existing implementation (uses shared cron utils)
// ═══════════════════════════════════════════════════════════════════════════════

function createRedisQueue(opts?: QueueOptions): Queue {
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
  const failedKey = `${prefix}:failed`
  const MAX_FAILED = 1000

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
      const errMsg = (e as Error).message
      console.error('[queue] handler error:', errMsg)
      const failedEntry = JSON.stringify({
        ...job,
        error: errMsg,
        failedAt: Date.now(),
      })
      await redis.lpush(failedKey, failedEntry)
      await redis.ltrim(failedKey, 0, MAX_FAILED - 1)
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
        try { job = JSON.parse(raw) } catch { continue }

        const jobHandler = handlers.get(job.type)
        if (jobHandler) processJob(job, jobHandler)
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

  mw.jobs = async function jobs(limit?: number): Promise<QueueJob[]> {
    const raw = await redis.zrevrange(jobKey, 0, (limit ?? 50) - 1)
    return raw.map((r: string) => { try { return JSON.parse(r) } catch { return null } }).filter(Boolean)
  }

  mw.failedJobs = async function failedJobs(limit?: number): Promise<QueueJobWithError[]> {
    const raw = await redis.lrange(failedKey, 0, (limit ?? 50) - 1)
    return raw.map((r: string) => { try { return JSON.parse(r) } catch { return null } }).filter(Boolean)
  }

  mw.retryFailed = async function retryFailed(jobId: string): Promise<boolean> {
    const raw = await redis.lrange(failedKey, 0, -1)
    for (const entry of raw) {
      try {
        const job = JSON.parse(entry)
        if (job.id === jobId) {
          await redis.lrem(failedKey, 1, entry)
          const reJob = { ...job, runAt: Date.now() }
          delete reJob.error; delete reJob.failedAt
          await redis.zadd(jobKey, reJob.runAt, JSON.stringify(reJob))
          _failed--
          return true
        }
      } catch {}
    }
    return false
  }

  mw.retryAllFailed = async function retryAllFailed(type?: string): Promise<number> {
    const raw = await redis.lrange(failedKey, 0, -1)
    let count = 0
    for (const entry of raw) {
      try {
        const job = JSON.parse(entry)
        if (type && job.type !== type) continue
        await redis.lrem(failedKey, 1, entry)
        const reJob = { ...job, runAt: Date.now() }
        delete reJob.error; delete reJob.failedAt
        await redis.zadd(jobKey, reJob.runAt, JSON.stringify(reJob))
        _failed--
        count++
      } catch {}
    }
    return count
  }

  mw.dashboard = function dashboard(): Router {
    return buildDashboard(q)
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

// ═══════════════════════════════════════════════════════════════════════════════
// Shared dashboard builder (used by both modes)
// ═══════════════════════════════════════════════════════════════════════════════

function buildDashboard(q: Queue): Router {
  const r = new Router()

  r.get('/', async () => {
    const s = q.stats()
    const pending = await q.jobs(100)
    const byType: Record<string, { pending: number; failed: number }> = {}
    for (const job of pending) {
      if (!byType[job.type]) byType[job.type] = { pending: 0, failed: 0 }
      byType[job.type].pending++
    }
    const failed = await q.failedJobs(1000)
    for (const job of failed) {
      if (!byType[job.type]) byType[job.type] = { pending: 0, failed: 0 }
      byType[job.type].failed++
    }
    return Response.json({ stats: s, types: byType, failedCount: failed.length })
  })

  r.get('/:type/failed', async (req, ctx) => {
    const failed = await q.failedJobs(100)
    return Response.json({ jobs: failed.filter(j => j.type === ctx.params.type) })
  })

  r.post('/:type/retry', async (req, ctx) => {
    const count = await q.retryAllFailed(ctx.params.type)
    return Response.json({ retried: count })
  })

  r.post('/retry/:id', async (req, ctx) => {
    const ok = await q.retryFailed(ctx.params.id)
    if (!ok) return new Response('Job not found', { status: 404 })
    return Response.json({ retried: true })
  })

  return r
}

// Re-export parseField for backward compatibility (used by queue tests that
// manually manipulate Redis scores)
export { parseField }
