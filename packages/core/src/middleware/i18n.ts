/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Router } from '../core/router.ts'
import { getCookies } from '../core/cookie.ts'
import type { Context, Middleware } from '../types.ts'
// Augment Context with i18n property
declare module '../types.ts' {
  interface Context {
    i18n: I18nInjected
  }
}

export interface I18nInjected {
  locale: string
  messages?: Record<string, unknown>
  t: (key: string, params?: Record<string, string>, fallback?: string) => string
  set?: (value: string, loc?: string) => Response
}

export interface I18nOptions {
  /** Default locale (default: 'en'). */
  default?: string
  /** Directory containing `{locale}.json` translation files. */
  dir?: string
  /** Inline translation messages keyed by locale. */
  messages?: Record<string, Record<string, unknown>>
  /** Cookie name for locale (default: 'locale'). Set empty to disable. */
  cookie?: string
  /** Whether to detect locale from Accept-Language header (default: true). */
  fromAcceptLanguage?: boolean
}

const DEFAULTS = {
  default: 'en',
  cookie: 'locale',
  fromAcceptLanguage: true,
}

function translate(
  msgs: Record<string, unknown>,
  key: string,
  params?: Record<string, string>,
  fallback?: string,
): string {
  const msg = key.split('.').reduce((o: any, k: string) => o?.[k], msgs)
  if (msg === undefined || msg === null) return fallback ?? key
  if (!params) return String(msg)
  let result = String(msg)
  for (const [k, v] of Object.entries(params)) {
    result = result.replace(`{${k}}`, v)
  }
  return result
}

/**
 * i18n module. Returns a Router with an attached `.middleware()` method.
 *
 * ```ts
 * const l = i18n({ dir: './locales' })
 * app.use(l.middleware())  // → ctx.i18n = { locale, t, set }
 * app.mount('/', l)          // → GET /__lang/:locale (switch route)
 * ```
 */
export interface I18nModule extends Router {
  /** Middleware that injects `ctx.i18n = { locale, t, set }`. */
  middleware: () => Middleware<Context, Context & I18nInjected>
}

export function i18n(options?: I18nOptions): I18nModule {
  const opts = { ...DEFAULTS, ...options }
  const dir = opts.dir ? resolve(opts.dir) : undefined
  const cache = new Map<string, Record<string, unknown>>()

  function validLocale(locale: string): boolean {
    return /^[\w-]+$/.test(locale) && !locale.includes('..')
  }

  async function loadMessages(locale: string): Promise<Record<string, unknown>> {
    if (opts.messages?.[locale] && Object.keys(opts.messages[locale]).length > 0) {
      cache.set(locale, opts.messages[locale])
      return opts.messages[locale]
    }
    if (!dir || !validLocale(locale)) return {}
    const cached = cache.get(locale)
    if (cached) return cached
    const filePath = join(dir, `${locale}.json`)
    try {
      await stat(filePath)
      const content = await readFile(filePath, 'utf-8')
      const data = JSON.parse(content) as Record<string, unknown>
      cache.set(locale, data)
      return data
    } catch {
      /* file not found */
    }
    const short = locale.split('-')[0]
    if (short !== locale) {
      const fallback = cache.get(short) || (await loadMessages(short))
      if (fallback && Object.keys(fallback).length > 0) {
        cache.set(locale, fallback)
        return fallback
      }
    }
    return {}
  }

  function detectLocale(req: Request): string {
    if (opts.cookie) {
      const fromCookie = getCookies(req)[opts.cookie]
      if (fromCookie && validLocale(fromCookie)) return fromCookie
    }
    if (opts.fromAcceptLanguage) {
      const fromHeader = req.headers.get('Accept-Language')?.split(',')[0]?.trim()
      if (fromHeader && validLocale(fromHeader)) return fromHeader
    }
    return opts.default
  }

  const mw: Middleware<Context, Context & I18nInjected> = async (req, ctx, next) => {
    const locale = detectLocale(req)
    const msgs = await loadMessages(locale)

    ;(ctx as Context & I18nInjected).i18n = {
      locale,
      messages: msgs,
      t: (key: string, params?: Record<string, string>, fallback?: string) =>
        translate(msgs, key, params, fallback),
      set: (value: string, loc?: string) => {
        const cookie = `${opts.cookie}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`
        const location = loc ?? (req.headers.get('referer') || '/')
        return new Response(null, {
          status: 302,
          headers: { Location: location, 'Set-Cookie': cookie },
        })
      },
    }

    return next(req, ctx as Context & I18nInjected)
  }
  mw.__meta = { injects: ['i18n'], depends: [] }

  class I18nRouter extends Router {
    middleware() {
      return mw
    }
  }

  const router = new I18nRouter()
  router.get('/__lang/:locale', async (req) => {
    const url = new URL(req.url)
    const value = url.pathname.split('/__lang/')[1] ?? ''
    const cookie = `${opts.cookie}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`
    const messages = await loadMessages(value)
    const accept = req.headers.get('accept') ?? ''
    if (accept.includes('application/json')) {
      return Response.json(
        {
          ok: true,
          locale: value,
          messages: Object.keys(messages).length > 0 ? messages : undefined,
        },
        { headers: { 'Set-Cookie': cookie } },
      )
    }
    const referer = req.headers.get('referer') || '/'
    return new Response(null, { status: 302, headers: { Location: referer, 'Set-Cookie': cookie } })
  })

  return router
}
