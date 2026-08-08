/**
 * 密码哈希工具 — 使用 node:crypto scrypt
 *
 * 零外部依赖，生产级密码存储。
 *
 * 格式与 weifuwu 框架 user() 一致：`scrypt$N$r$p$salt$hash`
 * —— 因为认证已迁移到框架 `_weifuwu_users`（ctx.auth.register/setPassword 写入的
 *    就是该格式），app 侧（seed、改密校验）必须用同一格式才能互通。
 * 同时兼容旧格式 `scrypt:salt:hash`（迁移期遗留哈希，仅验证）。
 */

import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto'

const KEYLEN = 64
const PARAMS = { N: 16384, r: 8, p: 1 }

/**
 * 生成密码哈希（异步 Promise 封装）— 框架兼容格式
 *
 * 格式: scrypt$N$r$p$salt(hex)$hash(hex)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  return new Promise<string>((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEYLEN, PARAMS, (err, key) => {
      if (err) reject(err)
      else resolve(`scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('hex')}$${key.toString('hex')}`)
    })
  })
}

/**
 * 验证密码与哈希是否匹配 — 支持框架格式 + 旧版格式
 */
export async function verifyPassword(password: string, hashed: string): Promise<boolean> {
  // 框架格式: scrypt$N$r$p$salt$hash（_weifuwu_users 现行格式）
  const parts = hashed.split('$')
  if (parts.length === 6 && parts[0] === 'scrypt') {
    const [, N, r, p, saltHex, hashHex] = parts
    const expected = Buffer.from(hashHex, 'hex')
    return new Promise<boolean>((resolve, reject) => {
      scrypt(password.normalize('NFKC'), Buffer.from(saltHex, 'hex'), expected.length, {
        N: Number(N), r: Number(r), p: Number(p),
      }, (err, derivedKey) => {
        if (err) reject(err)
        else resolve(derivedKey.length === expected.length && timingSafeEqual(derivedKey, expected))
      })
    })
  }

  // 旧版格式: scrypt:salt(hex/base64):hash — 迁移期遗留，仅验证
  const legacy = hashed.split(':')
  if (legacy.length === 3 && legacy[0] === 'scrypt') {
    const [, saltB64, keyB64] = legacy
    const salt = Buffer.from(saltB64, 'base64')
    const expected = Buffer.from(keyB64, 'base64')
    return new Promise<boolean>((resolve, reject) => {
      scrypt(password.normalize('NFKC'), salt, expected.length, PARAMS, (err, derivedKey) => {
        if (err) reject(err)
        else resolve(derivedKey.length === expected.length && timingSafeEqual(derivedKey, expected))
      })
    })
  }

  // 明文兜底（极早期迁移遗留）
  return password === hashed
}
