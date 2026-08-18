/**
 * weifuwu/db — MemoryRedisServer：内存 Redis 服务器（RESP 线协议）
 *
 * 进程内 TCP 服务器——客户端（RedisConnection/RedisPool）零改动直连：
 *   RESP 请求解析 → MemoryRedis 命令面执行（存储引擎复用）→ RESP 应答编码
 *
 * 支持：string/hash/list/set/zset/stream 消费组/pubsub（订阅推送）/
 *       PING/CLIENT ID/CLIENT KILL（断开目标连接）/UNSUBSCRIBE
 * 故障注入钩子：connection 选项（mock 服务器测试用）
 *
 * 诚实裁剪：未实现命令返回错误（与 MemoryRedis 一致——ProtocolError 编码为 -ERR）。
 */
import net from 'node:net'
import type { Socket } from 'node:net'
import { MemoryRedis } from './memory-redis.ts'
import type { RespValue } from './redis/resp.ts'
import { RespParser, IncompleteError } from './redis/resp.ts'
import { resolveCommand } from './redis/commands.ts'
import type { DBServer } from './server.ts'

export interface RedisServerOptions {
  /** 监听端口（0 = 随机）。默认 0。 */
  port?: number
  /** 认证口令（REQUIREPASS——AUTH 通过后可用）。默认无。 */
  password?: string
  /** 故障注入：命令处理器（返回 undefined = 正常执行；返回特殊值 = 模拟故障） */
  onCommand?: (socketId: number, name: string, args: string[]) => void
}

const _encoder = new TextEncoder()

/** RESP 应答编码（+OK / -ERR / :int / $str / *array） */
function encodeReply(v: RespValue): Uint8Array {
  if (v === null) return _encoder.encode('$-1\r\n')
  if (typeof v === 'number') return _encoder.encode(`:${v}\r\n`)
  if (typeof v === 'string') {
    const body = _encoder.encode(v)
    const head = `$${body.length}\r\n`
    const out = new Uint8Array(head.length + body.length + 2)
    out.set(_encoder.encode(head), 0)
    out.set(body, head.length)
    out[out.length - 2] = 13
    out[out.length - 1] = 10
    return out
  }
  if (Array.isArray(v)) {
    const parts: Uint8Array[] = [_encoder.encode(`*${v.length}\r\n`)]
    let len = parts[0].length
    for (const item of v) {
      const enc = encodeReply(item)
      parts.push(enc)
      len += enc.length
    }
    const out = new Uint8Array(len)
    let off = 0
    for (const p of parts) { out.set(p, off); off += p.length }
    return out
  }
  if (v instanceof Uint8Array) {
    const head = `$${v.length}\r\n`
    const out = new Uint8Array(head.length + v.length + 2)
    out.set(_encoder.encode(head), 0)
    out.set(v, head.length)
    out[out.length - 2] = 13
    out[out.length - 1] = 10
    return out
  }
  // 错误对象（RespError 等）→ -ERR
  const msg = v instanceof Error ? v.message : String(v)
  return _encoder.encode(`-${msg}\r\n`)
}

function encodeError(msg: string): Uint8Array {
  return _encoder.encode(`-${msg}\r\n`)
}

export class MemoryRedisServer implements DBServer {
  port = 0
  url = ''
  private server: net.Server | null = null
  private engine = new MemoryRedis()
  private sockets = new Map<number, Socket>()
  private subChannels = new Map<number, Set<string>>()
  private blpopWaiters = new Map<number, { key: string; resolve: (reply: Uint8Array) => void }>()
  private nextId = 1
  private opts: Required<Pick<RedisServerOptions, 'port' | 'password'>>
  private closed = false

  constructor(options: RedisServerOptions = {}) {
    this.opts = { port: options.port ?? 0, password: options.password ?? '' }
  }

