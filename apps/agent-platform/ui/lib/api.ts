/**
 * API 客户端 — 自动 Token 刷新
 *
 * 用法: 替代直接 fetch，自动处理 401 → refresh → retry
 *
 * ```ts
 * import { api } from '../lib/api'
 * const data = await api('/api/agents', { headers: { ... } })
 * ```
 */

const REFRESH_KEY = 'agent_platform_refresh'

export function getRefreshToken(): string | null {
  try { return localStorage.getItem(REFRESH_KEY) } catch { return null }
}

export function setRefreshToken(token: string | null) {
  try {
    if (token) localStorage.setItem(REFRESH_KEY, token)
    else localStorage.removeItem(REFRESH_KEY)
  } catch { /* ignore */ }
}

let refreshing: Promise<boolean> | null = null

/** 刷新会话（/api/auth/refresh——更新 localStorage token——成功 true）——
 *  并发合并（多个 401 同时触发只刷一次）——ctx.api 的 onRefresh 接线复用 */
export async function refreshSession(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const refreshRes = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (!refreshRes.ok) return false
        const data = await refreshRes.json()
        // 更新 localStorage 中的 token
        try {
          localStorage.setItem('agent_platform_token', data.token)
          setRefreshToken(data.refreshToken)
        } catch { /* ignore */ }
        return true
      } catch {
        return false
      } finally {
        refreshing = null
      }
    })()
  }
  return refreshing
}

/**
 * 带自动刷新功能的 fetch 封装
 */
export async function api(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init)

  // 非 401 直接返回
  if (res.status !== 401) return res

  // 401：尝试刷新 token
  const refreshed = await refreshSession()
  if (!refreshed) return res

  // 刷新成功，重试原始请求（带上新 token）
  const retryHeaders = new Headers(init?.headers)
  const newToken = typeof localStorage !== 'undefined'
    ? localStorage.getItem('agent_platform_token')
    : null
  if (newToken) retryHeaders.set('Authorization', `Bearer ${newToken}`)

  return fetch(input, { ...init, headers: retryHeaders })
}
