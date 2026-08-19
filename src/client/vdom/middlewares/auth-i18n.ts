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
}

export interface AuthOptions {
  storage?: StorageAdapter
  /** 存储 key（默认 'wf-auth-token'） */
  key?: string
  /** token 前缀（默认 'Bearer'） */
  scheme?: string
}

/** 创建 auth 客户端（每 serve 实例独立） */
export function auth(opts: AuthOptions = {}): AuthClient {
  const key = opts.key ?? 'wf-auth-token'
  const scheme = opts.scheme ?? 'Bearer'
  const storage = opts.storage ?? { get: () => null, set: () => {} }
  return {
    getToken(): string | null {
      const v = storage.get(key)
      return v ? v : null // 空字符串（logout）归一为 null
    },
    setToken(token: string | null): void {
      if (token === null) storage.set(key, '')
      else storage.set(key, token)
    },
    headers(): Record<string, string> {
      const token = storage.get(key)
      return token ? { authorization: `${scheme} ${token}` } : {}
    },
    logout(): void {
      storage.set(key, '')
    },
  }
}

/** 消息字典（locale → key → 文本） */
export type Messages = Record<string, Record<string, string>>

export interface I18nOptions {
  locale?: string
  messages: Messages
}

export interface I18nState {
  locale: string
  setLocale(locale: string): void
  /** 取文本（{name} 插值——缺失 key 返回 key 本身——不静默） */
  t(key: string, params?: Record<string, unknown>): string
}

/** 创建 i18n（locale/messages——t 插值） */
export function i18n(opts: I18nOptions): I18nState {
  let locale = opts.locale ?? Object.keys(opts.messages)[0] ?? 'default'
  return {
    get locale() {
      return locale
    },
    setLocale(l: string): void {
      locale = l
    },
    t(key: string, params?: Record<string, unknown>): string {
      const dict = opts.messages[locale]
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