  async start(): Promise<void> {
    if (this.server) return
    await new Promise<void>((resolve) => {
      this.server = net.createServer((sock) => this.handleSocket(sock))
      this.server.listen(this.opts.port, '127.0.0.1', () => {
        const addr = this.server!.address() as net.AddressInfo
        this.port = addr.port
        this.url = `redis://127.0.0.1:${addr.port}`
        resolve()
      })
    })
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    for (const sock of this.sockets.values()) sock.destroy()
    this.sockets.clear()
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve()
      this.server.close(() => resolve())
      this.server = null
    })
  }

  /** 测试辅助：断开发送端 socket（模拟 CLIENT KILL / 网络中断） */
  killSocket(socketId: number): void {
    this.blpopWaiters.delete(socketId)
    this.sockets.get(socketId)?.destroy()
  }

  /** 测试辅助：当前连接数 */
  get connectionCount(): number {
    return this.sockets.size
  }

  private handleSocket(sock: Socket): void {
    const id = this.nextId++
    this.sockets.set(id, sock)
    this.subChannels.set(id, new Set())
    const parser = new RespParser()
    const subscribed = this.subChannels.get(id)!
    let authed = this.opts.password === ''

    sock.on('data', (chunk) => {
      try {
        // pushAll：一次 data 事件可能含多个命令（pipeline batch）——全部解析并 dispatch
        const values = parser.pushAll(Buffer.from(chunk as Uint8Array))
        for (const value of values) {
          const decoded = decodeCommandArray(value)
          if (decoded === null) continue
          const [name, ...args] = decoded
          void this.dispatch(id, sock, name, args, authed)
            .then((reply) => {
              if (reply) sock.write(reply)
            })
            .catch((err) => {
              sock.write(encodeError(err instanceof Error ? err.message : String(err)))
            })
        }
      } catch (e) {
        if (e instanceof IncompleteError) return
        sock.write(encodeError(`ERR ${e instanceof Error ? e.message : String(e)}`))
      }
    })
    sock.on('close', () => { this.sockets.delete(id); this.subChannels.delete(id) })
    sock.on('error', () => { this.sockets.delete(id); this.subChannels.delete(id) })
  }

  private async dispatch(
    socketId: number,
    sock: Socket,
    name: string,
    args: string[],
    authed: boolean,
  ): Promise<Uint8Array | null> {
    const subscribed = this.subChannels.get(socketId) ?? new Set<string>()
    const upper = name.toUpperCase()

    // 认证
    if (upper === 'AUTH') {
      if (this.opts.password === '') return encodeError('ERR Client sent AUTH, but no password is set')
      if (args[0] !== this.opts.password) return encodeError('WRONGPASS invalid username-password pair')
      authed = true
      return _encoder.encode('+OK\r\n')
    }
    if (!authed) return encodeError('NOAUTH Authentication required.')

    // 订阅模式：SUBSCRIBE/PSUBSCRIBE/UNSUBSCRIBE/PING/QUIT
    if (upper === 'SUBSCRIBE' || upper === 'PSUBSCRIBE') {
      for (const ch of args) subscribed.add(ch)
      const replies = args.map((ch) => ['subscribe', ch, subscribed.size])
      return encodeReply(replies as unknown as RespValue)
    }
    if (upper === 'UNSUBSCRIBE') {
      const targets = args.length ? args : [...subscribed]
      for (const ch of targets) subscribed.delete(ch)
      const replies = targets.map((ch) => ['unsubscribe', ch, subscribed.size])
      return encodeReply(replies as unknown as RespValue)
    }

    // BLPOP：有值立即回；无值挂起（LPUSH 唤醒——阻塞语义）
    if (upper === 'BLPOP') {
      const key = args[0]
      try {
        const v = await this.engine.command('LPOP', key)
        if (v !== null && v !== undefined) return encodeReply([key, v])
      } catch {
        // 空 list 或错误——挂起等待
      }
      return new Promise<Uint8Array>((resolve) => {
        this.blpopWaiters.set(socketId, { key, resolve })
        // 连接断开时清理
        sock.once('close', () => this.blpopWaiters.delete(socketId))
      })
    }

    // LPUSH/RPUSH：推值后唤醒挂起的 BLPOP
    if (upper === 'LPUSH' || upper === 'RPUSH') {
      const key = args[0]
      const result = await this.engine.command(upper, ...args)
      for (const [sid, w] of this.blpopWaiters) {
        if (w.key === key) {
          this.blpopWaiters.delete(sid)
          const v = await this.engine.command('LPOP', key)
          w.resolve(encodeReply([key, v]))
        }
      }
      return _encoder.encode(`:${result}\r\n`)
    }

    // PUBLISH：写入引擎 + 推送给订阅连接
    if (upper === 'PUBLISH') {
      const channel = args[0]
      const message = args[1] ?? ''
      await this.engine.publish(channel, message)
      this.pushToSubscribers(channel, message)
      return _encoder.encode(':0\r\n')
    }

    // PING
    if (upper === 'PING') {
      return _encoder.encode('+PONG\r\n')
    }

    // CLIENT：ID 返回连接 id；KILL 断开目标
    if (upper === 'CLIENT') {
      if (args[0]?.toUpperCase() === 'ID') {
        return _encoder.encode(`:${socketId}\r\n`)
      }
      if (args[0]?.toUpperCase() === 'KILL') {
        // CLIENT KILL ID <id> | ADDR <addr>
        const idx = args.indexOf('ID')
        const idArg = idx >= 0 ? Number(args[idx + 1]) : NaN
        if (!Number.isNaN(idArg) && this.sockets.has(idArg)) {
          this.sockets.get(idArg)?.destroy()
          return _encoder.encode('+OK\r\n')
        }
        const addrIdx = args.indexOf('ADDR')
        if (addrIdx >= 0) {
          const [host, portStr] = String(args[addrIdx + 1]).split(':')
          for (const [sid, s] of this.sockets) {
            if (s.remoteAddress === host && s.remotePort === Number(portStr)) {
              s.destroy()
              return _encoder.encode('+OK\r\n')
            }
          }
        }
        return _encoder.encode(':0\r\n')
      }
      return encodeError('ERR unknown subcommand')
    }

    // 其余命令 → 注册表校验 + 引擎执行（MemoryRedis 命令面；错误编码为 -ERR）
    try {
      resolveCommand({ name, args })
      const result = await this.engine.command(name, ...args)
      if (result === 'OK') return _encoder.encode('+OK\r\n')
      return encodeReply(result)
    } catch (err) {
      return encodeError(err instanceof Error ? err.message : String(err))
    }
  }

  /** PUBLISH 后推送给精确订阅者（服务器主动消息：*3 message channel payload） */
  private pushToSubscribers(channel: string, message: string): void {
    const payload = `*3\r\n$7\r\nmessage\r\n$${Buffer.byteLength(channel)}\r\n${channel}\r\n$${Buffer.byteLength(message)}\r\n${message}\r\n`
    for (const [sid, channels] of this.subChannels) {
      if (channels.has(channel)) {
        this.sockets.get(sid)?.write(payload)
      }
    }
  }
}

/** RESP 数组值 → 命令字符串数组（$bulk 解码为 utf8） */
function decodeCommandArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  return v.map((x) => {
    if (x instanceof Uint8Array) return new TextDecoder().decode(x)
    if (x === null) return ''
    return String(x)
  })
}
