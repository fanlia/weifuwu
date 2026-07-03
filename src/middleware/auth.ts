import type { Middleware, User } from '../types.ts'
import { createHmac, timingSafeEqual } from 'node:crypto'

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface AuthOptions {
  /**
   * JWT authentication.
   *
   * @example
   * auth({ jwt: { secret: process.env.JWT_SECRET } })
   */
  jwt?: {
    /** HMAC secret for HS256. */
    secret: string
    /** Cookie name for the token (default: 'token'). */
    cookie?: string
  }
  /**
   * Simple session authentication via signed cookie.
   *
   * @example
   * auth({ session: { secret: '...' } })
   */
  session?: {
    /** Secret for HMAC cookie signing. */
    secret: string
    /** Cookie name (default: 'session'). */
    cookie?: string
    /** Load user from session data. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loadUser: (data: Record<string, unknown>) => Promise<User | null> | User | null
  }
  /**
   * API key authentication via header.
   *
   * @example
   * auth({ apiKey: { header: 'x-api-key', keys: ['sk-xxx'] } })
   */
  apiKey?: {
    /** Header name (default: 'authorization'). */
    header?: string
    /** Prefix to strip (default: 'Bearer '). */
    prefix?: string
    /** Validate an API key → User or null. */
    validate: (key: string) => Promise<User | null> | User | null
  }
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function base64urlDecode(str: string): string {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

function base64url(str: string): string {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  for (const c of cookieHeader.split(';')) {
    const [key, ...rest] = c.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return null
}

// ═══════════════════════════════════════════════════════════════
// Middleware
// ═══════════════════════════════════════════════════════════════

/**
 * Authentication middleware — injects `ctx.user`.
 *
 * Supports JWT (HS256), signed session cookies, and API keys.
 * When no user is authenticated, requests still proceed —
 * check `ctx.user` in your handlers to enforce auth.
 *
 * @example
 * ```ts
 * // JWT
 * app.use(auth({ jwt: { secret: 'my-secret' } }))
 *
 * // Session cookie
 * app.use(auth({
 *   session: {
 *     secret: '...',
 *     loadUser: async (data) => db.findUser(data.userId),
 *   },
 * }))
 *
 * // API key
 * app.use(auth({ apiKey: { validate: async (key) => db.findByApiKey(key) } }))
 * ```
 */
export function auth(opts: AuthOptions): Middleware {
  return async (req, ctx, next) => {
    // 1. JWT
    if (opts.jwt) {
      const cookie = opts.jwt.cookie ?? 'token'
      const token = parseCookie(req.headers.get('cookie'), cookie)
        ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')

      if (token) {
        try {
          const [headerB64, payloadB64, sigB64] = token.split('.')
          const expectedSig = sign(`${headerB64}.${payloadB64}`, opts.jwt.secret)
          const sigBuf = Buffer.from(sigB64, 'base64url')
          const expectedBuf = Buffer.from(expectedSig, 'base64url')

          if (sigBuf.length === expectedBuf.length &&
              timingSafeEqual(sigBuf, expectedBuf)) {
            const payload = JSON.parse(base64urlDecode(payloadB64))
            ctx.user = {
              id: payload.sub ?? payload.id ?? 'unknown',
              role: payload.role,
              tenant: payload.tenant,
              ...payload,
            }
          }
        } catch {
          // Invalid token — continue without user
        }
      }
    }

    // 2. Session cookie
    if (opts.session && !ctx.user) {
      const cookie = opts.session.cookie ?? 'session'
      const raw = parseCookie(req.headers.get('cookie'), cookie)

      if (raw) {
        try {
          const [dataB64, sigB64] = raw.split('.')
          const expectedSig = sign(dataB64, opts.session.secret)

          const sigBuf = Buffer.from(sigB64, 'base64url')
          const expectedBuf = Buffer.from(expectedSig, 'base64url')

          if (sigBuf.length === expectedBuf.length &&
              timingSafeEqual(sigBuf, expectedBuf)) {
            const data = JSON.parse(base64urlDecode(dataB64))
            const user = await opts.session.loadUser(data)
            if (user) ctx.user = user
          }
        } catch {
          // Invalid session — continue without user
        }
      }
    }

    // 3. API key
    if (opts.apiKey && !ctx.user) {
      const header = opts.apiKey.header ?? 'authorization'
      const prefix = opts.apiKey.prefix ?? 'Bearer '
      const raw = req.headers.get(header)

      if (raw?.startsWith(prefix)) {
        const key = raw.slice(prefix.length)
        const user = await opts.apiKey.validate(key)
        if (user) ctx.user = user
      }
    }

    return next(req, ctx)
  }
}
