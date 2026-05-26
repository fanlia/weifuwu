export interface CookieOptions {
  domain?: string
  path?: string
  maxAge?: number
  expires?: Date
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'strict' | 'lax' | 'none'
}

export function getCookies(req: Request): Record<string, string> {
  const header = req.headers.get('cookie')
  if (!header) return {}

  const cookies: Record<string, string> = {}
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=')
    if (idx === -1) continue
    const name = pair.slice(0, idx).trim()
    const value = pair.slice(idx + 1).trim()
    if (name) {
      cookies[name] = decodeURIComponent(value)
    }
  }
  return cookies
}

function serializeCookie(name: string, value: string, options?: CookieOptions): string {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`]
  if (options?.maxAge != null) parts.push(`Max-Age=${options.maxAge}`)
  if (options?.expires) parts.push(`Expires=${options.expires.toUTCString()}`)
  if (options?.domain) parts.push(`Domain=${options.domain}`)
  if (options?.path) parts.push(`Path=${options.path}`)
  if (options?.httpOnly) parts.push('HttpOnly')
  if (options?.secure) parts.push('Secure')
  if (options?.sameSite) parts.push(`SameSite=${options.sameSite}`)
  return parts.join('; ')
}

export function setCookie(res: Response, name: string, value: string, options?: CookieOptions): Response {
  const headers = new Headers(res.headers)
  headers.append('Set-Cookie', serializeCookie(name, value, options))
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
}

export function deleteCookie(res: Response, name: string, options?: Omit<CookieOptions, 'maxAge'>): Response {
  const headers = new Headers(res.headers)
  headers.append('Set-Cookie', serializeCookie(name, '', { ...options, maxAge: 0 }))
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
}
