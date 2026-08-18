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
import { RedisPipeline } from './pipeline.ts'
import { ValidationError } from '../errors.ts'
import type { RedisPoolConnection } from '../contracts.ts'

export interface RedisClientOptions extends RedisConnectionOptions {}

export class RedisClient implements RedisPoolConnection {
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

  /** 连接是否就绪（池坏连接剔除用） */
  get connected(): boolean {
    return this.conn.connected
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

  // ── 批量 / 存在 / 计数 ────────────────────────

  /** 批量读：返回与 key 一一对应的值（缺失为 null） */
  async mget(...keys: string[]): Promise<(string | null)[]> {
    const v = await this.conn.command('MGET', ...keys)
    return (v as RespValue[]).map((x) => (x === null ? null : String(x)))
  }

  /** 批量写：mset(k1, v1, k2, v2, ...)（偶数参数） */
  async mset(...kv: (string | number)[]): Promise<'OK'> {
    const reply = await this.conn.command('MSET', ...kv)
    return String(reply) as 'OK'
  }

  /** 存在性：返回存在的 key 数 */
  async exists(...keys: string[]): Promise<number> {
    return Number(await this.conn.command('EXISTS', ...keys))
  }

  /** 原子设置（仅 key 不存在时）：1=设置成功 0=已存在（分布式锁基础） */
  async setnx(key: string, value: string | number): Promise<number> {
    return Number(await this.conn.command('SETNX', key, value))
  }

  /** 原子加增量，返回新值 */
  async incrby(key: string, delta: number): Promise<number> {
    return Number(await this.conn.command('INCRBY', key, delta))
  }

  // ── hash ─────────────────────────────────────

  /** 设置字段，返回新增字段数 */
  async hset(key: string, field: string, value: string | number): Promise<number> {
    return Number(await this.conn.command('HSET', key, field, value))
  }

  /** 读字段（缺失 null） */
  async hget(key: string, field: string): Promise<string | null> {
    const v = await this.conn.command('HGET', key, field)
    return v === null ? null : String(v)
  }

  /** 读整个 hash → Record（key 不存在 → {}） */
  async hgetall(key: string): Promise<Record<string, string>> {
    const v = await this.conn.command('HGETALL', key)
    const arr = v as RespValue[]
    const out: Record<string, string> = {}
    for (let i = 0; i + 1 < arr.length; i += 2) out[String(arr[i])] = String(arr[i + 1])
    return out
  }

  /** 删除字段，返回删除数 */
  async hdel(key: string, ...fields: string[]): Promise<number> {
    return Number(await this.conn.command('HDEL', key, ...fields))
  }

  // ── list ─────────────────────────────────────

  /** 头插，返回长度 */
  async lpush(key: string, ...values: (string | number)[]): Promise<number> {
    return Number(await this.conn.command('LPUSH', key, ...values))
  }

  /** 尾插，返回长度 */
  async rpush(key: string, ...values: (string | number)[]): Promise<number> {
    return Number(await this.conn.command('RPUSH', key, ...values))
  }

  /** 头弹（缺失 null） */
  async lpop(key: string): Promise<string | null> {
    const v = await this.conn.command('LPOP', key)
    return v === null ? null : String(v)
  }

  /** 尾弹（缺失 null） */
  async rpop(key: string): Promise<string | null> {
    const v = await this.conn.command('RPOP', key)
    return v === null ? null : String(v)
  }

  /** 范围读（start/stop 支持负数，如 0 -1 全量） */
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const v = await this.conn.command('LRANGE', key, start, stop)
    return (v as RespValue[]).map(String)
  }

  // ── set ──────────────────────────────────────

  /** 加成员，返回新增数（重复不加） */
  async sadd(key: string, ...members: (string | number)[]): Promise<number> {
    return Number(await this.conn.command('SADD', key, ...members))
  }

  /** 删成员，返回删除数 */
  async srem(key: string, ...members: (string | number)[]): Promise<number> {
    return Number(await this.conn.command('SREM', key, ...members))
  }

  /** 全部成员（无序） */
  async smembers(key: string): Promise<string[]> {
    const v = await this.conn.command('SMEMBERS', key)
    return (v as RespValue[]).map(String)
  }

  // ── zset ─────────────────────────────────────

  /** 加成员（score 排序），返回新增数 */
  async zadd(key: string, score: number, member: string | number): Promise<number> {
    return Number(await this.conn.command('ZADD', key, score, member))
  }

  /** 范围读（按 score 升序；start/stop 为排名，支持负数） */
  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    const v = await this.conn.command('ZRANGE', key, start, stop)
    return (v as RespValue[]).map(String)
  }

  // ── pipeline ─────────────────────────────────

  /** 创建管道（批量命令一次往返；结果按序） */
  pipeline(): RedisPipeline {
    return new RedisPipeline(this.conn)
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
