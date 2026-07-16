/**
 * api middleware — 注入 ctx.api
 *
 * ```tsx
 * app.use(api({ baseUrl: '/api' }))
 * app.use(auth({ api: ctx.api }))
 *
 * // In component:
 * const users = await ctx.api.get('/api/users')
 * const msg = await ctx.api.post('/api/messages', { body: 'hello' })
 * ```
 */

import type { WfuiContext, AppMiddleware } from '../types.ts'

// ── 全局 token getter（由 auth middleware 设置） ────────────

let _getToken: () => string | null = () => null

export function setTokenGetter(fn: () => string | null) {
  _getToken = fn
}

export function getToken(): string | null {
  return _getToken()
}

// ── API 客户端 ──────────────────────────────────────────────

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(`[${status}] ${message}`)
    this.name = 'ApiError'
    this.status = status
  }
}

export class ApiClient {
  #baseUrl: string

  constructor(baseUrl: string = '/api') {
    this.#baseUrl = baseUrl
  }

  async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {}
    const token = getToken()

    if (token) headers['Authorization'] = `Bearer ${token}`
    if (body != null) headers['Content-Type'] = 'application/json'

    const res = await fetch(`${this.#baseUrl}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      throw new ApiError(res.status, await res.text().catch(() => res.statusText))
    }

    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
  }

  get<T = unknown>(path: string): Promise<T> { return this.request('GET', path) }
  post<T = unknown>(path: string, body?: unknown): Promise<T> { return this.request('POST', path, body) }
  put<T = unknown>(path: string, body?: unknown): Promise<T> { return this.request('PUT', path, body) }
  patch<T = unknown>(path: string, body?: unknown): Promise<T> { return this.request('PATCH', path, body) }
  delete<T = unknown>(path: string): Promise<T> { return this.request('DELETE', path) }
}

export function api(opts: { baseUrl?: string } = {}): AppMiddleware {
  return (ctx: WfuiContext): WfuiContext => {
    ctx.api = new ApiClient(opts.baseUrl ?? '/api')
    return ctx
  }
}
