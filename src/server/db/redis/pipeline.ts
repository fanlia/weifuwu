/**
 * weifuwu/db/redis — Redis 管道
 *
 * 批量命令一次网络往返发送（单次 write + 响应 pushAll 批量解析）。
 * 结果按命令顺序返回；错误命令对应位置返回 Error。
 */

import type { RedisConnection } from './connection.ts'
import type { RespValue } from './resp.ts'
import { encodeCommand } from './resp.ts'

type Cmd = { name: string; args: (string | number)[] }

export class RedisPipeline {
  private cmds: Cmd[] = []
  private conn: RedisConnection

  constructor(conn: RedisConnection) {
    this.conn = conn
  }

  set(key: string, value: string | number, ttl?: number): this {
    this.cmds.push(ttl !== undefined ? { name: 'SET', args: [key, value, 'EX', ttl] } : { name: 'SET', args: [key, value] })
    return this
  }

  get(key: string): this {
    this.cmds.push({ name: 'GET', args: [key] })
    return this
  }

  del(...keys: string[]): this {
    this.cmds.push({ name: 'DEL', args: keys })
    return this
  }

  incr(key: string): this {
    this.cmds.push({ name: 'INCR', args: [key] })
    return this
  }

  expire(key: string, seconds: number): this {
    this.cmds.push({ name: 'EXPIRE', args: [key, seconds] })
    return this
  }

  ttl(key: string): this {
    this.cmds.push({ name: 'TTL', args: [key] })
    return this
  }

  /** 任意命令透传 */
  raw(name: string, ...args: (string | number)[]): this {
    this.cmds.push({ name, args })
    return this
  }

  /**
   * 一次往返执行所有命令。结果按命令顺序；错误命令对应位置为 Error 实例，
   * 其余命令不受影响（Redis 管道语义）。
   */
  async exec(): Promise<RespValue[]> {
    const cmds = this.cmds
    this.cmds = []
    if (cmds.length === 0) return []

    // 单次 write：所有命令字节拼接成一次发送
    const payload = Buffer.concat(cmds.map((c) => Buffer.from(encodeCommand([c.name, ...c.args]))))
    return this.conn.batch(payload, cmds.length)
  }
}
