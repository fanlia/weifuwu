/**
 * weifuwu/db/redis — Redis 连接（TCP + RESP2）
 *
 * 连接状态机: idle → connecting → ready → closed
 *             └────── reconnect（退避重试）────────┘
 *
 * - 命令响应按发送顺序路由（Redis 单连接严格有序）
 * - 服务器错误响应（-ERR）→ RespError
 * - 断线重连：pending 命令拒绝（可重试），重连后继续服务
 */

import net from 'node:net'
import type { Socket } from 'node:net'
import { encodeCommand, RespParser, RespError, type RespValue } from './resp.ts'
import { ConnectionError } from '../errors.ts'

export interface RedisConnectionOptions {
  host?: string
  port?: number
  /** 重连退避初始延迟 ms，指数增长。默认 100。 */
  retryDelayMs?: number
  /** 最大重连尝试次数。默认 10。0 = 无限。 */
  maxRetries?: number
}

interface Pending {
  resolve: (v: RespValue) => void
  reject: (e: unknown) => void
}

export class RedisConnection {
  readonly ready = false

  private opts: Required<RedisConnectionOptions>
  private socket: Socket | null = null
  private parser = new RespParser()
  private pending: Pending[] = []
  private status: 'idle' | 'connecting' | 'ready' | 'closed' = 'idle'
  private retries = 0
  private reconnectTimer: NodeJS.Timeout | null = null
  private connectPromise: Promise<void> | null = null
  private closed = false

  constructor(options: RedisConnectionOptions = {}) {
    this.opts = {
      host: options.host ?? '127.0.0.1',
      port: options.port ?? 6379,
      retryDelayMs: options.retryDelayMs ?? 100,
      maxRetries: options.maxRetries ?? 10,
    }
  }

  /** 建立连接并等待 ready。重连失败（超过 maxRetries）抛 ConnectionError。 */
  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise
    this.closed = false
    this.connectPromise = new Promise((resolve, reject) => {
      this.openSocket()
      this.onceReady = () => resolve()
      this.onceFailed = (err) => reject(err)
    }).finally(() => {
      this.connectPromise = null
      this.onceReady = undefined
      this.onceFailed = undefined
    })
    return this.connectPromise
  }

  private onceReady: (() => void) | undefined
  private onceFailed: ((err: unknown) => void) | undefined

  private openSocket() {
    this.status = 'connecting'
    const sock = net.connect(this.opts.port, this.opts.host)
    this.socket = sock

    sock.on('connect', () => {
      this.status = 'ready'
      this.retries = 0
      this.onceReady?.()
    })

    sock.on('data', (chunk) => this.onData(chunk))

    sock.on('error', (err) => {
      if (this.status === 'connecting') {
        // 连接失败——进入重连逻辑
        this.handleDisconnect(err)
      }
      // ready 后 socket 错误：等 close 事件统一处理
    })

    sock.on('close', () => {
      this.socket = null
      if (this.status !== 'closed' && this.status !== 'idle') {
        this.handleDisconnect(new Error('socket closed'))
      }
    })
  }

  private handleDisconnect(err: unknown) {
    // 拒绝当前所有 pending（连接断了，响应永远等不到）
    const queue = this.pending
    this.pending = []
    const retryErr = err instanceof ConnectionError ? err : err
    for (const p of queue) p.reject(retryErr)

    if (this.closed || this.status === 'closed') return

    this.retries++
    if (this.opts.maxRetries > 0 && this.retries > this.opts.maxRetries) {
      this.status = 'closed'
      const failErr =
        err instanceof ConnectionError
          ? err
          : new ConnectionError(`redis: connect to ${this.opts.host}:${this.opts.port} failed`, this.retries, err)
      this.onceFailed?.(failErr)
      return
    }

    // 指数退避重连
    const delay = Math.min(this.opts.retryDelayMs * 2 ** (this.retries - 1), 5_000)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.openSocket()
    }, delay)
  }

  private onData(chunk: Uint8Array) {
    try {
      const { value, incomplete } = this.parser.push(chunk)
      if (incomplete) return
      const p = this.pending.shift()
      if (!p) return
      // 错误响应（-ERR）是正常协议消息——reject 该命令，连接保持可用
      if (value instanceof RespError) p.reject(value)
      else p.resolve(value)
    } catch (e) {
      // 仅真正的协议解析崩溃（非 RespError）才拒绝全部并断开
      const queue = this.pending
      this.pending = []
      for (const q of queue) q.reject(e)
      this.socket?.destroy()
    }
  }

  /** 发送命令并等待响应（单连接严格有序） */
  command(name: string, ...args: (string | number)[]): Promise<RespValue> {
    if (this.status !== 'ready' || !this.socket) {
      return Promise.reject(new ConnectionError('redis: not connected'))
    }
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject })
      this.socket!.write(Buffer.from(encodeCommand([name, ...args])))
    })
  }

  /** 主动关闭——不再重连 */
  async close(): Promise<void> {
    this.closed = true
    this.status = 'closed'
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    const queue = this.pending
    this.pending = []
    for (const p of queue) p.reject(new ConnectionError('redis: connection closed'))
    const sock = this.socket
    this.socket = null
    if (sock) {
      sock.destroy()
      await new Promise((r) => setTimeout(r, 0))
    }
  }

  get connected(): boolean {
    return this.status === 'ready'
  }
}
