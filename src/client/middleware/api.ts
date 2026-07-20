/**
 * weifuwu/client api — HTTP 客户端中间件
 *
 * 注入 ctx.api，提供类型友好的 fetch 封装。
 * 支持 baseURL、默认 headers、请求/响应拦截器。
 *
 * ```ts
 * import { createApp, api } from 'weifuwu/client'
 *
 * const app = createApp()
 * app.use(api({ baseURL: '/api' }))
 *
 * // 在组件中：
 * function UsersPage(_props: {}, ctx: WfuiContext) {
 *   const [users, { loading }] = createResource(() => ctx.api.get<User[]>('/users'))
 *   // ...
 * }
 * ```
 */

import type { AppMiddleware } from '../types.ts'

export interface ApiOptions {
  /** API 基础路径 */
  baseURL?: string
  /** 默认请求头 */
  headers?: Record<string, string>
  /** 请求拦截器 */
  onRequest?: (req: { url: string; init: RequestInit }) => { url: string; init: RequestInit }
  /** 响应拦截器 */
  onResponse?: <T>(res: Response) => Promise<T>
}

export interface ApiClient {
  get: <T>(url: string, options?: ApiRequestOptions) => Promise<T>
  post: <T>(url: string, body?: unknown, options?: ApiRequestOptions) => Promise<T>
  put: <T>(url: string, body?: unknown, options?: ApiRequestOptions) => Promise<T>
  patch: <T>(url: string, body?: unknown, options?: ApiRequestOptions) => Promise<T>
  delete: <T>(url: string, options?: ApiRequestOptions) => Promise<T>
}

export interface ApiRequestOptions {
  headers?: Record<string, string>
  /** 自定义 signal（用于 AbortController） */
  signal?: AbortSignal
}

/**
 * API 客户端中间件 — 注入 ctx.api
 *
 * ```ts
 * app.use(api({ baseURL: import.meta.env.VITE_API_URL || '/api' }))
 *
 * // 组件中使用
 * const users = await ctx.api.get<User[]>('/users')
 * await ctx.api.post('/users', { name: 'Alice' })
 * await ctx.api.put('/users/1', { name: 'Bob' })
 * await ctx.api.delete('/users/1')
 * ```
 */
export function api(options?: ApiOptions): AppMiddleware {
  const opts: Required<Pick<ApiOptions, 'baseURL' | 'headers'>> = {
    baseURL: options?.baseURL ?? '',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  }

  const onRequest = options?.onRequest
  const onResponse = options?.onResponse

  async function request<T>(
    method: string,
    url: string,
    body?: unknown,
    reqOpts?: ApiRequestOptions,
  ): Promise<T> {
    const fullURL = opts.baseURL + url
    const init: RequestInit = {
      method,
      headers: { ...opts.headers, ...reqOpts?.headers },
      signal: reqOpts?.signal,
    }

    if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
      init.body = JSON.stringify(body)
    }

    // 请求拦截器
    let finalReq = { url: fullURL, init }
    if (onRequest) {
      finalReq = onRequest(finalReq)
    }

    const res = await fetch(finalReq.url, finalReq.init)

    // 响应拦截器
    if (onResponse) {
      return onResponse<T>(res)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new ApiError(res.status, text || res.statusText)
    }

    // 204 No Content 等无 body 的响应
    const contentLength = res.headers.get('content-length')
    if (res.status === 204 || contentLength === '0') {
      return undefined as T
    }

    return res.json() as Promise<T>
  }

  return (ctx) => {
    const client: ApiClient = {
      get: <T>(url: string, reqOpts?: ApiRequestOptions) => request<T>('GET', url, undefined, reqOpts),
      post: <T>(url: string, body?: unknown, reqOpts?: ApiRequestOptions) => request<T>('POST', url, body, reqOpts),
      put: <T>(url: string, body?: unknown, reqOpts?: ApiRequestOptions) => request<T>('PUT', url, body, reqOpts),
      patch: <T>(url: string, body?: unknown, reqOpts?: ApiRequestOptions) => request<T>('PATCH', url, body, reqOpts),
      delete: <T>(url: string, reqOpts?: ApiRequestOptions) => request<T>('DELETE', url, undefined, reqOpts),
    }

    ;(ctx as any).api = client
    return ctx
  }
}

/**
 * API 错误 — 包含 HTTP 状态码和响应文本。
 *
 * ```ts
 * try {
 *   await ctx.api.get('/users')
 * } catch (e) {
 *   if (e instanceof ApiError) {
 *     console.log(e.status, e.message)
 *   }
 * }
 * ```
 */
export class ApiError extends Error {
  status: number
  body: string

  constructor(status: number, body: string) {
    super(`API Error ${status}: ${body}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}
