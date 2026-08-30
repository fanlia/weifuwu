/**
 * vdom middlewares — api（请求客户端——ctx.api 注入面）
 *
 * 设计：fetch 封装——JSON 序列化/解析——超时（AbortController）——
 * ApiError（status）——onError 钩子——经注入（零全局直接访问——
 * 测试 mock fetch）。
 *
 * W2（VDOM-STREAM-FIX-PLAN）——401 单飞刷新流化（G13 修复的窗口堵死）：
 * - `refreshTrigger$`（Subject）：401 且 token 未变 → 触发事件
 * - `exhaustMap`：单飞刷新（刷新中后续触发被丢弃——**并发 401 只刷一次**）
 *   ——原 G13 快照比对堵不住「同拍双 401 在刷新完成前都走 onUnauthorized
 *   分支」的窗口（两者 tokenNow 都未变）；单飞 = 结构上不可能双刷
 * - `refreshDone$`：刷新结果广播（true=成功可重试）——等待者 take(1)
 * - 旋转 token 双刷新竞态（走查实证）：exhaustMap 内建 single-flight 根治
 */

import { Subject, fromPromise } from '../observable/index.ts'
import { exhaustMap, take } from '../observable/index.ts'

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

  // ── W2 单飞刷新流（exhaustMap——并发 401 只刷一次） ──
  const refreshTrigger$ = new Subject<void>()
  const refreshDone$ = new Subject<boolean>()
  refreshTrigger$.asObservable().pipe(
    exhaustMap(() => fromPromise(Promise.resolve(opts.onUnauthorized?.() ?? false))),
  ).subscribe({
    next: (ok) => refreshDone$.next(ok),
    error: () => refreshDone$.next(false), // 刷新异常 → 失败（不静默——等待者走错误路径）
  })

  /** 401 处理：token 未变 → 触发单飞刷新 → 等结果（take(1)）⟹ true 重试 */
  const waitForRefresh = async (): Promise<boolean> => {
    refreshTrigger$.next()
    return new Promise<boolean>((resolve) => {
      // take(1)：收到首个结果即退订（无泄漏——每次 401 一个订阅，用完即走）
      refreshDone$.asObservable().pipe(take(1)).subscribe({ next: (ok) => resolve(ok) })
    })
  }

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
      // 401：单飞刷新（G13 窗口堵死——exhaustMap）+ 快照比对（G13 保留——
      // token 已变 = 其它请求已完成刷新 → 直接重试不触发事件）
      if (res.status === 401 && !_retried) {
        const tokenNow = typeof opts.token === 'function' ? opts.token() : opts.token
        if (tokenNow && tokenNow !== tokenAtSend) {
          return request<T>(method, url, body, reqOpts, true)
        }
        const ok = await waitForRefresh()
        if (ok) return request<T>(method, url, body, reqOpts, true)
        throw new ApiError(`[api] 401 ${method} ${url}（刷新失败）`, 401)
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
