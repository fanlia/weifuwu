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
  /** 自动鉴权 token（函数/静态——注入 Authorization: Bearer 头） */
  token?: string | (() => string | null)
  /** 401 钩子（返回 true = 已刷新可重试——false/undefined = 走错误路径） */
  onUnauthorized?: () => Promise<boolean> | boolean
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
    _retried = false,
  ): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const tokenAtSend = typeof opts.token === 'function' ? opts.token() : opts.token
    try {
      const token = tokenAtSend
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        ...(typeof opts.headers === 'function' ? opts.headers() : opts.headers),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...reqOpts.headers,
      }
      const res = await fetch(baseUrl + url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      // 401：onUnauthorized 钩子（刷新重试一次——失败/无钩子走错误路径）
      // **旋转安全（G13——2026-XX 走查实证）**：旋转型 refresh token（一次一换）下，
      // 并发 401 中第一个触发 refresh 旋转成功，其余请求若紧接着调 onUnauthorized
      // 会用已作废的旧 refreshToken 再刷 → 失败 → 轻则静默空数据、重则误踢登录。
      // 修复：401 时先比对此刻 token 与发出时的快照——已变化 = 其它请求已完成
      // refresh → **直接重试**（不碰 onUnauthorized）；未变才走刷新钩子。
      if (res.status === 401 && !_retried) {
        const tokenNow = typeof opts.token === 'function' ? opts.token() : opts.token
        if (tokenNow && tokenNow !== tokenAtSend) {
          return request<T>(method, url, body, reqOpts, true)
        }
        const ok = opts.onUnauthorized ? await opts.onUnauthorized() : false
        if (ok) return request<T>(method, url, body, reqOpts, true)
      }
      if (!res.ok) {
        // 服务端错误体保留（{error} 约定——业务错误信息不丢失）：
        // 旧行为只报「请求失败 404: GET ...」——服务端语义（如「Agent 不存在」）
        // 在客户端不可见——错误面文案/判定全部瞎（AgentDetail notFound 误报实证）
        let serverMsg = ''
        try {
          const text = await res.text()
          if (text) {
            const body = JSON.parse(text)
            if (body && typeof body === 'object' && typeof body.error === 'string') serverMsg = body.error
          }
        } catch { /* 非 JSON 体忽略 */ }
        throw new ApiError(
          serverMsg || `[api] 请求失败 ${res.status}: ${method} ${url}`,
          res.status,
        )
      }
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
