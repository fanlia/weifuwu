/**
 * weifuwu/db/redis — RESP2 协议编解码
 *
 * 编码（客户端 → 服务器）: encodeCommand(['SET','k','v']) → *3\r\n$3\r\nSET\r\n...
 * 解码（服务器 → 客户端）: parseReply(buffer) → string | number | null | (string|number|null)[]
 *
 * 解码为增量式：连接层可喂入任意分片，累积到完整消息后取回。
 */

import { DbError } from '../errors.ts'

export type RespValue = string | number | null | RespValue[]

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

/** 增量 RESP 解析器：喂入任意分片，完整消息出现时返回 value */
export class RespParser {
  private buf: Uint8Array = new Uint8Array(0)

  /** 喂入数据分片。返回 { value, incomplete }；incomplete=true 时需继续喂。 */
  push(chunk: Uint8Array): { value: RespValue; incomplete: boolean } {
    this.buf = concat(this.buf, chunk)
    try {
      const value = this.parseValue()
      return { value, incomplete: false }
    } catch (e) {
      if (e instanceof IncompleteError) return { value: null, incomplete: true }
      throw e
    }
  }

  private parseValue(): RespValue {
    if (this.buf.length < 3) throw new IncompleteError()
    const type = String.fromCharCode(this.buf[0])

    switch (type) {
      case '+': {
        const line = this.readLine()
        return line
      }
      case '-': {
        const line = this.readLine()
        throw new RespError(line)
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

  /** 读一行（到 \r\n），返回行内容（不含 type 字节与 \r\n），并消费 */
  private readLine(): string {
    const idx = indexOfCRLF(this.buf)
    if (idx === -1) throw new IncompleteError()
    const line = new TextDecoder().decode(this.buf.subarray(1, idx))
    this.buf = this.buf.subarray(idx + 2)
    return line
  }

  /** 读 len 字节的 bulk 内容 + \r\n */
  private readBulk(len: number): string {
    if (this.buf.length < len + 2) throw new IncompleteError()
    const value = new TextDecoder().decode(this.buf.subarray(0, len))
    // 跳过内容后的 \r\n
    this.buf = this.buf.subarray(len + 2)
    return value
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

function indexOfCRLF(buf: Uint8Array): number {
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10) return i
  }
  return -1
}
