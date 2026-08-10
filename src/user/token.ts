/**
 * 会话令牌（零依赖，node:crypto）
 *
 * access token：HMAC-SHA256 签名的 JWT 形态（base64url），
 *   与 weifuwu/ui-dom 的 auth() 兼容（客户端解码 payload 检查 exp）。
 * refresh token：不透明随机串（256-bit），DB 只存 SHA-256 哈希（可撤销）。
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url')

/** 签发 JWT access token（HS256） */
export function signToken(
  payload: Record<string, unknown>,
  secret: string,
  ttlSeconds: number,
): string {
  const now = Math.floor(Date.now() / 1000)
  const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ ...payload, iat: now, exp: now + ttlSeconds })}`
  const sig = createHmac('sha256', secret).update(data).digest('base64url')
  return `${data}.${sig}`
}

/** 验证 JWT（签名 + 过期）。失败返回 null（不是抛错——未登录是正常状态） */
export function verifyToken(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [h, p, s] = parts
  const data = `${h}.${p}`
  const expected = createHmac('sha256', secret).update(data).digest('base64url')
  const sigBuf = Buffer.from(s)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null
  try {
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as Record<string, unknown>
    if (typeof payload.exp === 'number' && payload.exp < Date.now() / 1000) return null
    return payload
  } catch {
    return null
  }
}

/** 不透明 refresh token（256-bit 随机） */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('hex')
}

/** DB 只存哈希（泄露库也不泄露 refresh token） */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
