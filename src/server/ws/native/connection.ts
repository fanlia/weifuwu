/**
 * RFC6455 服务端连接（W5 自研——状态层校验与生命周期）
 *
 * 状态层校验（帧层在 frame.ts）：
 * - 分片序列：CONT 无起始 / 数据帧打断分片 → 1002
 * - UTF-8：文本消息**增量**校验（非法字节即刻 1007——Autobahn 6.x 要求）
 * - 关闭帧：载荷 1 字节 → 1002；关闭码非法（保留段）→ 1002；理由非法 UTF-8 → 1007
 * - 消息总长 > maxPayload → 1009（跨分片累计）
 * - 关闭握手：收到 CLOSE → 回显并以 FIN 收尾；主动 close() → 等回显（超时销毁）
 *
 * 诚实裁剪：无扩展/无压缩（RSV 已在帧层拒绝）；不做自动 ping。
 */
import type { Duplex } from 'node:stream'
import { decodeFrames, encodeFrame, OP, type Frame } from './frame.ts'

export interface NativeConnectionOptions {
  maxPayload?: number
  closeTimeoutMs?: number
}

const EMPTY = Buffer.alloc(0)

/** 合法关闭码（RFC6455 §7.4）：1000-1003/1007-1011 及 3000-4999（1004/1005/1006/1015 保留不可上线路） */
function validCloseCode(code: number): boolean {
  return (code >= 1000 && code <= 1003) || (code >= 1007 && code <= 1011) || (code >= 3000 && code <= 4999)
}

function closePayload(code?: number, reason = ''): Buffer {
  if (code === undefined) return EMPTY
  const body = Buffer.from(reason, 'utf8').subarray(0, 123)
  const buf = Buffer.allocUnsafe(2 + body.length)
  buf.writeUInt16BE(code, 0)
  body.copy(buf, 2)
  return buf
}

type Listener = (...args: unknown[]) => void

export class NativeConnection {
  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSING = 2
  readonly CLOSED = 3

  readyState = 1
  readonly socket: Duplex

  private readonly opts: Required<NativeConnectionOptions>
  private readonly listeners = new Map<string, Set<Listener>>()
  private buf: Buffer = EMPTY
  private fragmentOpcode: number | null = null
  private fragments: Buffer[] = []
  private fragmentBytes = 0
  private textParts: string[] = []
  private textDecoder: TextDecoder | null = null
  private closeSent = false
  private closed = false
  private closeTimer: ReturnType<typeof setTimeout> | null = null
  private closedEvent = false

  constructor(socket: Duplex, opts: NativeConnectionOptions = {}) {
    this.socket = socket
    this.opts = {
      maxPayload: opts.maxPayload ?? 100 * 1024 * 1024,
      closeTimeoutMs: opts.closeTimeoutMs ?? 5000,
    }
    socket.on('data', (chunk: Buffer) => this.feed(chunk))
    socket.on('end', () => this.destroy())
    socket.on('close', () => this.destroy())
    socket.on('error', (err: Error) => {
      this.emit('error', err)
      this.destroy()
    })
  }

