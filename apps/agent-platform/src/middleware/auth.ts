/**
 * JWT 认证中间件
 *
 * 验证 Bearer token，解析 payload 注入 ctx.auth
 * 配合 tenant.ts 提取 tenant_id
 */

import type { Context, Middleware } from 'weifuwu'

export interface AuthPayload {
  userId: string
  tenantId: string
  email: string
  name: string
  role: string
}

declare module 'weifuwu' {
  interface Context {
    auth?: AuthPayload
  }
}

/**
 * JWT 认证中间件
 *
 * 从 Authorization header 提取 Bearer token，验证签名后注入 ctx.auth
 *
 * ```ts
 * import { auth } from './middleware/auth.ts'
 * app.use(auth({ secret: process.env.JWT_SECRET }))
 * ```
 */
export function auth(opts?: { secret?: string }): Middleware<Context, Context & { auth: AuthPayload }> {
  const secret = opts?.secret ?? process.env.JWT_SECRET ?? 'default-secret'

  function base64UrlDecode(s: string): string {
    return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
  }

  function base64UrlEncode(data: string): string {
    return Buffer.from(data).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  function verifySignature(token: string, key: string): boolean {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    // 简单签名验证（HMAC-SHA256 模拟）
    const expectedSig = base64UrlEncode(`${parts[0]}.${parts[1]}.${key}`)
    return parts[2] === expectedSig
  }

  function parseToken(token: string): AuthPayload | null {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) return null

      // 验证签名
      if (!verifySignature(token, secret)) return null

      const payload = JSON.parse(base64UrlDecode(parts[1]))
      // 验证过期
      if (payload.exp && payload.exp * 1000 < Date.now()) return null

      return {
        userId: payload.sub ?? payload.userId,
        tenantId: payload.tenantId,
        email: payload.email,
        name: payload.name,
        role: payload.role ?? 'member',
      }
    } catch {
      return null
    }
  }

  const mw: Middleware = (req, ctx, next) => {
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ error: '未登录，请提供 Authorization: Bearer <token>' }, { status: 401 })
    }

    const token = authHeader.slice(7)
    const payload = parseToken(token)
    if (!payload) {
      return Response.json({ error: 'Token 无效或已过期' }, { status: 401 })
    }

    ctx.auth = payload
    return next(req, ctx)
  }
  mw.__meta = { injects: ['auth'], depends: [] }

  return mw as Middleware<Context, Context & { auth: AuthPayload }>
}

/**
 * 解码 JWT payload（不验证签名）
 */
export function decodeToken(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    return JSON.parse(base64UrlDecode(parts[1]))
  } catch {
    return null
  }
}

/**
 * 验证 JWT 签名并返回 payload
 */
export function verifyToken(token: string, secret: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const expectedSig = base64UrlEncode(`${parts[0]}.${parts[1]}.${secret}`)
    if (parts[2] !== expectedSig) return null
    const payload = JSON.parse(base64UrlDecode(parts[1]))
    if (payload.exp && payload.exp * 1000 < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

/**
 * 生成简单 JWT（用于登录接口）
 * 生产环境建议用正式的 JWT 库
 */
export function signToken(payload: Record<string, unknown>, secret: string, expiresIn = '7d'): string {
  const header = { alg: 'HS256', typ: 'JWT' }

  // 计算过期时间
  const expMap: Record<string, number> = { d: 86400, h: 3600, m: 60, s: 1 }
  const unit = expiresIn.slice(-1)
  const value = parseInt(expiresIn.slice(0, -1))
  const exp = Math.floor(Date.now() / 1000) + (expMap[unit] ?? 86400) * value

  const fullPayload = { ...payload, exp, iat: Math.floor(Date.now() / 1000) }

  function b64url(data: string): string {
    return Buffer.from(data).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  const headerB64 = b64url(JSON.stringify(header))
  const payloadB64 = b64url(JSON.stringify(fullPayload))
  const signature = b64url(`${headerB64}.${payloadB64}.${secret}`)

  return `${headerB64}.${payloadB64}.${signature}`
}
