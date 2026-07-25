/**
 * weifuwu/client auth — 认证状态管理中间件
 *
 * 管理 token 存储、登录/登出、当前用户信息。
 * 页面刷新时自动检测 token 是否过期，过期则用 refresh token 续期。
 *
 * ```ts
 * import { createApp, auth } from 'weifuwu/client'
 *
 * const app = createApp()
 * app.use(auth())
 *
 * // 在组件中：
 * function NavBar(_props: {}, ctx: WfuiContext) {
 *   return (
 *     <Show when={ctx.auth.isLoggedIn} fallback={<LoginButton />}>
 *       <span>{ctx.auth.user.value?.name}</span>
 *       <button onClick={() => ctx.auth.logout()}>退出</button>
 *     </Show>
 *   )
 * }
 * ```
 */

import { signal, computed, type Signal } from '../signal.ts'
import type { AppMiddleware } from '../types.ts'
import { extendCtx } from '../types.ts'

/** 用户信息类型（由用户定义，这里仅作基础结构） */
export interface AuthUser {
  id: string | number
  name: string
  email?: string
  avatar?: string
  [key: string]: unknown
}

export interface AuthOptions {
  /** token 存储位置（默认 localStorage） */
  storage?: Storage
  /** token 在 storage 中的 key（默认 'weifuwu_token'） */
  tokenKey?: string
  /** 用户信息在 storage 中的 key（默认 'weifuwu_user'） */
  userKey?: string
  /** refresh token 在 storage 中的 key（默认 'weifuwu_refresh'） */
  refreshTokenKey?: string
  /** token 刷新接口路径（默认 '/api/auth/refresh'） */
  refreshEndpoint?: string
}

export interface AuthClient {
  /** 当前 token（信号） */
  token: Signal<string | null>
  /** 当前用户信息（信号） */
  user: Signal<AuthUser | null>
  /** 是否已登录（computed） */
  isLoggedIn: Signal<boolean>
  /** 登录：存储 token + 用户信息 + 可选 refreshToken */
  login: (token: string, user: AuthUser, refreshToken?: string) => void
  /** 退出：清除 token + 用户信息 */
  logout: () => void
  /** 设置用户信息（用于从 API 刷新后更新） */
  setUser: (user: AuthUser) => void
  /** 获取 Authorization header 值（'Bearer xxx' 或 null） */
  authorizationHeader: Signal<string | null>
  /** 手动触发 token 刷新 */
  refresh: () => Promise<boolean>
}

/**
 * 解码 JWT payload，返回 decoded 或 null
 */
function decodeJWT(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
    const decoded = atob(payload)
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

/**
 * 检查 JWT 是否已过期（留有 30 秒余量）
 */
function isTokenExpired(token: string): boolean {
  const payload = decodeJWT(token)
  if (!payload?.exp) return true
  return (payload.exp as number) * 1000 - 30000 < Date.now()
}

/**
 * 认证状态管理中间件 — 注入 ctx.auth
 *
 * ```ts
 * app.use(auth())
 *
 * // 组件中使用
 * const isLoggedIn = ctx.auth.isLoggedIn
 * const user = ctx.auth.user
 *
 * // 登录
 * ctx.auth.login('jwt-token', { id: 1, name: 'Alice' })
 *
 * // 退出
 * ctx.auth.logout()
 * ```
 */
export function auth(options?: AuthOptions): AppMiddleware {
  const storage = options?.storage ?? localStorage
  const tokenKey = options?.tokenKey ?? 'weifuwu_token'
  const userKey = options?.userKey ?? 'weifuwu_user'
  const refreshTokenKey = options?.refreshTokenKey ?? 'weifuwu_refresh'
  const refreshEndpoint = options?.refreshEndpoint ?? '/api/auth/refresh'

  return (ctx) => {
    // 从存储中恢复
    const savedToken = storage.getItem(tokenKey)
    const savedUserStr = storage.getItem(userKey)

    const token = signal<string | null>(savedToken)
    const user = signal<AuthUser | null>(
      savedUserStr ? JSON.parse(savedUserStr) : null,
    )

    const isLoggedIn = computed(() => token.value !== null)
    const authorizationHeader = computed(() => token.value ? `Bearer ${token.value}` : null)

    async function doRefresh(): Promise<boolean> {
      const rt = storage.getItem(refreshTokenKey)
      if (!rt) return false
      try {
        const res = await fetch(refreshEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        })
        if (!res.ok) {
          // refresh 失败 → 清除一切，让应用回到登录页
          token.value = null
          user.value = null
          storage.removeItem(tokenKey)
          storage.removeItem(userKey)
          storage.removeItem(refreshTokenKey)
          return false
        }
        const data = await res.json()
        // 更新 token
        token.value = data.token
        storage.setItem(tokenKey, data.token)
        // 如果有新的 refreshToken 也保存
        if (data.refreshToken) {
          storage.setItem(refreshTokenKey, data.refreshToken)
        }
        return true
      } catch {
        return false
      }
    }

    const authClient: AuthClient = {
      token,
      user,
      isLoggedIn,
      authorizationHeader,

      login(newToken: string, newUser: AuthUser, refreshToken?: string) {
        token.value = newToken
        user.value = newUser
        storage.setItem(tokenKey, newToken)
        storage.setItem(userKey, JSON.stringify(newUser))
        if (refreshToken) {
          storage.setItem(refreshTokenKey, refreshToken)
        }
      },

      logout() {
        token.value = null
        user.value = null
        storage.removeItem(tokenKey)
        storage.removeItem(userKey)
        storage.removeItem(refreshTokenKey)
      },

      setUser(newUser: AuthUser) {
        user.value = newUser
        storage.setItem(userKey, JSON.stringify(newUser))
      },

      refresh: doRefresh,
    }

    // 启动时自动检测 token 是否过期，过期则尝试续期
    if (savedToken && isTokenExpired(savedToken)) {
      // 异步触发 refresh，不阻塞中间件链
      doRefresh().catch(() => {})
    }

    return extendCtx(ctx, { auth: authClient })
  }
}
