/**
 * vdom middlewares — api（请求客户端——ctx.api 注入面）
 *
 * 设计：fetch 封装——JSON 序列化/解析——超时（AbortController）——
 * ApiError（status）——onError 钩子——经注入（零全局直接访问——
 * 测试 mock fetch）。
 */

export interface ApiOptions {
  /** 基础路径（前缀拼接） */
  baseUrl?: string
  /** 静态或动态头（动态：每次请求调用） */
  headers?: Record<string, string> | (() => Record<string, string>)
  /** 超时（ms——默认 15000） */
  timeout?: number
  /** 错误钩子（请求失败——不吞错误） */
  onError?: (err: ApiError) => void
}

export class ApiError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export interface ApiRequestOptions {
  headers?: Record<string, string>
}

export interface ApiClient {
  get<T>(url: string, opts?: ApiRequestOptions): Promise<T>
  post<T>(url: string, body?: unknown, opts?: ApiRequestOptions): Promise<T>
  put<T>(url: string, body?: unknown, opts?: ApiRequestOptions): Promise<T>
  delete<T>(url: string, opts?: ApiRequestOptions): Promise<T>
  patch<T>(url: string, body?: unknown, opts?: ApiRequestOptions): Promise<T>
  request<T>(method: string, url: string, body?: unknown, opts?: ApiRequestOptions): Promise<T>
}

/** 创建 api 客户端（每 serve 实例独立——测试隔离） */
export function api(opts: ApiOptions = {}): ApiClient {
  const baseUrl = opts.baseUrl ?? ''
  const timeoutMs = opts.timeout ?? 15000

  async function request<T>(
    method: string, url: string, body?: unknown, reqOpts: ApiRequestOptions = {},
  ): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        ...(typeof opts.headers === 'function' ? opts.headers() : opts.headers),
        ...reqOpts.headers,
      }
      const res = await fetch(baseUrl + url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      if (!res.ok) throw new ApiError(`[api] 请求失败 ${res.status}: ${method} ${url}`, res.status)
      const text = await res.text()
      return (text ? JSON.parse(text) : undefined) as T
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError((e as Error).message)
      opts.onError?.(err)
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    get: (url, o) => request('GET', url, undefined, o),
    post: (url, body, o) => request('POST', url, body, o),
    put: (url, body, o) => request('PUT', url, body, o),
    delete: (url, o) => request('DELETE', url, undefined, o),
    patch: (url, body, o) => request('PATCH', url, body, o),
    request,
  }
}
