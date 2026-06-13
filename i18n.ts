import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Context, Middleware } from './types.ts'
import { getCookies } from './cookie.ts'

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

export function i18n(options?: I18nOptions): Middleware {
  const opts = { ...DEFAULTS, ...options }
  const dir = opts.dir ? resolve(opts.dir) : undefined
  const cache = new Map<string, Record<string, unknown>>()

  function validLocale(locale: string): boolean {
    return /^[\w-]+$/.test(locale) && !locale.includes('..')
  }

  async function loadMessages(locale: string): Promise<Record<string, unknown>> {
    // Check inline messages first
    if (opts.messages?.[locale] && Object.keys(opts.messages[locale]).length > 0) {
      cache.set(locale, opts.messages[locale])
      return opts.messages[locale]
    }
    // Then check file system
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
    } catch { /* file not found */ }
    // Fallback: zh-CN → zh
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
      if (fromCookie) return fromCookie
    }
    if (opts.fromAcceptLanguage) {
      const fromHeader = req.headers.get('Accept-Language')?.split(',')[0]?.trim()
      if (fromHeader) return fromHeader
    }
    return opts.default
  }

  return async (req, ctx, next) => {
    const url = new URL(req.url)
    const match = url.pathname.match(/^\/__lang\/([\w-]+)$/)

    if (match && req.method === 'GET') {
      const value = match[1]
      const cookie = `${opts.cookie}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`
      const messages = await loadMessages(value)
      const accept = req.headers.get('accept') ?? ''
      if (accept.includes('application/json')) {
        return Response.json(
          { ok: true, locale: value, messages: Object.keys(messages).length > 0 ? messages : undefined },
          { headers: { 'Set-Cookie': cookie } },
        )
      }
      const referer = req.headers.get('referer') || '/'
      return new Response(null, { status: 302, headers: { Location: referer, 'Set-Cookie': cookie } })
    }

    const locale = detectLocale(req)
    const msgs = await loadMessages(locale)

    ctx.i18n = {
      locale,
      t: (key: string, params?: Record<string, string>, fallback?: string) =>
        translate(msgs, key, params, fallback),
    }

    return next(req, ctx)
  }
}
