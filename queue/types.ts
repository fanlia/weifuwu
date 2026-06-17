import type { Redis } from '../vendor.ts'
import type { Context, Middleware, Closeable } from '../types.ts'

declare module '../types.ts' {
  interface Context {
    queue: Queue
  }
}

export interface QueueJob<T = unknown> {
  id: string
  type: string
  payload: T
  createdAt: number
  runAt: number
  schedule?: string
}

export interface QueueOptions {
  /** Backend store. Default: 'memory'. */
  store?: 'memory' | 'pg' | 'redis'
  redis?: Redis
  url?: string
  prefix?: string
  pollInterval?: number
  /** PostgreSQL client (required when store: 'pg'). */
  pg?: { sql: import('../vendor.ts').SqlClient }
}

export interface QueueInjected {
  queue: Queue
}

export interface QueueJobWithError<T = unknown> extends QueueJob<T> {
  error: string
  failedAt: number
}

export interface Queue extends Middleware<Context, Context & QueueInjected>, Closeable {
  /** Register a cron job. Uses queue's backend (memory/pg/redis) for execution. */
  cron(pattern: string, handler: () => void | Promise<void>): { stop: () => void }
  add<T>(type: string, payload: T, opts?: { delay?: number; schedule?: string }): Promise<string>
  process<T>(type: string, handler: (job: QueueJob<T>) => Promise<void>): void
  run(): Promise<void>
  stats(): {
    running: boolean
    inflight: number
    processed: number
    failed: number
    handlers: number
    maxConcurrent: number
  }
  jobs(limit?: number): Promise<QueueJob[]>
  failedJobs(limit?: number): Promise<QueueJobWithError[]>
  retryFailed(jobId: string): Promise<boolean>
  retryAllFailed(type?: string): Promise<number>
  dashboard(): import('../router.ts').Router
  /** Create the jobs table (PG mode only; safe to call multiple times). */
  migrate?(): Promise<void>
  close(): Promise<void>
}
