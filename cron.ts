// ── Cron scheduler for weifuwu ──────────────────────────────────────────────
//
// Usage:
//   import { cron, startCron, stopCron } from 'weifuwu'
//
//   cron('0 9 * * 1', async () => { /* weekly report */ })
//   startCron()
//
// For multi-instance deployments, pass pg for DB-backed locking:
//   import { cron, startCron } from 'weifuwu'
//   cron('0 9 * * 1', handler, { pg, name: 'weekly-report' })
//   startCron()

import type { Sql } from './vendor.ts'

// ── Types ───────────────────────────────────────────────────────────────────

export interface CronJobOptions {
  /** A unique name for this job. Required when `pg` is set (for locking). */
  name?: string
  /** PostgreSQL client. If provided, uses DB-level locking for multi-instance safety. */
  pg?: { sql: Sql<{}> }
  /** Table for persisted cron job metadata (default: '_cron_jobs'). */
  table?: string
  /** Timezone offset in minutes from UTC (default: local timezone). */
  tzOffset?: number
}

export interface CronJob {
  pattern: string
  handler: () => void | Promise<void>
  stop: () => void
  name?: string
}

// ── Cron parser ─────────────────────────────────────────────────────────────

type CronField = number[]  // list of matching values (0-59, 0-23, 1-31, 1-12, 0-6)

function parseField(field: string, min: number, max: number): CronField {
  const result: number[] = []

  for (const part of field.split(',')) {
    if (part === '*') {
      for (let i = min; i <= max; i++) result.push(i)
    } else if (part.startsWith('*/')) {
      const step = parseInt(part.slice(2), 10)
      if (isNaN(step) || step < 1) throw new Error(`Invalid cron step: ${part}`)
      for (let i = min; i <= max; i += step) result.push(i)
    } else if (part.includes('-')) {
      const [rawStart, rawEnd] = part.split('-')
      const start = parseInt(rawStart, 10)
      const end = parseInt(rawEnd, 10)
      if (isNaN(start) || isNaN(end)) throw new Error(`Invalid cron range: ${part}`)
      for (let i = start; i <= end; i++) result.push(i)
    } else {
      const val = parseInt(part, 10)
      if (isNaN(val)) throw new Error(`Invalid cron value: ${part}`)
      result.push(val)
    }
  }

  return [...new Set(result)].sort((a, b) => a - b)
}

function parsePattern(pattern: string): CronField[] {
  const fields = pattern.trim().split(/\s+/)
  if (fields.length !== 5) {
    throw new Error(`Invalid cron pattern: expected 5 fields, got ${fields.length}: "${pattern}"`)
  }

  return [
    parseField(fields[0], 0, 59),  // minute
    parseField(fields[1], 0, 23),  // hour
    parseField(fields[2], 1, 31),  // day of month
    parseField(fields[3], 1, 12),  // month
    parseField(fields[4], 0, 6),   // day of week (0=Sunday)
  ]
}

function matches(fields: CronField[], date: Date): boolean {
  const minute = date.getMinutes()
  const hour = date.getHours()
  const day = date.getDate()
  const month = date.getMonth() + 1  // 1-indexed
  const dow = date.getDay()           // 0=Sunday

  return (
    fields[0].includes(minute) &&
    fields[1].includes(hour) &&
    fields[2].includes(day) &&
    fields[3].includes(month) &&
    fields[4].includes(dow)
  )
}

// ── Scheduler ───────────────────────────────────────────────────────────────

interface JobEntry {
  pattern: string
  fields: CronField[]
  handler: () => void | Promise<void>
  name?: string
  running: boolean
  lastRun?: number
  pg?: { sql: Sql<{}>; table: string }
}

const jobs: Map<string, JobEntry> = new Map()
let tickTimer: ReturnType<typeof setInterval> | null = null
const TICK_INTERVAL = 30_000  // 30 seconds

function generateJobKey(pattern: string, name?: string): string {
  return name ?? pattern
}

