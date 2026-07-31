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

/** 订阅旁路消息类型（subscribe 确认 / message / pmessage 等） */
const PUSH_TYPES = new Set(['message', 'pmessage'])

export interface RedisConnectionOptions {
  host?: string
  port?: number
  /** 重连退避初始延迟 ms，指数增长。默认 100。 */
  retryDelayMs?: number
  /** 最大重连尝试次数。默认 10。0 = 无限。 */
  maxRetries?: number
  /** 未连接时命令是否入队等待（ioredis enableOfflineQueue 语义）。默认 true。 */
  enableOfflineQueue?: boolean
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
  private offlineQueue: { name: string; args: (string | number)[]; resolve: (v: RespValue) => void; reject: (e: unknown) => void }[] = []
  private subs = new Map<string, (channel: string, message: string) => void>()
  private psubs = new Map<string, (channel: string, message: string) => void>()
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
      enableOfflineQueue: options.enableOfflineQueue ?? true,
    }
  }

  /** 建立连接并等待 ready。重连失败（超过 maxRetries）抛 ConnectionError。 */
  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise
    this.closed = false
    this.connectPromise = new Promise<void>((resolve, reject) => {
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
      this.flushOffline()
      this.onceReady?.()
    })

    sock.on('data', (chunk: Buffer) => this.onData(new Uint8Array(chunk)))

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
            // 一次 data 事件可能包含多个回复（并发命令的响应合并在一个 TCP chunk）
      const values = this.parser.pushAll(chunk)
            for (const value of values) {
        // 订阅推送（message/pmessage）旁路到回调——不消费 pending
        if (Array.isArray(value) && typeof value[0] === 'string' && PUSH_TYPES.has(value[0])) {
          this.dispatchSubscribe(value as string[])
          continue
        }
        const p = this.pending.shift()
        if (!p) break
        // 错误响应（-ERR）是正常协议消息——reject 该命令，连接保持可用
        if (value instanceof RespError) p.reject(value)
        else p.resolve(value)
      }
    } catch (e) {
      // 仅真正的协议解析崩溃（非 RespError）才拒绝全部并断开
      const queue = this.pending
      this.pending = []
      for (const q of queue) q.reject(e)
      this.socket?.destroy()
    }
  }

  /** 发送命令并等待响应（单连接严格有序）。未 ready 时入离线队列（enableOfflineQueue）或拒绝。 */
  command(name: string, ...args: (string | number)[]): Promise<RespValue> {
    if (this.status === 'ready' && this.socket) {
      return this.sendNow(name, args)
    }
    if (this.closed || this.status === 'closed' || !this.opts.enableOfflineQueue) {
      return Promise.reject(new ConnectionError('redis: not connected'))
    }
    // 离线队列：连接建立后按序 flush
    return new Promise((resolve, reject) => {
      this.offlineQueue.push({ name, args, resolve, reject })
    })
  }

  private sendNow(name: string, args: (string | number)[]): Promise<RespValue> {
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject })
      this.socket!.write(Buffer.from(encodeCommand([name, ...args])))
    })
  }

  private flushOffline() {
    const queue = this.offlineQueue
    this.offlineQueue = []
    for (const q of queue) {
      this.sendNow(q.name, q.args).then(q.resolve, q.reject)
    }
  }

  /** 批量执行：一次 write 发送所有命令字节，响应按序路由（管道） */
  batch(payload: Uint8Array, count: number): Promise<RespValue[]> {
    if (this.status !== 'ready' || !this.socket) {
      return Promise.reject(new ConnectionError('redis: not connected'))
    }
    return new Promise((resolve, reject) => {
      const results: RespValue[] = []
      const maybeResolve = () => {
        if (results.length === count) resolve(results)
      }
      for (let i = 0; i < count; i++) {
        this.pending.push({
          // 正常响应与错误响应（RespError）都作为结果值收集——管道语义
          resolve: (v) => {
            results.push(v)
            maybeResolve()
          },
          reject: (e) => {
            results.push(e as RespValue)
            maybeResolve()
          },
        })
      }
      this.socket!.write(Buffer.from(payload))
    })
  }

/** 订阅频道：回调式（channel, message） */
async subscribe(channel: string, fn: (channel: string, message: string) => void): Promise<void> {
  this.subs.set(channel, fn)
  await this.command('SUBSCRIBE', channel)
}

/** 订阅模式：回调式（channel, message） */
async psubscribe(pattern: string, fn: (channel: string, message: string) => void): Promise<void> {
  this.psubs.set(pattern, fn)
  await this.command('PSUBSCRIBE', pattern)
}

/** 旁路分发订阅消息（RESP 数组路由到回调） */
private dispatchSubscribe(value: string[]) {
  const [type, a, b] = value
  if (type === 'message') {
    const fn = this.subs.get(a)
    fn?.(a, b)
  } else if (type === 'pmessage') {
    // pmessage: [pattern, channel, message]
    const fn = this.psubs.get(a)
    fn?.(b, value[3] ?? '')
  }
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
