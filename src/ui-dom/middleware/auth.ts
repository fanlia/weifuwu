/**
 * weifuwu/ui-dom auth — 认证状态管理中间件
 *
 * 管理 token 存储、登录/登出、当前用户信息。
 * 不依赖 signal，状态为普通对象，组件通过 ctx.ui.render() 刷新。
 */

import type { AppMiddleware } from '../types.ts'
import { extendCtx } from '../types.ts'

export interface AuthOptions {
  storage?: Storage
  tokenKey?: string
  userKey?: string
  refreshTokenKey?: string
  refreshEndpoint?: string
}

export interface AuthClient {
  token: string | null
  user: any
  isLoggedIn: boolean
  login: (token: string, user: any, refreshToken?: string) => void
  logout: () => void
  setUser: (user: any) => void
  refresh: () => Promise<boolean>
}

function decodeJWT(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload))
  } catch { return null }
}

function isTokenExpired(token: string): boolean {
  const payload = decodeJWT(token)
  if (!payload?.exp) return true
  return (payload.exp as number) * 1000 - 30000 < Date.now()
}

/** auth 中间件注入到 ctx 的字段 */
export interface AuthInjected {
  auth: AuthClient
}

export function auth(options?: AuthOptions): AppMiddleware<{}, AuthInjected> {
  const storage = options?.storage ?? localStorage
  const tokenKey = options?.tokenKey ?? 'weifuwu_token'
  const userKey = options?.userKey ?? 'weifuwu_user'
  const refreshTokenKey = options?.refreshTokenKey ?? 'weifuwu_refresh'
  const refreshEndpoint = options?.refreshEndpoint ?? '/api/auth/refresh'

  return (ctx) => {
    const savedToken = storage.getItem(tokenKey)
    const savedUserStr = storage.getItem(userKey)

    const authClient: AuthClient = {
      token: savedToken,
      user: savedUserStr ? JSON.parse(savedUserStr) : null,
      get isLoggedIn() { return this.token !== null },

      login(newToken: string, newUser: any, refreshToken?: string) {
        authClient.token = newToken
        authClient.user = newUser
        storage.setItem(tokenKey, newToken)
        storage.setItem(userKey, JSON.stringify(newUser))
        if (refreshToken) storage.setItem(refreshTokenKey, refreshToken)
      },

      logout() {
        authClient.token = null
        authClient.user = null
        storage.removeItem(tokenKey)
        storage.removeItem(userKey)
        storage.removeItem(refreshTokenKey)
      },

      setUser(newUser: any) {
        authClient.user = newUser
        storage.setItem(userKey, JSON.stringify(newUser))
      },

      async refresh(): Promise<boolean> {
        const rt = storage.getItem(refreshTokenKey)
        if (!rt) return false
        try {
          const res = await fetch(refreshEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: rt }),
          })
          if (!res.ok) {
            authClient.logout()
            return false
          }
          const data = await res.json()
          authClient.token = data.token
          storage.setItem(tokenKey, data.token)
          if (data.refreshToken) storage.setItem(refreshTokenKey, data.refreshToken)
          return true
        } catch { return false }
      },
    }

    if (savedToken && isTokenExpired(savedToken)) {
      authClient.refresh().catch(() => {})
    }

    return extendCtx(ctx, { auth: authClient })
  }
}
