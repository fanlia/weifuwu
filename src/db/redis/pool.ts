/**
 * weifuwu/db/redis — Redis 连接池
 *
 * 固定大小连接池 + round-robin 分发（无状态、无跨连接串扰）。
 * 暴露与 RedisClient 相同的方法签名，上层可无缝替换。
 */

import { RedisClient, type RedisClientOptions } from './client.ts'
import type { RespValue } from './resp.ts'
import { ConnectionError } from '../errors.ts'

export interface RedisPoolOptions extends RedisClientOptions {
  /** 池大小（连接数）。默认 5。 */
  poolSize?: number
}

export class RedisPool {
  private clients: RedisClient[] = []
  private rr = 0
  private closed = false

  private constructor() {}

  /** 建立池：创建 poolSize 个连接 */
  static async create(options: RedisPoolOptions = {}): Promise<RedisPool> {
    const poolSize = options.poolSize ?? 5
    const pool = new RedisPool()
    pool.clients = await Promise.all(
      Array.from({ length: poolSize }, () => RedisClient.connect(options)),
    )
    return pool
  }

  /** round-robin 选择连接 */
  private next(): RedisClient {
    if (this.closed || this.clients.length === 0) {
      throw new ConnectionError('redis: pool is closed')
    }
    const client = this.clients[this.rr % this.clients.length]
    this.rr++
    return client
  }

  // ── 与 RedisClient 相同的方法面（代理到轮询连接） ──

  async command(name: string, ...args: (string | number)[]): Promise<RespValue> {
    return this.next().command(name, ...args)
  }

  async get(key: string): Promise<string | null> {
    return this.next().get(key)
  }

  async set(key: string, value: string | number, ttl?: number): Promise<'OK'> {
    return this.next().set(key, value, ttl)
  }

  async del(...keys: string[]): Promise<number> {
    return this.next().del(...keys)
  }

  async incr(key: string): Promise<number> {
    return this.next().incr(key)
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.next().expire(key, seconds)
  }

  async ttl(key: string): Promise<number> {
    return this.next().ttl(key)
  }

  async jsonGet(key: string): Promise<unknown | null> {
    return this.next().jsonGet(key)
  }

  async jsonSet(key: string, value: unknown, ttl?: number): Promise<'OK'> {
    return this.next().jsonSet(key, value, ttl)
  }

  async cache<T>(key: string, fn: () => Promise<T | null>, ttl: number): Promise<T | null> {
    return this.next().cache(key, fn, ttl)
  }

  /** 关闭所有池内连接 */
  async close(): Promise<void> {
    this.closed = true
    await Promise.all(this.clients.map((c) => c.close()))
    this.clients = []
  }

  get size(): number {
    return this.clients.length
  }
}
