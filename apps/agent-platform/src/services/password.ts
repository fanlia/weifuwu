/**
 * 密码哈希工具 — 使用 node:crypto scrypt
 *
 * 零外部依赖，生产级密码存储
 */

import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * 生成密码哈希（异步 Promise 封装）
 *
 * 格式: scrypt:<salt(32B base64)>:<hash(64B base64)>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(32).toString('base64')
  return new Promise<string>((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err)
      else resolve(`scrypt:${salt}:${key.toString('base64')}`)
    })
  })
}

/**
 * 验证密码与哈希是否匹配
 */
export async function verifyPassword(password: string, hashed: string): Promise<boolean> {
  const parts = hashed.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    // 兼容旧版明文密码（迁移期）
    return password === hashed
  }
  const [, salt, keyB64] = parts
  return new Promise<boolean>((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) reject(err)
      else {
        // timingSafeEqual 防止时序攻击
        const expected = Buffer.from(keyB64, 'base64')
        resolve(expected.length === derivedKey.length && timingSafeEqual(derivedKey, expected))
      }
    })
  })
}
