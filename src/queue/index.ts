/**
 * Redis-backed job queue with cron scheduling.
 *
 * Usage:
 *   const q = queue({ url: process.env.REDIS_URL })
 *   q.process('email', async (job) => { await send(job.data) })
 *   await q.add('email', { to: '...' })
 *   q.cron('cleanup', '0 3 * * *', async () => { ... })
 *   await q.run()
 */

import crypto from 'node:crypto'
import { Redis as IORedis } from 'ioredis'
import type { Context, Handler } from '../types.ts'
import { Router } from '../core/router.ts'
import type { Queue, QueueOptions, QueueJob } from './types.ts'
import { cronNext, parsePattern, matches } from './cron.ts'

// ── Factory ─────────────────────────────────────────────────────────

export function queue(opts?: QueueOptions): Queue {
  const redis = opts?.redis ?? new IORedis(opts?.url ?? process.env.REDIS_URL ?? 'redis://localhost:6379')
  const prefix = opts?.prefix ?? 'queue'
  const jobKey = prefix + ':jobs'
  const failedKey = prefix + ':failed'
  const pollInterval = opts?.pollInterval ?? 200
  const MAX_CONCURRENT = 16
  const MAX_FAILED = 1000

  const handlers = new Map<string, JobHandler>()
  let running = false, pollTimer: ReturnType<typeof setTimeout> | null = null
  let _processed = 0, _failed = 0, inflight = 0

  // ── Store ops ─────────────────────────────────────────────────

  async function insert(job: QueueJob, error?: string): Promise<void> {
    if (error) {
      await redis.lpush(failedKey, JSON.stringify({ ...job, error, failedAt: Date.now() }))
      await redis.ltrim(failedKey, 0, MAX_FAILED - 1)
    } else {
      await redis.zadd(jobKey, job.runAt, JSON.stringify(job))
    }
  }

  async function poll(): Promise<QueueJob | null> {
    const result = await redis.zpopmin(jobKey)
    if (result.length < 2) return null
    const score = parseInt(result[1], 10)
    if (score > Date.now()) { await redis.zadd(jobKey, score, result[0]); return null }
    try { return JSON.parse(result[0]) } catch { return null }
  }

  // ── Job execution ────────────────────────────────────────────

  async function execute(job: QueueJob, handler: JobHandler): Promise<void> {
    inflight++
    try { await handler(job); _processed++ }
    catch (e) {
      _failed++
      await insert(job, (e as Error).message)
    } finally { inflight-- }

    if (job.schedule) {
      try {
        await insert({ ...job, id: crypto.randomUUID(), runAt: cronNext(job.schedule), createdAt: Date.now() })
      } catch { /* cron re-queue failed, job already executed */ }
    }
  }

  async function pollLoop(): Promise<void> {
    if (!running) return
    try {
      while (running && inflight < MAX_CONCURRENT) {
        const job = await poll()
        if (!job) break
        const handler = handlers.get(job.type)
        if (handler) execute(job, handler)
      }
    } catch { /* poll error, retry on next interval */ }
    if (running) pollTimer = setTimeout(pollLoop, pollInterval)
  }

  // ── Build Queue ──────────────────────────────────────────────

  const stats = () => ({ running, inflight, processed: _processed, failed: _failed, handlers: handlers.size, maxConcurrent: MAX_CONCURRENT })

  const mw = ((_req: Request, ctx: Context, next: Handler): Response | Promise<Response> => {
    ;(ctx as Context & { queue: Queue }).queue = q
    return next(_req, ctx)
  }) as unknown as Queue

  const q: Queue = mw

  mw.add = function add<T>(type: string, payload: T, opts2?: { delay?: number; schedule?: string }): Promise<string> {
    const id = crypto.randomUUID()
    let runAt: number
    if (opts2?.schedule) {
      try { runAt = matches(parsePattern(opts2.schedule), new Date()) ? Date.now() : cronNext(opts2.schedule) }
      catch { runAt = cronNext(opts2.schedule) }
    } else if (opts2?.delay) { runAt = Date.now() + opts2.delay }
    else { runAt = Date.now() }
    const job: QueueJob<T> = { id, type, payload, createdAt: Date.now(), runAt }
    if (opts2?.schedule) job.schedule = opts2.schedule
    return redis.zadd(jobKey, runAt, JSON.stringify(job)).then(() => id)
  }

  mw.process = function process<T>(type: string, handler: (job: QueueJob<T>) => Promise<void>): void {
    handlers.set(type, handler as JobHandler)
  }

  mw.run = async function run(): Promise<void> {
    if (running) return; running = true; pollLoop()
  }

  mw.close = async function close(): Promise<void> {
    running = false
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
    while (inflight > 0) await new Promise(r => setTimeout(r, 50))
    redis.disconnect()
  }

  mw.jobs = async (limit = 50) => {
    const raw = await redis.zrevrange(jobKey, 0, limit - 1)
    return raw.map((r: string) => { try { return JSON.parse(r) } catch { return null } }).filter(Boolean)
  }

  mw.failedJobs = async (limit = 50) => {
    const raw = await redis.lrange(failedKey, 0, limit - 1)
    return raw.map((r: string) => { try { return JSON.parse(r) } catch { return null } }).filter(Boolean)
  }

  mw.retryFailed = async (jobId: string) => {
    const raw = await redis.lrange(failedKey, 0, -1)
    for (const entry of raw) {
      try {
        const job = JSON.parse(entry)
        if (job.id !== jobId) continue
        await redis.lrem(failedKey, 1, entry)
        const reJob = { ...job, runAt: Date.now() }; delete reJob.error; delete reJob.failedAt
        await redis.zadd(jobKey, reJob.runAt, JSON.stringify(reJob))
        _failed--
        return true
      } catch {}
    }
    return false
  }

  mw.retryAllFailed = async (type?: string) => {
    let count = 0
    const raw = await redis.lrange(failedKey, 0, -1)
    for (const entry of raw) {
      try {
        const job = JSON.parse(entry)
        if (type && job.type !== type) continue
        await redis.lrem(failedKey, 1, entry)
        const reJob = { ...job, runAt: Date.now() }; delete reJob.error; delete reJob.failedAt
        await redis.zadd(jobKey, reJob.runAt, JSON.stringify(reJob))
        _failed--
        count++
      } catch {}
    }
    return count
  }

  mw.stats = stats

  mw.dashboard = () => {
    const r = new Router()
    r.get('/', async () => {
      const s = stats()
      const pending = await mw.jobs(100)
      const byType: Record<string, { pending: number; failed: number }> = {}
      for (const j of pending) { byType[j.type] = (byType[j.type] || { pending: 0, failed: 0 }); byType[j.type].pending++ }
      const failed = await mw.failedJobs(1000)
      for (const j of failed) { byType[j.type] = (byType[j.type] || { pending: 0, failed: 0 }); byType[j.type].failed++ }
      return Response.json({ stats: s, types: byType, failedCount: failed.length })
    })
    r.get('/:type/failed', async (req, ctx) =>
      Response.json({ jobs: (await mw.failedJobs(100)).filter(j => j.type === ctx.params.type) }))
    r.post('/:type/retry', async (req, ctx) =>
      Response.json({ retried: await mw.retryAllFailed(ctx.params.type) }))
    r.post('/retry/:id', async (req, ctx) => {
      const ok = await mw.retryFailed(ctx.params.id)
      return ok ? Response.json({ ok: true }) : new Response('Not found', { status: 404 })
    })
    return r
  }

  // Cron
  ;(q as any).cron = function (pattern: string, handler: () => void | Promise<void>) {
    const id = '__cron_' + pattern.replace(/[^a-zA-Z0-9]/g, '_') + '_' + crypto.randomUUID().slice(0, 8)
    q.process(id, async () => { await handler() })
    q.add(id, {}, { schedule: pattern })
    return { stop: () => handlers.delete(id) }
  }

  return q
}

type JobHandler = (job: QueueJob) => Promise<void>
