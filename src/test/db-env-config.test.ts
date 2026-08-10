/**
 * 数据库客户端配置测试——环境变量缺失必须显式报错（禁止静默降级到默认地址）
 *
 * 事故背景：redis() 在 REDIS_URL 未设置时静默回退 redis://localhost:6379——
 * 应用在本地起效、部署环境连错库/连不上时只有运行时模糊错误。
 * 与 postgres() 对齐：DATABASE_URL 缺失已抛错。
 *
 * 测试修改 process.env 采用同步 try/finally 恢复（assert.throws 同步执行，
 * 窗口极短；文件内串行）。
 */
import { test, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { redis } from '../redis/client.ts'
import { postgres } from '../postgres/client.ts'

const savedRedis = process.env.REDIS_URL
const savedPg = process.env.DATABASE_URL

function withoutEnv(key: string, fn: () => void) {
  const saved = process.env[key]
  delete process.env[key]
  try {
    fn()
  } finally {
    if (saved === undefined) delete process.env[key]
    else process.env[key] = saved
  }
}

test('redis() 无 REDIS_URL 且未传 url → 抛错（不静默回退 localhost）', () => {
  withoutEnv('REDIS_URL', () => {
    assert.throws(
      () => redis(),
      /REDIS_URL is not set/,
      '缺 REDIS_URL 必须抛错，禁止默认 redis://localhost:6379',
    )
  })
})

test('redis() 显式传 url → 不依赖环境变量', () => {
  withoutEnv('REDIS_URL', () => {
    // 懒连接池：创建不实际连接——只验证工厂接受显式 URL
    const r = redis('redis://127.0.0.1:6379')
    assert.ok(r)
  })
})

test('redis() 有 REDIS_URL → 正常创建', () => {
  if (!savedRedis) {
    // 环境无 REDIS_URL——显式传参验证
    const r = redis('redis://127.0.0.1:6379')
    assert.ok(r)
    return
  }
  const r = redis()
  assert.ok(r)
})

test('postgres() 无 DATABASE_URL 且未传 connection → 抛错', () => {
  withoutEnv('DATABASE_URL', () => {
    assert.throws(
      () => postgres(),
      /DATABASE_URL is not set/,
      '缺 DATABASE_URL 必须抛错',
    )
  })
})

test('postgres() 显式传 connection → 不依赖环境变量', () => {
  withoutEnv('DATABASE_URL', () => {
    const p = postgres('postgres://u:p@127.0.0.1:5432/db')
    assert.ok(p)
  })
})

// 防止 mock 污染其他并发测试文件（同步恢复兜底）
after(() => {
  if (savedRedis === undefined) delete process.env.REDIS_URL
  else process.env.REDIS_URL = savedRedis
  if (savedPg === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = savedPg
})
