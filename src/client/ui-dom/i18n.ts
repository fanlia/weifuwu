/**
 * weifuwu i18n — 中间件
 *
 * 注入 ctx.i18n 支持运行时语言切换。
 *
 * 使用:
 *   app.use(i18n({ locale: 'en', messages: { 'title': 'Dashboard' } }))
 *   ctx.i18n?.t('title')        // → 'Dashboard'
 *   ctx.i18n?.setLocale('zh-CN') // → 切换语言，自动重渲染
 */

import type { AppMiddleware, UIContext } from './types.ts'
import { zhCN } from './locale/zh_CN.ts'
import { enUS } from './locale/en_US.ts'

const LOCALE_PACKAGES: Record<string, LocalePackage> = {
  'zh-CN': zhCN,
  'en-US': enUS,
}

export interface I18nOptions {
  locale?: string
  messages?: Record<string, string>
  components?: Record<string, Record<string, string>>
}

export interface LocalePackage {
  messages?: Record<string, string>
  components?: Record<string, Record<string, string>>
}

export interface I18nState {
  locale: string
  t: (key: string, fallback?: string) => string
  setLocale: (lang: string) => void
  components: Record<string, Record<string, string>>
}

function resolveLang(locale: string): string {
  if (LOCALE_PACKAGES[locale]) return locale
  const prefix = locale.split('-')[0]
  const match = Object.keys(LOCALE_PACKAGES).find(k => k.startsWith(prefix))
  return match ?? 'zh-CN'
}

/** i18n 中间件注入到 ctx 的字段 */
export interface I18nInjected {
  i18n: I18nState
}

export function i18n(opts: I18nOptions = {}): AppMiddleware<{}, I18nInjected> {
  const { locale: raw = 'zh-CN', messages = {}, components = {} } = opts
  const lang = resolveLang(raw)
  const pkg = LOCALE_PACKAGES[lang]

  let merged = mergeLocales(pkg, messages, components)

  const state: I18nState = {
    locale: lang,
    t: (key: string, fallback?: string) => merged.messages?.[key] ?? fallback ?? key,
    setLocale: () => {},
    components: merged.components,
  }

  return (ctx: UIContext) => {
    // 中间件注入 ctx.i18n（I18nInjected）——局部类型化引用替代 as any
    const c = ctx as UIContext & I18nInjected
    c.i18n = state

    state.setLocale = (raw: string) => {
      const lang = resolveLang(raw)
      const pkg = LOCALE_PACKAGES[lang]
      if (!pkg) return
      merged = mergeLocales(pkg, messages, components)
      state.locale = lang
      state.components = merged.components
      // 语言切换 → 页面级重渲染（vdom3：pageCtx.render 调度——组件重渲染读最新
      // ctx.i18n；vdom2 的 bumpCtxVersion/三态 skip 机制已随 vdom2 删除）
      ;(c as { render?: () => void }).render?.()
      ;(c as any).ui?.render?.()
    }

    return ctx as UIContext & I18nInjected
  }
}

function mergeLocales(
  pkg: LocalePackage | undefined,
  userMessages: Record<string, string>,
  userComponents: Record<string, Record<string, string>>,
) {
  return {
    messages: { ...pkg?.messages, ...userMessages },
    components: deepMerge(pkg?.components ?? {}, userComponents),
  }
}

function deepMerge(a: Record<string, any>, b: Record<string, any>): Record<string, any> {
  const result = { ...a }
  for (const key of Object.keys(b)) {
    if (typeof b[key] === 'object' && b[key] !== null && typeof result[key] === 'object') {
      result[key] = { ...result[key], ...b[key] }
    } else {
      result[key] = b[key]
    }
  }
  return result
}
