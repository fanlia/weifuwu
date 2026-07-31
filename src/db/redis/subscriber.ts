/**
 * weifuwu/db/redis — Redis 订阅者（Pub/Sub）
 *
 * 独立连接（subscribe 后连接进入监听模式，不能发普通命令）。
 * 回调式 API：subscribe/psubscribe(channel, (channel, message) => ...)。
 */

import { RedisConnection, type RedisConnectionOptions } from './connection.ts'

export class RedisSubscriber {
  private conn: RedisConnection

  constructor(options: RedisConnectionOptions = {}) {
    this.conn = new RedisConnection(options)
  }

  async connect(): Promise<void> {
    await this.conn.connect()
  }

  /** 订阅频道：回调式 */
  subscribe(channel: string, fn: (channel: string, message: string) => void): Promise<void> {
    return this.conn.subscribe(channel, fn)
  }

  /** 订阅模式（通配符）：回调式 */
  psubscribe(pattern: string, fn: (channel: string, message: string) => void): Promise<void> {
    return this.conn.psubscribe(pattern, fn)
  }

  async close(): Promise<void> {
    await this.conn.close()
  }
}
