import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Context, Middleware } from './types.ts'

export interface I18nOptions {
  dir: string
  defaultLocale?: string
}

export function i18n(options: I18nOptions): Middleware {
  const dir = resolve(options.dir)
  const defaultLocale = options.defaultLocale ?? 'en'
  const cache = new Map<string, Record<string, string>>()

  async function load(locale: string): Promise<Record<string, string>> {
    const cached = cache.get(locale)
    if (cached) return cached
    const filePath = join(dir, `${locale}.json`)
    if (!existsSync(filePath)) return {}
    try {
      const content = await readFile(filePath, 'utf-8')
      const data = JSON.parse(content) as Record<string, string>
      cache.set(locale, data)
      return data
    } catch {
      return {}
    }
  }

  function detect(req: Request): string {
    const url = new URL(req.url)
    const fromCookie = extractCookie(req, 'locale')
    if (fromCookie) return fromCookie
    const fromHeader = req.headers.get('Accept-Language')?.split(',')[0]?.split('-')[0]
    if (fromHeader) return fromHeader
    return defaultLocale
  }

  function t(localeMsgs: Record<string, string>, key: string, params?: Record<string, string>): string {
    let msg = localeMsgs[key]
    if (msg === undefined) msg = key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        msg = msg.replace(`{${k}}`, v)
      }
    }
    return msg
  }

  return async (req, ctx, next) => {
    const locale = detect(req)
    const msgs = await load(locale)
    ctx.locale = locale
    ctx.t = (key: string, params?: Record<string, string>) => t(msgs, key, params)
    return next(req, ctx)
  }
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
