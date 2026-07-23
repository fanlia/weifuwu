/**
 * weifuwu/client auth — 认证状态管理中间件
 *
 * 管理 token 存储、登录/登出、当前用户信息。
 * 与后端的配合由用户决定（JWT / session / OAuth 均可）。
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
}

export interface AuthClient {
  /** 当前 token（信号） */
  token: Signal<string | null>
  /** 当前用户信息（信号） */
  user: Signal<AuthUser | null>
  /** 是否已登录（computed） */
  isLoggedIn: Signal<boolean>
  /** 登录：存储 token + 用户信息 */
  login: (token: string, user: AuthUser) => void
  /** 退出：清除 token + 用户信息 */
  logout: () => void
  /** 设置用户信息（用于从 API 刷新后更新） */
  setUser: (user: AuthUser) => void
  /** 获取 Authorization header 值（'Bearer xxx' 或 null） */
  authorizationHeader: Signal<string | null>
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

    const authClient: AuthClient = {
      token,
      user,
      isLoggedIn,
      authorizationHeader,

      login(newToken: string, newUser: AuthUser) {
        token.value = newToken
        user.value = newUser
        storage.setItem(tokenKey, newToken)
        storage.setItem(userKey, JSON.stringify(newUser))
      },

      logout() {
        token.value = null
        user.value = null
        storage.removeItem(tokenKey)
        storage.removeItem(userKey)
      },

      setUser(newUser: AuthUser) {
        user.value = newUser
        storage.setItem(userKey, JSON.stringify(newUser))
      },
    }

    return extendCtx(ctx, { auth: authClient })
  }
}
