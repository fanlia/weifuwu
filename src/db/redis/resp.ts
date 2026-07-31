/**
 * weifuwu/db/redis — RESP2 协议编解码
 *
 * 编码（客户端 → 服务器）: encodeCommand(['SET','k','v']) → *3\r\n$3\r\nSET\r\n...
 * 解码（服务器 → 客户端）: parseReply(buffer) → string | number | null | (string|number|null)[]
 *
 * 解码为增量式：连接层可喂入任意分片，累积到完整消息后取回。
 */

import { DbError } from '../errors.ts'

export type RespValue = string | number | null | RespError | RespValue[]

/** 服务器错误响应（-ERR ...） */
export class RespError extends DbError {
  constructor(message: string) {
    super('protocol', message, { code: 'RESP' })
    this.name = 'RespError'
  }
}

/** 数据不完整（等待更多分片） */
export class IncompleteError extends Error {
  constructor() {
    super('incomplete RESP message')
    this.name = 'IncompleteError'
  }
}

/** 编码命令为 RESP 数组字节 */
export function encodeCommand(args: (string | number | Buffer)[]): Uint8Array {
  const parts: string[] = [`*${args.length}\r\n`]
  for (const arg of args) {
    const s = typeof arg === 'string' ? arg : arg instanceof Buffer ? arg.toString() : String(arg)
    parts.push(`$${Buffer.byteLength(s)}\r\n${s}\r\n`)
  }
  return new TextEncoder().encode(parts.join(''))
}

/** 从完整 buffer 解析单个 RESP 值（非增量——单消息场景） */
export function parseReply(data: Uint8Array): RespValue {
  const parser = new RespParser()
  const result = parser.push(data)
  if (result.incomplete) throw new IncompleteError()
  return result.value
}

/** 增量 RESP 解析器：零拷贝（buffer + offset 指针），喂入任意分片 */
const _decoder = new TextDecoder()

export class RespParser {
  private buf: Uint8Array = new Uint8Array(0)
  private off = 0

  /** 喂入数据分片。返回 { value, incomplete }；incomplete=true 时需继续喂。 */
  push(chunk: Uint8Array): { value: RespValue; incomplete: boolean } {
    this.append(chunk)
    const saved = this.off
    try {
      const value = this.parseValue()
      this.compact()
      return { value, incomplete: false }
    } catch (e) {
      this.off = saved
      if (e instanceof IncompleteError) return { value: null, incomplete: true }
      throw e
    }
  }

  /** 喂入分片并解析 buffer 中所有完整响应（连接层：一次 data 事件可能含多个回复） */
  pushAll(chunk: Uint8Array): RespValue[] {
    this.append(chunk)
    const out: RespValue[] = []
    while (true) {
      const saved = this.off
      try {
        out.push(this.parseValue())
      } catch (e) {
        this.off = saved
        if (e instanceof IncompleteError) break
        throw e
      }
    }
    if (out.length > 0) this.compact()
    return out
  }

  /** 追加分片：已消费部分先行压缩（一次拷贝），避免 O(n²) 累积 */
  private append(chunk: Uint8Array) {
    if (chunk.length === 0) return
    const rest = this.buf.length - this.off
    if (rest === 0) {
      this.buf = chunk
      this.off = 0
      return
    }
    const merged = new Uint8Array(rest + chunk.length)
    merged.set(this.buf.subarray(this.off), 0)
    merged.set(chunk, rest)
    this.buf = merged
    this.off = 0
  }

  /** 全部消费后压缩（释放底层） */
  private compact() {
    if (this.off === this.buf.length) {
      this.buf = new Uint8Array(0)
      this.off = 0
    } else if (this.off > 0) {
      this.buf = this.buf.subarray(this.off)
      this.off = 0
    }
  }

  private parseValue(): RespValue {
    if (this.buf.length - this.off < 3) throw new IncompleteError()
    const type = String.fromCharCode(this.buf[this.off])
    this.off++

    switch (type) {
      case '+': {
        const line = this.readLine()
        return line
      }
      case '-': {
        // 错误响应是正常消息（业务错误）——返回 RespError 值，连接保持
        const line = this.readLine()
        return new RespError(line)
      }
      case ':': {
        const line = this.readLine()
        return parseInt(line, 10)
      }
      case '$': {
        const len = parseInt(this.readLine(), 10)
        if (len === -1) return null
        return this.readBulk(len)
      }
      case '*': {
        const count = parseInt(this.readLine(), 10)
        if (count === -1) return null
        const items: RespValue[] = []
        for (let i = 0; i < count; i++) items.push(this.parseValue())
        return items
      }
      default:
        throw new DbError('protocol', `unknown RESP type byte: ${type}`, { code: 'RESP' })
    }
  }

  /** 读一行（到 \r\n），返回行内容（不含 type 字节与 \r\n），并推进 off */
  private readLine(): string {
    const idx = indexOfCRLF(this.buf, this.off)
    if (idx === -1) throw new IncompleteError()
    const line = _decoder.decode(this.buf.subarray(this.off, idx))
    this.off = idx + 2
    return line
  }

  /** 读 len 字节的 bulk 内容 + \r\n */
  private readBulk(len: number): string {
    if (this.buf.length - this.off < len + 2) throw new IncompleteError()
    const value = _decoder.decode(this.buf.subarray(this.off, this.off + len))
    this.off += len + 2
    return value
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

function indexOfCRLF(buf: Uint8Array, from = 0): number {
  for (let i = from; i < buf.length - 1; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10) return i
  }
  return -1
}
