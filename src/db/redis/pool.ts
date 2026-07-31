/**
 * weifuwu/db/redis — Redis 连接池
 *
 * 固定大小连接池 + round-robin 分发（无状态、无跨连接串扰）。
 * 暴露与 RedisClient 相同的方法签名，上层可无缝替换。
 */

import { RedisClient, type RedisClientOptions } from './client.ts'
import { RedisSubscriber } from './subscriber.ts'
import type { RespValue } from './resp.ts'
import { ConnectionError } from '../errors.ts'

export interface RedisPoolOptions extends RedisClientOptions {
  /** 池大小（连接数）。默认 5。 */
  poolSize?: number
  /** 所有 key 自动加前缀（多应用共享 Redis 时隔离命名空间） */
  keyPrefix?: string
}

export class RedisPool {
  private clients: RedisClient[] = []
  private rr = 0
  private closed = false
  private keyPrefix: string
  private opts: RedisPoolOptions
  private initPromise: Promise<void> | null = null

  /** 懒连接模式：构造不连接，首命令时初始化（中间件注入场景） */
  constructor(opts: RedisPoolOptions = {}) {
    this.keyPrefix = opts.keyPrefix ?? ''
    this.opts = opts
  }

  /** 建立池：创建 poolSize 个连接（eager） */
  static async create(options: RedisPoolOptions = {}): Promise<RedisPool> {
    const pool = new RedisPool(options)
    await pool.ensure()
    return pool
  }

  /** 懒连接：首次使用时初始化连接（中间件场景：构造即注入，首命令才连） */
  private ensure(): Promise<void> {
    if (this.clients.length > 0) return Promise.resolve()
    if (!this.initPromise) {
      this.initPromise = this.init()
    }
    return this.initPromise
  }

  private async init(): Promise<void> {
    const poolSize = this.opts.poolSize ?? 5
    this.clients = await Promise.all(
      Array.from({ length: poolSize }, () => RedisClient.connect(this.opts)),
    )
  }

  /** 应用 key 前缀（command 透传不加） */
  private k(key: string): string {
    return this.keyPrefix + key
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
    await this.ensure()
    return this.next().command(name, ...args)
  }

  async get(key: string): Promise<string | null> {
    await this.ensure()
    return this.next().get(this.k(key))
  }

  async set(key: string, value: string | number, ttl?: number): Promise<'OK'> {
    await this.ensure()
    return this.next().set(this.k(key), value, ttl)
  }

  async del(...keys: string[]): Promise<number> {
    await this.ensure()
    return this.next().del(...keys.map((k) => this.k(k)))
  }

  async incr(key: string): Promise<number> {
    await this.ensure()
    return this.next().incr(this.k(key))
  }

  async expire(key: string, seconds: number): Promise<number> {
    await this.ensure()
    return this.next().expire(this.k(key), seconds)
  }

  async ttl(key: string): Promise<number> {
    await this.ensure()
    return this.next().ttl(this.k(key))
  }

  async jsonGet(key: string): Promise<unknown | null> {
    await this.ensure()
    return this.next().jsonGet(this.k(key))
  }

  async jsonSet(key: string, value: unknown, ttl?: number): Promise<'OK'> {
    await this.ensure()
    return this.next().jsonSet(this.k(key), value, ttl)
  }

  async cache<T>(key: string, fn: () => Promise<T | null>, ttl: number): Promise<T | null> {
    await this.ensure()
    return this.next().cache(this.k(key), fn, ttl)
  }

  /** PUBLISH 消息到频道，返回收到消息的订阅者数 */
  async publish(channel: string, message: string | number): Promise<number> {
    await this.ensure()
    return Number(await this.next().command('PUBLISH', channel, message))
  }

  /** 创建独立订阅者连接（Pub/Sub 场景） */
  createSubscriber(): RedisSubscriber {
    return new RedisSubscriber({ ...this.opts })
  }

  /** 清空当前库（测试/重置场景） */
  async flushdb(): Promise<'OK'> {
    await this.ensure()
    const v = await this.next().command('FLUSHDB')
    return String(v) as 'OK'
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
