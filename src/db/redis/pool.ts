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
  private replenishWaiters: (() => void)[] = []
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
  private readyPromise: Promise<void> | null = null

  private ensure(): Promise<void> {
    // 已就绪：返回缓存的 resolved promise（零分配）
    if (this.readyPromise) return this.readyPromise
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
    this.readyPromise = Promise.resolve()
  }

  /** 应用 key 前缀（command 透传不加） */
  private k(key: string): string {
    return this.keyPrefix + key
  }

  /** round-robin 选择健康连接；跳过不可用连接（断线/重连中/closed）——剔除并异步重建，防分发到死连接。
   * 全部不可用时等待 replenish 补位（Redis 真宕机 1s 后明确报错，不无限挂起）。 */
  private async acquireHealthy(): Promise<RedisClient> {
    if (this.closed) throw new ConnectionError('redis: pool is closed')
    while (this.clients.length > 0) {
      const idx = this.rr % this.clients.length
      this.rr++
      const c = this.clients[idx]
      if (c.connected) return c
      // 死连接：剔除 + 异步重建（不等待慢重连）
      this.clients.splice(idx, 1)
      c.close().catch(() => {})
      this.replenish()
    }
    return new Promise((resolve, reject) => {
      const waiter = () => {
        if (this.clients.length > 0 && this.clients[0].connected) resolve(this.clients[0])
        else reject(new ConnectionError('redis: pool exhausted after reconnect wait'))
      }
      this.replenishWaiters.push(waiter)
      setTimeout(() => {
        const i = this.replenishWaiters.indexOf(waiter)
        if (i >= 0) this.replenishWaiters.splice(i, 1)
        reject(new ConnectionError('redis: no healthy connection available'))
      }, 1000)
    })
  }

  /** 剔除后补位：异步重建连接，就绪后回池并唤醒等待者 */
  private replenish(): void {
    if (this.closed) return
    RedisClient.connect(this.opts)
      .then((c) => {
        if (this.closed) {
          c.close()
          return
        }
        this.clients.push(c)
        const ws = this.replenishWaiters
        this.replenishWaiters = []
        for (const w of ws) w()
      })
      .catch(() => {
        // 重建失败（Redis 短暂不可达）：延迟重试，防池永久空
        setTimeout(() => this.replenish(), 500)
      })
  }

  // ── 与 RedisClient 相同的方法面（代理到轮询连接） ──

  async command(name: string, ...args: (string | number)[]): Promise<RespValue> {
    await this.ensure()
    const c = await this.acquireHealthy()
    return c.command(name, ...args)
  }

  async get(key: string): Promise<string | null> {
    await this.ensure()
    const c = await this.acquireHealthy()
    return c.get(this.k(key))
  }

  /** 二进制安全读取（原始字节，不解码） */
  async getBuffer(key: string): Promise<Uint8Array | null> {
    await this.ensure()
    const c = await this.acquireHealthy()
    return c.getBuffer(this.k(key))
  }

  async set(key: string, value: string | number, ttl?: number): Promise<'OK'> {
    await this.ensure()
    const c = await this.acquireHealthy()
    return c.set(this.k(key), value, ttl)
  }

  async del(...keys: string[]): Promise<number> {
    await this.ensure()
    const c = await this.acquireHealthy()
    return c.del(...keys.map((k) => this.k(k)))
  }

  async incr(key: string): Promise<number> {
    await this.ensure()
    const c = await this.acquireHealthy()
    return c.incr(this.k(key))
  }

  async expire(key: string, seconds: number): Promise<number> {
    await this.ensure()
    const c = await this.acquireHealthy()
    return c.expire(this.k(key), seconds)
  }

  async ttl(key: string): Promise<number> {
    await this.ensure()
    const c = await this.acquireHealthy()
    return c.ttl(this.k(key))
  }

  async jsonGet(key: string): Promise<unknown | null> {
    await this.ensure()
    const c = await this.acquireHealthy()
    return c.jsonGet(this.k(key))
  }

  async jsonSet(key: string, value: unknown, ttl?: number): Promise<'OK'> {
    await this.ensure()
    const c = await this.acquireHealthy()
    return c.jsonSet(this.k(key), value, ttl)
  }

  async cache<T>(key: string, fn: () => Promise<T | null>, ttl: number): Promise<T | null> {
    await this.ensure()
    const c = await this.acquireHealthy()
    return c.cache(this.k(key), fn, ttl)
  }

  /** PUBLISH 消息到频道，返回收到消息的订阅者数 */
  async publish(channel: string, message: string | number): Promise<number> {
    await this.ensure()
    const c = await this.acquireHealthy()
    return Number(await c.command('PUBLISH', channel, message))
  }

  /** 创建独立订阅者连接（Pub/Sub 场景） */
  createSubscriber(): RedisSubscriber {
    return new RedisSubscriber({ ...this.opts })
  }

  /** 清空当前库（测试/重置场景） */
  async flushdb(): Promise<'OK'> {
    await this.ensure()
    const c = await this.acquireHealthy()
    const v = await c.command('FLUSHDB')
    return String(v) as 'OK'
  }

  /** 关闭所有池内连接 */
  async close(): Promise<void> {
    this.closed = true
    this.readyPromise = null
    await Promise.all(this.clients.map((c) => c.close()))
    this.clients = []
  }

  get size(): number {
    return this.clients.length
  }
}
