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
import { encodeCommand, decodeValue, RespParser, RespError, type RespValue } from './resp.ts'
import { ConnectionError, TimeoutError } from '../errors.ts'

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
  /** 离线队列上限。默认 5000。超限命令立即 reject（防断线期间无限累积）。 */
  maxOfflineQueue?: number
  /** 命令超时 ms（服务器慢/挂起时 reject，防 promise 永久挂起）。默认 0 = 禁用。 */
  commandTimeoutMs?: number
  /** socket 响应超时 ms（僵尸自愈：有 pending 命令且超时无数据 → 主动断开走重连）。默认 0 = 禁用。 */
  socketTimeoutMs?: number
}

/** 阻塞命令：超时语义 = resolve(null)（Redis 阻塞超时行为），而非 reject */
const BLOCKING_COMMANDS = new Set(['BLPOP', 'BRPOP', 'BLMPOP', 'BRPOPLPUSH', 'BZPOPMIN', 'BZPOPMAX', 'WAIT', 'XREAD', 'XREADGROUP'])

interface Pending {
  resolve: (v: RespValue) => void
  reject: (e: unknown) => void
  /** true：响应值保留原始字节（Uint8Array，不 decode）——二进制安全 */
  asBuffer?: boolean
  /** 已超时：响应到达时跳过（超时不移除数组——避免破坏 pendingHead 指针） */
  timedOut?: boolean
  /** 阻塞命令：超时 resolve(null)（Redis 语义） */
  blocking?: boolean
  timer?: NodeJS.Timeout
}

export class RedisConnection {
  readonly ready = false

  private opts: Required<RedisConnectionOptions>
  private socket: Socket | null = null
  private parser = new RespParser()
  private pending: Pending[] = []
  /** pending 头指针（避免 shift() O(n)——消费后定期 compact） */
  private pendingHead = 0
  private offlineQueue: {
    name: string
    args: (string | number)[]
    resolve: (v: RespValue) => void
    reject: (e: unknown) => void
    asBuffer?: boolean
  }[] = []
  private subs = new Map<string, (channel: string, message: string) => void>()
  private psubs = new Map<string, (channel: string, message: string) => void>()
  private status: 'idle' | 'connecting' | 'ready' | 'closed' = 'idle'
  private retries = 0
  private reconnectTimer: NodeJS.Timeout | null = null
  private socketTimeoutTimer: NodeJS.Timeout | null = null
  private connectPromise: Promise<void> | null = null
  private closed = false
  private connectedOnce = false