  // ── 事件（on/off/once/emit + addEventListener 别名） ──
  on(event: string, handler: Listener): this {
    let set = this.listeners.get(event)
    if (!set) this.listeners.set(event, (set = new Set()))
    set.add(handler)
    return this
  }
  once(event: string, handler: Listener): this {
    const wrap: Listener = (...args) => {
      this.off(event, wrap)
      handler(...args)
    }
    return this.on(event, wrap)
  }
  off(event: string, handler: Listener): this {
    this.listeners.get(event)?.delete(handler)
    return this
  }
  addEventListener(event: string, handler: Listener): void {
    this.on(event, handler)
  }
  removeEventListener(event: string, handler: Listener): void {
    this.off(event, handler)
  }
  private emit(event: string, ...args: unknown[]): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const h of [...set]) {
      try {
        h(...args)
      } catch (err) {
        if (event !== 'error') this.emit('error', err instanceof Error ? err : new Error(String(err)))
      }
    }
  }

  // ── 发送 ──
  send(data: string | Buffer): void {
    if (this.readyState !== this.OPEN) return
    const isText = typeof data === 'string'
    this.write(encodeFrame(isText ? OP.TEXT : OP.BINARY, isText ? data : data))
  }

  ping(data: unknown = EMPTY): void {
    if (this.readyState !== this.OPEN) return
    const payload =
      Buffer.isBuffer(data) ? data : typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(String(data), 'utf8')
    this.write(encodeFrame(OP.PING, payload))
  }

  close(code = 1000, reason = ''): void {
    if (this.closeSent || this.closed) return
    this.closeSent = true
    this.readyState = this.CLOSING
    this.write(encodeFrame(OP.CLOSE, closePayload(code, reason)))
    this.closeTimer = setTimeout(() => this.destroy(), this.opts.closeTimeoutMs)
  }

  private write(frame: Buffer): void {
    if (this.socket.destroyed) return
    this.socket.write(frame)
  }

  private destroy(): void {
    if (this.closed) return
    this.closed = true
    this.readyState = this.CLOSED
    if (this.closeTimer) clearTimeout(this.closeTimer)
    this.socket.destroy()
    this.emitClose(1006, '')
  }

  private emitClose(code: number, reason: string): void {
    if (this.closedEvent) return
    this.closedEvent = true
    this.emit('close', code, reason)
  }

  // ── 接收 ──
  /** 喂入原始字节（含升级请求的 head 余量——可任意分片） */
  feed(chunk: Buffer): void {
    if (this.closed || this.readyState === this.CLOSED) return
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk
    const { frames, rest, error } = decodeFrames(this.buf, this.opts.maxPayload)
    this.buf = rest
    if (error) {
      this.fail(error.code, error.reason)
      return
    }
    for (const frame of frames) {
      if (this.closed || this.readyState === this.CLOSED) return
      this.handleFrame(frame)
    }
  }

  private handleFrame(frame: Frame): void {
    switch (frame.opcode) {
      case OP.TEXT:
      case OP.BINARY: {
        if (this.fragmentOpcode !== null) return this.fail(1002, 'expected continuation frame')
        if (frame.fin) return this.deliver(frame.opcode, [frame.payload])
        this.fragmentOpcode = frame.opcode
        this.fragments = [frame.payload]
        this.fragmentBytes = frame.payload.length
        this.textParts = []
        this.textDecoder = frame.opcode === OP.TEXT ? new TextDecoder('utf-8', { fatal: true }) : null
        // 首片不得 flush（未完成多字节序列合法——Autobahn 6.2.4：逐字节分片合法文本）
        if (frame.opcode === OP.TEXT && !this.feedText(frame.payload, false)) return
        return
      }
      case OP.CONT: {
        if (this.fragmentOpcode === null) return this.fail(1002, 'unexpected continuation frame')
        this.fragmentBytes += frame.payload.length
        if (this.fragmentBytes > this.opts.maxPayload) return this.fail(1009, 'message exceeds maxPayload')
        if (this.fragmentOpcode === OP.TEXT && !this.feedText(frame.payload, frame.fin)) return
        this.fragments.push(frame.payload)
        if (frame.fin) {
          const opcode = this.fragmentOpcode
          this.fragmentOpcode = null
          this.deliver(opcode, this.fragments)
        }
        return
      }
      case OP.PING:
        this.write(encodeFrame(OP.PONG, frame.payload))
        this.emit('ping', frame.payload)
        return
      case OP.PONG:
        this.emit('pong', frame.payload)
        return
      case OP.CLOSE:
        this.handleClose(frame.payload)
        return
    }
  }

  /** 增量 UTF-8 校验（非法/不完整 → fail(1007) 并返回 false）；parts 累积解码文本 */
  private feedText(chunk: Buffer, final: boolean): boolean {
    const decoder = this.textDecoder
    if (!decoder) return true
    try {
      this.textParts.push(decoder.decode(chunk, { stream: !final }))
      return true
    } catch {
      this.fail(1007, 'invalid utf-8 in text message')
      return false
    }
  }

  /** 完整消息投递（text → string；binary → Buffer） */
  private deliver(opcode: number, parts: Buffer[]): void {
    if (this.closed) return
    if (opcode === OP.TEXT) {
      let text: string
      if (this.textParts.length || this.textDecoder) {
        // 分片路径：feedText 已增量校验；此处 flush 余量
        try {
          text = this.textParts.join('') + (this.textDecoder?.decode() ?? '')
        } catch {
          return this.fail(1007, 'invalid utf-8 in text message')
        }
        this.textParts = []
        this.textDecoder = null
      } else {
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(parts[0] ?? EMPTY)
        } catch {
          return this.fail(1007, 'invalid utf-8 in text message')
        }
      }
      this.emit('message', text, false)
    } else {
      this.emit('message', parts.length === 1 ? parts[0] : Buffer.concat(parts), true)
    }
  }

  private handleClose(payload: Buffer): void {
    let code = 1005
    let reason = ''
    if (payload.length === 1) return this.fail(1002, 'close payload length 1')
    if (payload.length >= 2) {
      code = payload.readUInt16BE(0)
      if (!validCloseCode(code)) return this.fail(1002, `invalid close code ${code}`)
      try {
        reason = new TextDecoder('utf-8', { fatal: true }).decode(payload.subarray(2))
      } catch {
        return this.fail(1007, 'invalid utf-8 in close reason')
      }
    }
    if (!this.closeSent) {
      this.closeSent = true
      this.readyState = this.CLOSING
      this.write(encodeFrame(OP.CLOSE, closePayload(code === 1005 ? undefined : code, reason)))
    }
    this.closed = true
    this.readyState = this.CLOSED
    if (this.closeTimer) clearTimeout(this.closeTimer)
    if (this.socket.writable) this.socket.end()
    this.emitClose(code, reason)
  }

  /** 协议错误：关闭帧（带码）+ FIN 收尾（不再等待回显） */
  private fail(code: number, reason: string): void {
    if (this.closed) return
    this.closed = true
    this.readyState = this.CLOSED
    if (this.closeTimer) clearTimeout(this.closeTimer)
    const frame = encodeFrame(OP.CLOSE, closePayload(code, reason))
    if (!this.socket.destroyed) this.socket.end(frame)
    this.emitClose(code, reason)
  }
}
