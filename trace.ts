import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

export interface TraceContext {
  traceId: string
  startTime: number
}

const als = new AsyncLocalStorage<TraceContext>()

/** Returns the current request's trace ID, or undefined if outside a request. */
export function currentTraceId(): string | undefined {
  return als.getStore()?.traceId
}

/** Returns the current full trace context, or undefined if outside a request. */
export function currentTrace(): TraceContext | undefined {
  return als.getStore()
}

/**
 * Run a function inside a trace context. Used internally by serve().
 * If an incoming trace header is present, it's reused; otherwise a new one is generated.
 */
export function runWithTrace<T>(
  incomingTraceId: string | null,
  fn: () => T,
): T {
  const traceId = incomingTraceId || randomUUID()
  const startTime = Date.now()
  return als.run({ traceId, startTime }, fn)
}

/** Elapsed time in ms since the trace started. */
export function traceElapsed(): number {
  const ctx = als.getStore()
  if (!ctx) return 0
  return Date.now() - ctx.startTime
}
