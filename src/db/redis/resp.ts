/**
 * weifuwu/db/redis — RESP2 协议编解码
 *
 * 编码（客户端 → 服务器）: encodeCommand(['SET','k','v']) → *3\r\n$3\r\nSET\r\n...
 * 解码（服务器 → 客户端）: parseReply(buffer) → string | number | null | (string|number|null)[]
 *
 * 解码为增量式：连接层可喂入任意分片，累积到完整消息后取回。
 */

import { DbError } from '../errors.ts'

export type RespValue = string | number | null | RespError | RespValue[] | Uint8Array

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

/** 递归解码字节值（bulk → string）。decodeBytes=false 时字节原样保留（二进制安全）。 */
export function decodeValue(v: RespValue, decodeBytes: boolean): RespValue {
  if (v instanceof Uint8Array) return decodeBytes ? _decoder.decode(v) : v
  if (Array.isArray(v)) return v.map((x) => decodeValue(x, decodeBytes))
  return v
}

/** 编码命令为 RESP 数组字节。Buffer 参数字节原样写入（二进制安全，零损坏）。 */
export function encodeCommand(args: (string | number | Buffer)[]): Uint8Array {
  // 两遍法：先算总长（header + 各元素 $len 前缀 + 字节 + CRLF），预分配一次写入
  const lens: number[] = new Array(args.length)
  let total = headerLen(args.length)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const len =
      typeof arg === 'string'
        ? Buffer.byteLength(arg)
        : arg instanceof Buffer
          ? arg.length
          : String(arg).length
    lens[i] = len
    total += headerLen(len) + len + 2
  }

  const out = new Uint8Array(total)
  let off = 0
  const head = `*${args.length}\r\n`
  out.set(_encoder.encode(head), 0)
  off = head.length

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const len = lens[i]
    const lh = `$${len}\r\n`
    out.set(_encoder.encode(lh), off)
    off += lh.length
    if (typeof arg === 'string') {
      out.set(_encoder.encode(arg), off)
    } else if (arg instanceof Buffer) {
      out.set(arg, off) // 原始字节直写，不经过字符串
    } else {
      out.set(_encoder.encode(String(arg)), off)
    }
    off += len
    out[off] = 13
    out[off + 1] = 10
    off += 2
  }
  return out
}

/** RESP header 的字节长：`*N\r\n` / `$N\r\n` */
function headerLen(n: number): number {
  if (n < 10) return 4
  if (n < 100) return 5
  if (n < 1000) return 6
  if (n < 10000) return 7
  return 8
}

/** 从完整 buffer 解析单个 RESP 值（非增量——单消息场景，解码为 string 语义） */
export function parseReply(data: Uint8Array): RespValue {
  const parser = new RespParser()
  const result = parser.push(data)
  if (result.incomplete) throw new IncompleteError()
  return decodeValue(result.value, true)
}

/** 增量 RESP 解析器：零拷贝（buffer + offset 指针），喂入任意分片 */
const _decoder = new TextDecoder()
const _encoder = new TextEncoder()

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
        return this.readInt()
      }
      case '$': {
        const len = this.readInt()
        if (len === -1) return null
        return this.readBulkBytes(len)
      }
      case '*': {
        const count = this.readInt()
        if (count === -1) return null
        const items: RespValue[] = []
        for (let i = 0; i < count; i++) items.push(this.parseValue())
        return items
      }
      default:
        throw new DbError('protocol', `unknown RESP type byte: ${type}`, { code: 'RESP' })
    }
  }

  /**
   * 读整数（: 或 $ 长度）：扫描数字字符边算值，直到 \r\n（手动解析，免 parseInt + 字符串）。
   * 支持负号（-1）。未读到终止符抛 IncompleteError（push 回滚）。
   */
  private readInt(): number {
    const buf = this.buf
    let i = this.off
    let neg = false
    if (i < buf.length && buf[i] === 45) {
      neg = true
      i++
    }
    let n = 0
    while (i < buf.length && buf[i] >= 48 && buf[i] <= 57) {
      n = n * 10 + (buf[i] - 48)
      i++
    }
    if (i + 1 < buf.length && buf[i] === 13 && buf[i + 1] === 10) {
      this.off = i + 2
      return neg ? -n : n
    }
    throw new IncompleteError()
  }

  /** 读一行（到 \r\n），返回行内容（不含 type 字节与 \r\n），并推进 off */
  private readLine(): string {
    const idx = indexOfCRLF(this.buf, this.off)
    if (idx === -1) throw new IncompleteError()
    const line = _decoder.decode(this.buf.subarray(this.off, idx))
    this.off = idx + 2
    return line
  }

  /** 读 len 字节的 bulk 内容 + \r\n（字节中立——不 decode，由调用方决定 string/Buffer） */
  private readBulkBytes(len: number): Uint8Array {
    if (this.buf.length - this.off < len + 2) throw new IncompleteError()
    const value = this.buf.subarray(this.off, this.off + len)
    this.off += len + 2
    return value
  }
}

function indexOfCRLF(buf: Uint8Array, from = 0): number {
  // 原生 indexOf(13) 定位 \r，再验证下一字节为 \n——比逐字节扫描快
  let i = buf.indexOf(13, from)
  while (i !== -1) {
    if (i + 1 < buf.length && buf[i + 1] === 10) return i
    i = buf.indexOf(13, i + 1)
  }
  return -1
}