  constructor(options: RedisConnectionOptions = {}) {
    this.opts = {
      host: options.host ?? '127.0.0.1',
      port: options.port ?? 6379,
      retryDelayMs: options.retryDelayMs ?? 100,
      maxRetries: options.maxRetries ?? 10,
      enableOfflineQueue: options.enableOfflineQueue ?? true,
      maxOfflineQueue: options.maxOfflineQueue ?? 5000,
      commandTimeoutMs: options.commandTimeoutMs ?? 0,
      socketTimeoutMs: options.socketTimeoutMs ?? 0,
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
      sock.setNoDelay(true) // 禁用 Nagle
      this.status = 'ready'
      this.retries = 0
      this.flushOffline()
      this.onceReady?.()
      // 重连后恢复订阅（首次连接跳过——subscribe() 已发过）
      if (this.connectedOnce) {
        for (const ch of this.subs.keys()) this.sendNow('SUBSCRIBE', [ch])
        for (const pat of this.psubs.keys()) this.sendNow('PSUBSCRIBE', [pat])
      }
      this.connectedOnce = true
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
        this.handleDisconnect(new ConnectionError('redis: socket closed'))
      }
    })
  }

  private handleDisconnect(err: unknown) {
    // 拒绝当前所有 pending（连接断了，响应永远等不到）
    const queue = this.pending.slice(this.pendingHead)
    this.pending = []
    this.pendingHead = 0
    for (const p of queue) p.reject(err)
    this.clearSocketTimeout()

    if (this.closed || this.status === 'closed') return

    this.retries++
    // 断线状态真实化：重连等待期间 status 应为 connecting（connected 假阳性会让池继续分发）
    this.status = 'connecting'
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
      for (const raw of values) {
        // 订阅推送（message/pmessage）旁路到回调——不消费 pending。
        // 顶层第一个元素做非破坏性检查（字节 → string 仅用于匹配）
        const first =
          Array.isArray(raw) && raw.length > 0 ? decodeValue(raw[0], true) : undefined
        if (typeof first === 'string' && PUSH_TYPES.has(first)) {
          this.dispatchSubscribe(decodeValue(raw, true) as string[])
          continue
        }
        const p = this.pending[this.pendingHead++]
        if (!p) break
        // 已超时的命令：跳过其迟到响应（超时不移除数组——head 指针安全）
        if (p.timedOut) continue
        // 错误响应（-ERR）是正常协议消息——reject 该命令，连接保持可用
        if (raw instanceof RespError) p.reject(raw)
        else p.resolve(decodeValue(raw, !p.asBuffer)) // 普通命令解码 string；asBuffer 保留字节
      }
      // 头指针摊还压缩：消费过半且超过阈值时收拢
      if (this.pendingHead > 64 && this.pendingHead * 2 > this.pending.length) {
        this.pending = this.pending.slice(this.pendingHead)
        this.pendingHead = 0
      }
      // socket 响应超时（僵尸自愈）：收到数据说明连接活着——有剩余 pending 则重启 timer，否则停止
      if (this.opts.socketTimeoutMs > 0) {
        if (this.pendingHead < this.pending.length) this.armSocketTimeout()
        else this.clearSocketTimeout()
      }
    } catch (e) {
      // 仅真正的协议解析崩溃（非 RespError）才拒绝全部并断开
      const queue = this.pending.slice(this.pendingHead)
      this.pending = []
      this.pendingHead = 0
      for (const q of queue) q.reject(e)
      this.socket?.destroy()
    }
  }

  /**
   * 发送命令并等待响应（单连接严格有序）。未 ready 时入离线队列（enableOfflineQueue）或拒绝。
   * opts.asBuffer=true：响应保留原始字节（Uint8Array）——getBuffer 等二进制场景。
   */
  command(name: string, ...args: (string | number | Buffer | { asBuffer?: boolean })[]): Promise<RespValue> {
    const last = args[args.length - 1]
    const opts =
      typeof last === 'object' && last !== null && !(last instanceof Uint8Array)
        ? (args.pop() as { asBuffer?: boolean })
        : undefined
    if (this.status === 'ready' && this.socket) {
      return this.sendNow(name, args as (string | number)[], opts?.asBuffer)
    }
    if (this.closed || this.status === 'closed' || !this.opts.enableOfflineQueue) {
      return Promise.reject(new ConnectionError('redis: not connected'))
    }
    // 离线队列：连接建立后按序 flush；超限拒绝（防断线期间无限累积）
    if (this.offlineQueue.length >= this.opts.maxOfflineQueue) {
      return Promise.reject(new ConnectionError(`redis: offline queue full (${this.opts.maxOfflineQueue})`))
    }
    return new Promise((resolve, reject) => {
      this.offlineQueue.push({ name, args: args as (string | number)[], resolve, reject, asBuffer: opts?.asBuffer })
    })
  }

  private sendNow(name: string, args: (string | number)[], asBuffer?: boolean): Promise<RespValue> {
    return new Promise((resolve, reject) => {
      const p: Pending = {
        resolve,
        reject,
        asBuffer,
        blocking: BLOCKING_COMMANDS.has(name.toUpperCase()),
      }
      this.armTimeout(p)
      this.pending.push(p)
      this.armSocketTimeout()
      this.socket!.write(encodeCommand([name, ...args])) // Uint8Array 直接写，免 Buffer 拷贝
    })
  }

  /** 命令超时（commandTimeoutMs > 0）：超时标记 timedOut + 处理（阻塞命令 resolve(null)，其余 reject） */
  private armTimeout(p: Pending): void {
    const ms = this.opts.commandTimeoutMs
    if (ms <= 0) return
    p.timer = setTimeout(() => {
      p.timedOut = true
      if (p.blocking) p.resolve(null) // 阻塞命令：Redis 语义（BLPOP 超时 = 空结果）
      else p.reject(new TimeoutError('redis: command timeout', ms))
    }, ms)
  }

  /** socket 响应超时（socketTimeoutMs > 0）：期望数据但超时未达 → 僵尸连接 → 主动断开走标准重连 */
  private armSocketTimeout(): void {
    const ms = this.opts.socketTimeoutMs
    if (ms <= 0) return
    this.clearSocketTimeout()
    this.socketTimeoutTimer = setTimeout(() => {
      this.socketTimeoutTimer = null
      const err = new ConnectionError(`redis: socket timeout (no data in ${ms}ms)`)
      // 先 reject 全部 pending（保留超时错误信息；close 事件后的 handleDisconnect 只负责重连）
      const queue = this.pending.slice(this.pendingHead)
      this.pending = []
      this.pendingHead = 0
      for (const q of queue) q.reject(err)
      this.clearSocketTimeout()
      // 销毁 socket → 触发 close → handleDisconnect（标准断线自愈路径）
      this.socket?.destroy()
    }, ms)
  }

  private clearSocketTimeout(): void {
    if (this.socketTimeoutTimer) {
      clearTimeout(this.socketTimeoutTimer)
      this.socketTimeoutTimer = null
    }
  }

  private flushOffline() {
    const queue = this.offlineQueue
    this.offlineQueue = []
    for (const q of queue) {
      this.sendNow(q.name, q.args, q.asBuffer).then(q.resolve, q.reject)
    }
  }

  /** 批量执行：一次 write 发送所有命令字节，响应按序路由（管道） */
  batch(payload: Uint8Array, count: number): Promise<RespValue[]> {
    if (this.status !== 'ready' || !this.socket) {
      return Promise.reject(new ConnectionError('redis: not connected'))
    }
    return new Promise((resolve, reject) => {
      const results: RespValue[] = []
      const batchPending: Pending[] = []
      let settled = false
      const maybeResolve = () => {
        if (settled) return
        if (results.length === count) {
          settled = true
          if (batchTimer) clearTimeout(batchTimer)
          resolve(results)
        }
      }
      for (let i = 0; i < count; i++) {
        const p: Pending = {
          // 正常响应与错误响应（RespError）都作为结果值收集——管道语义
          resolve: (v) => {
            results.push(v)
            maybeResolve()
          },
          reject: (e) => {
            results.push(e as RespValue)
            maybeResolve()
          },
        }
        batchPending.push(p)
        this.pending.push(p)
      }
      // 批量超时：标记整批 timedOut（迟到响应跳过）+ reject（管道语义：返回已收结果）
      let batchTimer: NodeJS.Timeout | undefined
      const ms = this.opts.commandTimeoutMs
      if (ms > 0) {
        batchTimer = setTimeout(() => {
          settled = true
          for (const p of batchPending) p.timedOut = true
          reject(new TimeoutError('redis: batch timeout', ms))
        }, ms)
      }
      this.socket!.write(payload)
      this.armSocketTimeout()
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
    this.clearSocketTimeout()
    const queue = this.pending.slice(this.pendingHead)
    this.pending = []
    this.pendingHead = 0
    for (const p of queue) p.reject(new ConnectionError('redis: connection closed'))
    // 离线队列（未连接时入队）——关闭后永远无法 flush，一并拒绝（防 promise 挂起泄漏）
    const oq = this.offlineQueue
    this.offlineQueue = []
    for (const q of oq) q.reject(new ConnectionError('redis: connection closed'))
    const sock = this.socket
    this.socket = null
    sock?.destroy() // destroy 同步关闭，无需事件循环 hack
  }

  get connected(): boolean {
    return this.status === 'ready'
  }
}
