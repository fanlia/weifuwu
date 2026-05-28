import type { Redis } from 'ioredis'
import type { Context, Handler } from '../types.ts'

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

export interface Queue {
  (req: Request, ctx: Context, next: Handler): Response | Promise<Response>
  add<T>(type: string, payload: T, opts?: { delay?: number; schedule?: string }): Promise<string>
  process<T>(type: string, handler: (job: QueueJob<T>) => Promise<void>): void
  run(): Promise<void>
  stop(): void
  close(): Promise<void>
}