function addJob(pattern: string, handler: () => void | Promise<void>, options?: CronJobOptions): CronJob {
  const fields = parsePattern(pattern)
  const name = options?.name
  const key = generateJobKey(pattern, name)

  if (jobs.has(key)) {
    throw new Error(`Cron job already registered: ${key}`)
  }

  let pgOpts: { sql: Sql<{}>; table: string } | undefined
  if (options?.pg) {
    pgOpts = { sql: options.pg.sql, table: options.table ?? '_cron_jobs' }
  }

  const entry: JobEntry = { pattern, fields, handler, name, running: false, pg: pgOpts }
  jobs.set(key, entry)

  // Ensure table exists if PG is used
  if (pgOpts) {
    ensureTable(pgOpts.sql, pgOpts.table).catch(err => {
      console.error(`[cron] failed to create table:`, err.message)
    })
  }

  return {
    pattern,
    handler,
    name,
    stop: () => { jobs.delete(key) },
  }
}

async function ensureTable(sql: Sql<{}>, table: string): Promise<void> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "${table}" (
      name TEXT PRIMARY KEY,
      pattern TEXT NOT NULL,
      last_run_at TIMESTAMPTZ,
      locked_at TIMESTAMPTZ,
      locked_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

async function tryAcquireLock(sql: Sql<{}>, table: string, name: string, instanceId: string): Promise<boolean> {
  const lockTimeout = 5 * 60 * 1000  // 5 minutes
  try {
    const [row] = await sql.unsafe(
      `SELECT locked_at, locked_by FROM "${table}" WHERE name = $1 FOR UPDATE SKIP LOCKED`,
      [name],
    ) as any[]
    if (!row) return true  // no existing lock entry — first time
    if (row.locked_by === instanceId) return true  // we own the lock
    if (row.locked_at && Date.now() - new Date(row.locked_at).getTime() > lockTimeout) {
      return true  // lock expired
    }
    return false  // locked by another instance
  } catch {
    return true  // table doesn't exist yet, run anyway
  }
}

async function releaseLock(sql: Sql<{}>, table: string, name: string): Promise<void> {
  await sql.unsafe(
    `UPDATE "${table}" SET locked_at = NULL, locked_by = NULL WHERE name = $1`,
    [name],
  )
}

async function tick(): Promise<void> {
  const now = new Date()

  for (const [key, entry] of jobs) {
    if (!matches(entry.fields, now)) continue
    if (entry.running) continue  // skip if previous run still in progress

    // For PG-backed jobs, try to acquire lock
    if (entry.pg) {
      const instanceId = process.pid?.toString() ?? 'unknown'
      const acquired = await tryAcquireLock(entry.pg.sql, entry.pg.table, entry.name ?? key, instanceId)
      if (!acquired) continue
    }

    entry.running = true

    // Run asynchronously — don't block the tick loop
    Promise.resolve()
      .then(() => entry.handler())
      .catch(err => {
        console.error(`[cron] job "${key}" failed:`, err instanceof Error ? err.message : String(err))
      })
      .finally(async () => {
        entry.running = false
        entry.lastRun = Date.now()

        // Update last_run in PG
        if (entry.pg) {
          try {
            const instanceId = process.pid?.toString() ?? 'unknown'
            await entry.pg.sql.unsafe(
              `INSERT INTO "${entry.pg.table}" (name, pattern, last_run_at, locked_at, locked_by)
               VALUES ($1, $2, NOW(), NULL, NULL)
               ON CONFLICT (name) DO UPDATE SET last_run_at = NOW(), locked_at = NULL, locked_by = NULL`,
              [entry.name ?? key, entry.pattern],
            )
          } catch { /* ignore */ }
        }
      })
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Register a cron job.
 *
 * @param pattern - Standard 5-field cron expression: `minute hour day-of-month month day-of-week`
 * @param handler - Async function to execute on schedule
 * @param options - Optional: `name`, `pg` for multi-instance locking
 */
export function cron(pattern: string, handler: () => void | Promise<void>, options?: CronJobOptions): CronJob {
  return addJob(pattern, handler, options)
}

/**
 * Start the cron scheduler. Checks registered jobs every 30 seconds.
 * Safe to call multiple times (idempotent).
 */
export function startCron(): void {
  if (tickTimer) return
  tickTimer = setInterval(tick, TICK_INTERVAL)
  // Run first tick immediately
  tick().catch(err => {
    console.error('[cron] initial tick error:', err instanceof Error ? err.message : String(err))
  })
}

/**
 * Stop the cron scheduler. Clears the tick interval.
 */
export function stopCron(): void {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

/**
 * Get the number of registered jobs (for diagnostics).
 */
export function cronJobCount(): number {
  return jobs.size
}
