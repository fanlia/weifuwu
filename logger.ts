import type { Middleware } from './types.ts'

export interface LoggerOptions {
  format?: 'short' | 'combined'
}

export function logger(options?: LoggerOptions): Middleware {
  return async (req, ctx, next) => {
    const start = Date.now()
    const url = new URL(req.url)
    try {
      const res = await next(req, ctx)
      const ms = Date.now() - start
      if (options?.format === 'combined') {
        console.log(`${req.method} ${url.pathname}${url.search} ${res.status} ${ms}ms`)
      } else {
        console.log(`${req.method} ${url.pathname} ${res.status} ${ms}ms`)
      }
      return res
    } catch (err) {
      const ms = Date.now() - start
      console.log(`${req.method} ${url.pathname} 500 ${ms}ms`)
      throw err
    }
  }
}
