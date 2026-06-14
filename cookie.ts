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
    let name = pair.slice(0, idx).trim()
    let value = pair.slice(idx + 1).trim()
    if (!name) continue
    // Decode cookie name (consistent with value)
    try {
      name = decodeURIComponent(name)
    } catch {}
    // Strip surrounding quotes from value (RFC 6265)
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    }
    try {
      cookies[name] = decodeURIComponent(value)
    } catch {
      cookies[name] = value
    }
  }
  return cookies
}

function serializeCookie(name: string, value: string, options?: CookieOptions): string {
  // Reject control characters and special chars per RFC 6265
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F-\x9F;,]/.test(name) || /[\x00-\x1F\x7F-\x9F;,]/.test(value)) {
    throw new Error(`Invalid cookie name or value: contains control characters or special chars`)
  }
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

export function setCookie(
  res: Response,
  name: string,
  value: string,
  options?: CookieOptions,
): Response {
  const headers = new Headers(res.headers)
  headers.append('Set-Cookie', serializeCookie(name, value, options))
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
}

export function deleteCookie(
  res: Response,
  name: string,
  options?: Omit<CookieOptions, 'maxAge'>,
): Response {
  const headers = new Headers(res.headers)
  headers.append(
    'Set-Cookie',
    serializeCookie(name, '', {
      ...options,
      maxAge: 0,
      expires: new Date(0),
    }),
  )
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
}
