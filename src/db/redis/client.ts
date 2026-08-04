/**
 * weifuwu/db/redis — Redis 客户端高层 API
 *
 * 在 RedisConnection 之上提供：
 * - TTL 安全:  set(key, val, ttl) 直接生效（无需记 'EX' 前缀顺序）
 * - JSON 存取: jsonGet/jsonSet 自动序列化（AI 缓存场景零样板）
 * - 缓存便捷:  cache(key, fn, ttl) 读缓存 → miss 执行 fn → 回填
 */

import { RedisConnection, type RedisConnectionOptions } from './connection.ts'
import type { RespValue } from './resp.ts'
import { ValidationError } from '../errors.ts'

export interface RedisClientOptions extends RedisConnectionOptions {}

export class RedisClient {
  private conn: RedisConnection

  private constructor(conn: RedisConnection) {
    this.conn = conn
  }

  /** 建立连接并返回就绪的客户端 */
  static async connect(options: RedisClientOptions = {}): Promise<RedisClient> {
    const conn = new RedisConnection(options)
    await conn.connect()
    return new RedisClient(conn)
  }

  /** 底层命令透传（RESP 值）；Buffer 参数字节原样发送 */
  command(name: string, ...args: (string | number | Buffer)[]): Promise<RespValue> {
    return this.conn.command(name, ...args)
  }

  // ── 基础命令 ──────────────────────────────

  async get(key: string): Promise<string | null> {
    const v = await this.conn.command('GET', key)
    return v === null ? null : String(v)
  }

  /**
   * 二进制安全读取：返回原始字节（Uint8Array），不经过字符串解码。
   * 用于缓存二进制 payload（序列化字节、图片等）。key 不存在返回 null。
   */
  async getBuffer(key: string): Promise<Uint8Array | null> {
    const v = await this.conn.command('GET', key, { asBuffer: true })
    if (v === null) return null
    return v instanceof Uint8Array ? v : new TextEncoder().encode(String(v))
  }

  /**
   * SET。ttl 秒可省略；传入即安全生效（内部转 SET key val EX ttl）。
   */
  async set(key: string, value: string | number, ttl?: number): Promise<'OK'> {
    const reply = ttl !== undefined
      ? await this.conn.command('SET', key, value, 'EX', ttl)
      : await this.conn.command('SET', key, value)
    return String(reply) as 'OK'
  }

  /** DEL 多 key，返回删除数量 */
  async del(...keys: string[]): Promise<number> {
    const v = await this.conn.command('DEL', ...keys)
    return Number(v)
  }

  /** INCR，返回自增后的值 */
  async incr(key: string): Promise<number> {
    return Number(await this.conn.command('INCR', key))
  }

  /** EXPIRE，返回 1=设置成功 0=key 不存在 */
  async expire(key: string, seconds: number): Promise<number> {
    return Number(await this.conn.command('EXPIRE', key, seconds))
  }

  /** TTL 剩余秒数；-1=无 TTL -2=key 不存在 */
  async ttl(key: string): Promise<number> {
    return Number(await this.conn.command('TTL', key))
  }

  // ── JSON 存取（自动序列化） ────────────────

  /** 读取并 JSON.parse；key 不存在返回 null */
  async jsonGet(key: string): Promise<unknown | null> {
    const raw = await this.conn.command('GET', key)
    if (raw === null) return null
    try {
      return JSON.parse(String(raw))
    } catch {
      throw new ValidationError(`redis: value of key '${key}' is not valid JSON`)
    }
  }

  /** JSON.stringify 后写入，可选 TTL */
  async jsonSet(key: string, value: unknown, ttl?: number): Promise<'OK'> {
    return this.set(key, JSON.stringify(value), ttl)
  }

  // ── 缓存便捷 ──────────────────────────────

  /**
   * 缓存读-算-写。命中返回缓存值；miss 执行 fn 并回填。
   * fn 返回 null 时不缓存（防穿透）。
   */
  async cache<T>(key: string, fn: () => Promise<T | null>, ttl: number): Promise<T | null> {
    const hit = await this.jsonGet(key)
    if (hit !== null) return hit as T
    const value = await fn()
    if (value !== null) await this.jsonSet(key, value, ttl)
    return value
  }

  /** 主动关闭连接 */
  async close(): Promise<void> {
    await this.conn.close()
  }
}
