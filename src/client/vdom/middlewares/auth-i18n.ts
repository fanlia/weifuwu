/**
 * vdom middlewares — auth/i18n（ctx.auth 令牌管理 + ctx.i18n 国际化）
 *
 * - auth：token 管理（get/set/headers 注入——logout——storage 经注入——
 *   默认内存——零全局 localStorage 直接访问）
 * - i18n：locale/messages——t(key, params) 插值——setLocale 切换
 */

/** 存储适配（auth token 持久化——默认内存——生产可传 localStorage 适配） */
export interface StorageAdapter {
  get(key: string): string | null
  set(key: string, value: string): void
}

export interface AuthClient {
  getToken(): string | null
  setToken(token: string | null): void
  /** 请求头注入（Authorization: Bearer） */
  headers(): Record<string, string>
  logout(): void
  /** 当前用户（userKey 持久化——login/setUser 写——未登录 null） */
  user: unknown
  /** 是否已登录（token 存在） */
  isLoggedIn: boolean
  /** 登录（token/user/refreshToken 持久化——onAuth 钩子接线） */
  login(token: string, user: unknown, refreshToken?: string | null): void
  /** 更新用户信息（原地写——userKey 持久化） */
  setUser(user: unknown): void
  /** 刷新 token（onRefresh 钩子——成功重写 token 返回 true） */
  refresh(): Promise<boolean>
}

export interface AuthOptions {
  storage?: StorageAdapter
  /** 存储 key（默认 'wf-auth-token'） */
  key?: string
  /** token 前缀（默认 'Bearer'） */
  scheme?: string
  /** token 存储 key（默认取 key） */
  tokenKey?: string
  /** 用户存储 key（默认 'wf-auth-user'） */
  userKey?: string
  /** refresh token 存储 key（默认 'wf-auth-refresh'） */
  refreshTokenKey?: string
  /** 登录钩子（外部接线——如 api 刷新链） */
  onAuth?: (auth: AuthClient) => void
  /** 刷新钩子（refresh() 调用——成功返回 true） */
  onRefresh?: () => Promise<boolean> | boolean
}

/** 创建 auth 客户端（每 serve 实例独立） */
export function auth(opts: AuthOptions = {}): AuthClient {
  const scheme = opts.scheme ?? 'Bearer'
  const storage = opts.storage ?? { get: () => null, set: () => {} }
  const tokenKey = opts.tokenKey ?? opts.key ?? 'wf-auth-token'
  const userKey = opts.userKey ?? 'wf-auth-user'
  const refreshKey = opts.refreshTokenKey ?? 'wf-auth-refresh'
  let userCache: unknown = null
  try {
    const u = storage.get(userKey)
    if (u) userCache = JSON.parse(u)
  } catch { /* 损坏数据——按未登录 */ }
  const client: AuthClient = {
    getToken(): string | null {
      const v = storage.get(tokenKey)
      return v ? v : null // 空字符串（logout）归一为 null
    },
    setToken(token: string | null): void {
      if (token === null) storage.set(tokenKey, '')
      else storage.set(tokenKey, token)
    },
    headers(): Record<string, string> {
      const token = storage.get(tokenKey)
      return token ? { authorization: `${scheme} ${token}` } : {}
    },
    logout(): void {
      storage.set(tokenKey, '')
      storage.set(userKey, '')
      storage.set(refreshKey, '')
      userCache = null
    },
    get user() {
      return userCache
    },
    get isLoggedIn() {
      return !!storage.get(tokenKey)
    },
    login(token: string, user: unknown, refreshToken?: string | null): void {
      storage.set(tokenKey, token)
      if (user !== undefined) {
        storage.set(userKey, JSON.stringify(user))
        userCache = user
      }
      if (refreshToken !== undefined && refreshToken !== null) storage.set(refreshKey, refreshToken)
      opts.onAuth?.(client)
    },
    setUser(user: unknown): void {
      storage.set(userKey, JSON.stringify(user))
      userCache = user
    },
    async refresh(): Promise<boolean> {
      if (!opts.onRefresh) return false
      const ok = await opts.onRefresh()
      if (ok) opts.onAuth?.(client)
      return ok
    },
  }
  return client
}

/** 消息字典（locale → key → 文本） */
export type Messages = Record<string, Record<string, string>>

export interface I18nOptions {
  locale?: string
  /** 消息字典（可选——仅 locale 切换场景可省——t 缺失返回 key） */
  messages?: Messages
}

export interface I18nState {
  locale: string
  setLocale(locale: string): void
  /** 取文本（{name} 插值——缺失 key 返回 key 本身——不静默） */
  t(key: string, params?: Record<string, unknown>): string
  /** 组件文案面（ui-dom 兼容——SheetGrid/SlideCanvas 读组件级文案——
   *  可选——无注入时 undefined） */
  components?: Record<string, Record<string, string>>
}

/** 创建 i18n（locale/messages——t 插值） */
export function i18n(opts: I18nOptions = {}): I18nState {
  const messages = opts.messages ?? {}
  let locale = opts.locale ?? Object.keys(messages)[0] ?? 'default'
  return {
    get locale() {
      return locale
    },
    setLocale(l: string): void {
      locale = l
    },
    t(key: string, params?: Record<string, unknown>): string {
      const dict = messages[locale]
      let text = dict?.[key] ?? key
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replaceAll(`{${k}}`, String(v))
        }
      }
      return text
    },
  }
}
