/**
 * weifuwu/ui-dom api — HTTP 客户端中间件
 *
 * 注入 ctx.api，提供类型友好的 fetch 封装。
 * 支持 baseURL、默认 headers、请求/响应拦截器。
 *
 * ```ts
 * import { UIRouter, api } from 'weifuwu/ui-dom'
 *
 * const app = new UIRouter()
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
import { extendCtx } from '../types.ts'

export interface ApiOptions {
  /** API 基础路径 */
  baseURL?: string
  /** 默认请求头 */
  headers?: Record<string, string>
  /** 动态鉴权 token：非空时自动加 `Authorization: Bearer <token>`（请求头未显式指定时） */
  token?: () => string | null
  /** 请求拦截器 */
  onRequest?: (req: { url: string; init: RequestInit }) => { url: string; init: RequestInit }
  /** 响应拦截器 */
  onResponse?: <T>(res: Response) => Promise<T>
  /** 请求超时(ms), 默认 0 = 无超时 */
  timeout?: number
  /** 401 回调（token 过期/无效——清理凭证 + 跳转登录等；403 不触发——权限不足非认证问题） */
  onUnauthorized?: () => void
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
/** api 中间件注入到 ctx 的字段 */
export interface ApiInjected {
  api: ApiClient
}

export function api(options?: ApiOptions): AppMiddleware<{}, ApiInjected> {
  const opts: Required<Pick<ApiOptions, 'baseURL' | 'headers'>> = {
    baseURL: options?.baseURL ?? '',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  }

  const onRequest = options?.onRequest
  const onResponse = options?.onResponse

  const timeoutMs = options?.timeout ?? 0

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
    }

    // 自动鉴权：token 非空且请求头未显式指定 Authorization 时注入
    // 用法：`api({ token: () => localStorage.getItem('token') })`——apps 不再手写 Bearer 头
    const token = options?.token?.()
    if (token && !(init.headers as Record<string, string>).Authorization) {
      ;(init.headers as Record<string, string>).Authorization = `Bearer ${token}`
    }

    // 超时合并：如果设置了 timeout 或有用户 signal，创建合并的 AbortController
    const hasTimeout = timeoutMs > 0
    const hasUserSignal = !!reqOpts?.signal
    let abortController: AbortController | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    if (hasTimeout || hasUserSignal) {
      abortController = new AbortController()
      init.signal = abortController.signal

      if (hasTimeout) {
        timer = setTimeout(() => abortController!.abort(new Error('Request timed out')), timeoutMs)
      }

      if (hasUserSignal) {
        reqOpts!.signal!.addEventListener('abort', () => abortController!.abort())
      }
    }

    if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
      init.body = JSON.stringify(body)
    }

    // 请求拦截器
    let finalReq = { url: fullURL, init }
    if (onRequest) {
      finalReq = onRequest(finalReq)
    }

    try {
      const res = await fetch(finalReq.url, finalReq.init)

      // 401 未认证：调用 onUnauthorized（token 过期/无效——清理 + 跳转）——仍 throw 供调用方 catch
      if (res.status === 401) options?.onUnauthorized?.()

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

      // 优先 JSON 解析，失败则回退到 text
      const ct = (res.headers.get('content-type') || '').toLowerCase()
      if (ct.includes('application/json') || ct.includes('json')) {
        return res.json() as Promise<T>
      }
      return res.text() as unknown as Promise<T>
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  return (ctx) => {
    const client: ApiClient = {
      get: <T = any>(url: string, reqOpts?: ApiRequestOptions) => request<T>('GET', url, undefined, reqOpts),
      post: <T = any>(url: string, body?: unknown, reqOpts?: ApiRequestOptions) => request<T>('POST', url, body, reqOpts),
      put: <T = any>(url: string, body?: unknown, reqOpts?: ApiRequestOptions) => request<T>('PUT', url, body, reqOpts),
      patch: <T = any>(url: string, body?: unknown, reqOpts?: ApiRequestOptions) => request<T>('PATCH', url, body, reqOpts),
      delete: <T = any>(url: string, reqOpts?: ApiRequestOptions) => request<T>('DELETE', url, undefined, reqOpts),
    }

    return extendCtx(ctx, { api: client })
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
