import type { Handler } from '../types.ts'
import { Router } from '../core/router.ts'

/** Options for {@link health}. */
export interface HealthOptions {
  /** Health check endpoint path (default: `'/__health'`). */
  path?: string
  /** Async function that throws if the service is unhealthy. Called on each request. */
  check?: () => Promise<void>
}

/**
 * Health check endpoint.
 *
 * Returns 200 with `'OK'` if the check passes, 503 if it fails.
 *
 * ```ts
 * import { health } from 'weifuwu'
 *
 * app.use(health({
 *   check: async () => {
 *     await db.query('SELECT 1')
 *   },
 * }))
 * ```
 */
export function health(options?: HealthOptions): Router {
  const path = options?.path ?? '/__health'
  const r = new Router()

  const handler: Handler = async () => {
    try {
      await options?.check?.()
      return new Response('OK', { status: 200 })
    } catch {
      return new Response('Service Unavailable', { status: 503 })
    }
  }

  r.get(path, handler)
  r.head(path, handler)

  return r
}
