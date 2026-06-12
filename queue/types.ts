import type { Redis } from '../vendor.ts'
import type { Context, Middleware } from '../types.ts'

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
  redis?: Redis
  url?: string
  prefix?: string
  pollInterval?: number
}

export interface QueueInjected {
  queue: Queue
}

export interface QueueJobWithError<T = unknown> extends QueueJob<T> {
  error: string
  failedAt: number
}

export interface Queue extends Middleware<Context, Context & QueueInjected> {
  add<T>(type: string, payload: T, opts?: { delay?: number; schedule?: string }): Promise<string>
  process<T>(type: string, handler: (job: QueueJob<T>) => Promise<void>): void
  run(): Promise<void>
  stop(): void
  /** Stats: { running, inflight, processed, failed, handlers, maxConcurrent } */
  stats(): { running: boolean; inflight: number; processed: number; failed: number; handlers: number; maxConcurrent: number }
  /** List pending jobs (up to `limit`). */
  jobs(limit?: number): Promise<QueueJob[]>
  /** List failed jobs (up to `limit`). */
  failedJobs(limit?: number): Promise<QueueJobWithError[]>
  /** Retry a specific failed job by re-adding it to the queue. */
  retryFailed(jobId: string): Promise<boolean>
  /** Retry all failed jobs matching a type (or all types if omitted). */
  retryAllFailed(type?: string): Promise<number>
  /** Returns a Router with management dashboard endpoints (GET/POST). */
  dashboard(): import('../router.ts').Router
  close(): Promise<void>
}
