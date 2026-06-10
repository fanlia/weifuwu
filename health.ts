import type { Handler } from './types.ts'
import { Router } from './router.ts'

export interface HealthOptions {
  path?: string
  check?: () => Promise<void>
}

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
