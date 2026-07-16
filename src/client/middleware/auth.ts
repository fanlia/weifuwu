/**
 * auth middleware — 注入 ctx.user / ctx.login / ctx.logout / ctx.register
 *
 * ```tsx
 * app.use(api())
 * app.use(auth())
 *
 * // In component:
 * if (!ctx.user) return <LoginPage />
 * ctx.login(email, password)
 * ctx.logout()
 * ```
 */

import type { WfuiContext, AppMiddleware } from '../types.ts'
import { signal } from '../signal.ts'
import { setTokenGetter, getToken, ApiClient } from './api.ts'

export interface UserRecord {
  id: string
  email: string
  name: string
  role: string
  avatar?: string
}

export interface AuthOptions {
  /** localStorage key，默认 'wefu:auth' */
  storageKey?: string
  /** 登录 API 路径，默认 '/api/login' */
  loginPath?: string
  /** 注册 API 路径，默认 '/api/register' */
  registerPath?: string
  /** 获取当前用户 API 路径，默认 '/api/me' */
  mePath?: string
}

export function auth(opts: AuthOptions = {}): AppMiddleware {
  const storageKey = opts.storageKey ?? 'wefu:auth'
  const loginPath = opts.loginPath ?? '/api/login'
  const registerPath = opts.registerPath ?? '/api/register'
  const mePath = opts.mePath ?? '/api/me'

  return async (ctx: WfuiContext): Promise<WfuiContext> => {
    const userSignal = signal<UserRecord | null>(null)
    const tokenSignal = signal<string | null>(null)

    // 设置 token getter（供 ApiClient 读取）
    setTokenGetter(() => tokenSignal.value)

    // 从 localStorage 恢复
    function persist(user: UserRecord | null, token: string | null) {
      userSignal.value = user
      tokenSignal.value = token
      if (token && user) {
        localStorage.setItem(storageKey, JSON.stringify({ user, token }))
      } else {
        localStorage.removeItem(storageKey)
      }
    }

    // 恢复已有 session
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const { user, token } = JSON.parse(saved)
        userSignal.value = user
        tokenSignal.value = token
        setTokenGetter(() => token)
      }
    } catch { /* ignore corrupted storage */ }

    // 验证 token 有效性
    if (tokenSignal.value) {
      try {
        const api = new ApiClient()
        const user = await api.get<UserRecord>(mePath)
        persist(user, tokenSignal.value)
      } catch {
        persist(null, null)
      }
    }

    return {
      ...ctx,
      get user() { return userSignal.value },
      get token() { return tokenSignal.value },
      get isAuthenticated() { return !!tokenSignal.value && !!userSignal.value },

      async login(email: string, password: string) {
        const api = new ApiClient()
        const res = await api.post<{ user: UserRecord; token: string }>(loginPath, { email, password })
        persist(res.user, res.token)
      },

      logout() {
        persist(null, null)
      },

      async register(input: { email: string; name: string; password: string }) {
        const api = new ApiClient()
        const res = await api.post<{ user: UserRecord; token: string }>(registerPath, input)
        persist(res.user, res.token)
      },
    }
  }
}
