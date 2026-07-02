/* eslint-disable no-console */
import type { Middleware, Context } from '../types.ts'
import { currentTraceId } from './trace.ts'

export interface LoggerOptions {
  /** 'short' = method + path + status + ms, 'combined' = short + query string, 'json' = structured stderr JSON */
  format?: 'short' | 'combined' | 'json'
}

export interface LogEvent {
  level: 'info' | 'warn' | 'error'
  message: string
  method?: string
  path?: string
  status?: number
  elapsed_ms?: number
  traceId?: string
  timestamp?: string
}

function emit(event: LogEvent): void {
  event.traceId = event.traceId ?? currentTraceId()
  event.timestamp = new Date().toISOString()
  process.stderr.write(JSON.stringify(event) + '\n')
}

export function logger(options?: LoggerOptions): Middleware<Context, Context> {
  const format = options?.format ?? 'short'

  return async (req, ctx, next) => {
    const start = Date.now()
    const url = new URL(req.url)

    try {
      const res = await next(req, ctx)
      const ms = Date.now() - start
      const pathAndQuery = format === 'combined' ? url.pathname + url.search : url.pathname

      if (format === 'json') {
        emit({
          level: 'info',
          message: 'request',
          method: req.method,
          path: pathAndQuery,
          status: res.status,
          elapsed_ms: ms,
        })
      } else {
        console.log(`${req.method} ${pathAndQuery} ${res.status} ${ms}ms`)
      }

      return res
    } catch (err) {
      const ms = Date.now() - start
      const pathAndQuery = format === 'combined' ? url.pathname + url.search : url.pathname

      if (format === 'json') {
        emit({
          level: 'error',
          message: err instanceof Error ? err.message : String(err),
          method: req.method,
          path: pathAndQuery,
          status: 500,
          elapsed_ms: ms,
        })
      } else {
        console.log(`${req.method} ${pathAndQuery} 500 ${ms}ms`)
      }
      throw err
    }
  }
}
