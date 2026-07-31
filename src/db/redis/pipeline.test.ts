import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { RedisConnection } from './connection.ts'
import { RedisPipeline } from './pipeline.ts'

// CS-04: 真实 redis
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const port = Number(new URL(REDIS_URL).port || 6379)

describe('redis pipeline (real database)', () => {
  const KEY = `wf_pipe:${process.pid}:`
  let conn: RedisConnection

  before(async () => {
    conn = new RedisConnection({ port })
    await conn.connect()
  })

  after(async () => {
    const keys = await conn.command('KEYS', `${KEY}*`)
    if (Array.isArray(keys)) for (const k of keys) await conn.command('DEL', String(k))
    await conn.close()
  })

  it('executes batched commands in one round-trip', async () => {
    const pipe = new RedisPipeline(conn)
    pipe.set(`${KEY}a`, '1')
    pipe.set(`${KEY}b`, '2')
    pipe.incr(`${KEY}c`)
    pipe.incr(`${KEY}c`)
    pipe.get(`${KEY}a`)
    pipe.get(`${KEY}c`)
    const results = await pipe.exec()
    assert.deepEqual(results.map(String), ['OK', 'OK', '1', '2', '1', '2'])
  })

  it('preserves command order in results', async () => {
    const pipe = new RedisPipeline(conn)
    for (let i = 0; i < 10; i++) pipe.set(`${KEY}o${i}`, `v${i}`)
    for (let i = 0; i < 10; i++) pipe.get(`${KEY}o${i}`)
    const results = await pipe.exec()
    const gets = results.slice(10).map(String)
    assert.deepEqual(gets, Array.from({ length: 10 }, (_, i) => `v${i}`))
  })

  it('single write batch (one network round trip)', async () => {
    const pipe = new RedisPipeline(conn)
    for (let i = 0; i < 20; i++) pipe.set(`${KEY}b${i}`, String(i))
    const writes = await pipe.exec()
    assert.equal(writes.length, 20)
    assert.ok(writes.every((r) => String(r) === 'OK'))
  })

  it('mixes error replies in pipeline results', async () => {
    const pipe = new RedisPipeline(conn)
    pipe.set(`${KEY}e`, 'x')
    pipe.get(`${KEY}e`)
    pipe.raw('NOTACOMMAND', 'bad')
    pipe.get(`${KEY}e`)
    const results = await pipe.exec()
    assert.equal(String(results[0]), 'OK')
    assert.equal(String(results[1]), 'x')
    assert.ok(results[2] instanceof Error) // 错误命令
    assert.equal(String(results[3]), 'x') // 后续命令仍正常
  })
})
