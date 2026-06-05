import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Context, Middleware } from './types.ts'

export interface PrefOptions {
  dir?: string
  locale?: {
    default?: string
    cookie?: string
    fromAcceptLanguage?: boolean
  }
  theme?: {
    default?: string
    cookie?: string
  }
}

const defaults = {
  locale: { default: 'en', cookie: 'locale', fromAcceptLanguage: true },
  theme: { default: 'system', cookie: 'theme' },
}

function translate(msgs: Record<string, unknown>, key: string, params?: Record<string, string>, fallback?: string): string {
  const msg = key.split('.').reduce((o: any, k: string) => o?.[k], msgs)
  if (msg === undefined || msg === null) return fallback ?? key
  if (!params) return String(msg)
  let result = String(msg)
  for (const [k, v] of Object.entries(params)) {
    result = result.replace(`{${k}}`, v)
  }
  return result
}

function extractCookie(req: Request, name: string): string | null {
  const cookie = req.headers.get('cookie')
  if (!cookie) return null
  for (const part of cookie.split(';')) {
    const [k, v] = part.trim().split('=')
    if (k === name && v) return decodeURIComponent(v)
  }
  return null
}

function prefCookie(name: string, value: string): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`
}

async function handlePrefSwitch(
  req: Request,
  value: string,
  cookieName: string,
  load: (locale: string) => Promise<Record<string, unknown>>,
): Promise<Response> {
  const isJson = req.headers.get('accept')?.includes('application/json')

  if (isJson) {
    const result: Record<string, any> = { ok: true }
    if (cookieName === 'locale' || cookieName === 'lang') {
      result.locale = value
      const messages = await load(value)
      if (Object.keys(messages).length > 0) result.messages = messages
    } else {
      result.theme = value
    }
    return Response.json(result, {
      headers: { 'Set-Cookie': prefCookie(cookieName, value) },
    })
  }

  const referer = req.headers.get('referer') || '/'
  return new Response(null, {
    status: 302,
    headers: { Location: referer, 'Set-Cookie': prefCookie(cookieName, value) },
  })
}

export function preferences(options: PrefOptions): Middleware {
  const dir = options.dir ? resolve(options.dir) : undefined
  const localeOpts = { ...defaults.locale, ...options.locale }
  const themeOpts = { ...defaults.theme, ...options.theme }
  const cache = new Map<string, Record<string, unknown>>()

  function validLocale(locale: string): boolean {
    return /^[\w-]+$/.test(locale) && !locale.includes('..')
  }

  async function load(locale: string): Promise<Record<string, unknown>> {
    if (!dir) return {}
    if (!validLocale(locale)) return {}
    const cached = cache.get(locale)
    if (cached) return cached
    const filePath = join(dir, `${locale}.json`)
    if (!existsSync(filePath)) return {}
    try {
      const content = await readFile(filePath, 'utf-8')
      const data = JSON.parse(content) as Record<string, unknown>
      cache.set(locale, data)
      return data
    } catch {
      return {}
    }
  }

  return async (req, ctx, next) => {
    const url = new URL(req.url)

    const langMatch = url.pathname.match(/^\/__lang\/(\w+)$/)
    if (langMatch && req.method === 'GET') {
      return handlePrefSwitch(req, langMatch[1], localeOpts.cookie, load)
    }

    const themeMatch = url.pathname.match(/^\/__theme\/(\w+)$/)
    if (themeMatch && req.method === 'GET') {
      return handlePrefSwitch(req, themeMatch[1], themeOpts.cookie, load)
    }

    const locale = detectLocale(req, localeOpts)
    const theme = detectTheme(req, themeOpts)

    ctx.prefs = { locale, theme }

    if (dir) {
      const msgs = await load(locale)
      ctx.t = (key: string, params?: Record<string, string>, fallback?: string) => translate(msgs, key, params, fallback)
      ;(globalThis as any).__LOCALE_DATA__ = msgs
      ctx.parsed = { ...ctx.parsed, __localeData: msgs }
    }

    ctx.setPref = (name: string, value: string) => {
      const cookieOpts: string[] = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax']
      const referer = req.headers.get('referer') || '/'
      return new Response(null, {
        status: 302,
        headers: {
          Location: referer,
          'Set-Cookie': cookieOpts.join('; '),
        },
      })
    }

    const flashVal = extractCookie(req, 'flash')
    if (flashVal) {
      try { ctx.prefs.flash = JSON.parse(flashVal) } catch { ctx.prefs.flash = flashVal }
    }

    const res = await next(req, ctx)

    if (flashVal) {
      const headers = new Headers(res.headers)
      headers.append('Set-Cookie', 'flash=; Path=/; Max-Age=0')
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
    }

    return res
  }
}

function detectLocale(req: Request, opts: Required<NonNullable<PrefOptions['locale']>>): string {
  if (opts.cookie) {
    const fromCookie = extractCookie(req, opts.cookie)
    if (fromCookie) return fromCookie
  }
  if (opts.fromAcceptLanguage) {
    const fromHeader = req.headers.get('Accept-Language')?.split(',')[0]?.split('-')[0]
    if (fromHeader) return fromHeader
  }
  return opts.default
}

function detectTheme(req: Request, opts: Required<NonNullable<PrefOptions['theme']>>): string {
  if (opts.cookie) {
    const fromCookie = extractCookie(req, opts.cookie)
    if (fromCookie) return fromCookie
  }
  return opts.default
}
