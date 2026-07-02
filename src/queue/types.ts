import type { Redis, Context, Middleware, Closeable } from '../types.ts'

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
  /** Redis client instance (auto-created if not provided). */
  redis?: Redis
  /** Redis URL (default: REDIS_URL env or redis://localhost:6379). */
  url?: string
  /** Key prefix (default: 'queue'). */
  prefix?: string
  /** Poll interval in ms (default: 200). */
  pollInterval?: number
}

export interface QueueInjected {
  queue: Queue
}

export interface QueueJobWithError<T = unknown> extends QueueJob<T> {
  error: string
  failedAt: number
}

export interface Queue extends Middleware<Context, Context & QueueInjected>, Closeable {
  /** Register a cron job. */
  cron(pattern: string, handler: () => void | Promise<void>): { stop: () => void }
  add<T>(type: string, payload: T, opts?: { delay?: number; schedule?: string }): Promise<string>
  process<T>(type: string, handler: (job: QueueJob<T>) => Promise<void>): void
  run(): Promise<void>
  stats(): { running: boolean; inflight: number; processed: number; failed: number; handlers: number; maxConcurrent: number }
  jobs(limit?: number): Promise<QueueJob[]>
  failedJobs(limit?: number): Promise<QueueJobWithError[]>
  retryFailed(jobId: string): Promise<boolean>
  retryAllFailed(type?: string): Promise<number>
  dashboard(): import('../core/router.ts').Router
  close(): Promise<void>
}
