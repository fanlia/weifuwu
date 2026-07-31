/**
 * weifuwu/db/postgres — PostgreSQL v3 协议消息编解码
 *
 * 消息帧: type(1) + length(4, 含自身) + payload
 * StartupMessage 特殊: length(4) + version(4) + 参数(键\0值\0...\0)
 *
 * 响应解析辅助: authCode / parseRowDescription / parseDataRow / readyStatus / parseErrorFields
 */

/** 客户端消息类型 */
export type ClientMessageType = 'Q' | 'P' | 'B' | 'E' | 'S' | 'X' | 'p' | 'd' | 'H' | 'C' | 'D' | 'c' | 'f'

/** 解析后的消息 */
export interface Message {
  type: string
  payload: Uint8Array
}

/** 编码消息帧: type + length(4) + payload */
export function encodeMessage(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(1 + 4 + payload.length)
  out[0] = type.charCodeAt(0)
  const len = 4 + payload.length
  out[1] = (len >> 24) & 0xff
  out[2] = (len >> 16) & 0xff
  out[3] = (len >> 8) & 0xff
  out[4] = len & 0xff
  out.set(payload, 5)
  return out
}

/** StartupMessage: length(4) + version(4=196608) + 参数键值对 + \0 */
export function startupMessage(params: Record<string, string>): Uint8Array {
  const body: number[] = []
  // version 3.0 = 196608
  body.push(0, 3, 0, 0) // protocol 3.0: major(2) minor(2) = 0x00030000 = 196608
  for (const [k, v] of Object.entries(params)) {
    for (const c of utf8(k)) body.push(c)
    body.push(0)
    for (const c of utf8(v)) body.push(c)
    body.push(0)
  }
  body.push(0) // 终止
  const out = new Uint8Array(4 + body.length)
  const len = 4 + body.length
  out[0] = (len >> 24) & 0xff
  out[1] = (len >> 16) & 0xff
  out[2] = (len >> 8) & 0xff
  out[3] = len & 0xff
  out.set(body, 4)
  return out
}

/** 简单查询消息: Q + SQL + \0 终止符 */
export function queryMessage(sql: string): Uint8Array {
  return encodeMessage('Q', concat(utf8(sql), new Uint8Array([0])))
}

/** Parse: P + statementName\0 + query\0 + paramTypeCount(2) + OIDs */
export function parseMessage(name: string, sql: string, paramTypes: number[] = []): Uint8Array {
  const body = concat(utf8(name), new Uint8Array([0]), utf8(sql), new Uint8Array([0]))
  const types = new Uint8Array(2 + paramTypes.length * 4)
  types[0] = (paramTypes.length >> 8) & 0xff
  types[1] = paramTypes.length & 0xff
  paramTypes.forEach((oid, i) => {
    const off = 2 + i * 4
    types[off] = (oid >> 24) & 0xff
    types[off + 1] = (oid >> 16) & 0xff
    types[off + 2] = (oid >> 8) & 0xff
    types[off + 3] = oid & 0xff
  })
  return encodeMessage('P', concat(body, types))
}

/** Bind: B + portal\0 + statement\0 + fmtCount + formats + paramCount + params + resultFmtCount */
export function bindMessage(
  statement: string,
  params: (string | Uint8Array | null)[],
  paramFormats: number[] = [],
): Uint8Array {
  const body: number[] = [...utf8(''), 0, ...utf8(statement), 0]
  // 参数格式（全部 text=0 或指定）
  body.push(0, paramFormats.length)
  for (const f of paramFormats) {
    body.push((f >> 8) & 0xff, f & 0xff)
  }
  // 参数数量
  body.push(0, params.length)
  for (const p of params) {
    if (p === null) {
      body.push(255, 255, 255, 255)
    } else {
      const bytes = typeof p === 'string' ? utf8(p) : p
      body.push((bytes.length >> 24) & 0xff, (bytes.length >> 16) & 0xff, (bytes.length >> 8) & 0xff, bytes.length & 0xff)
      for (const b of bytes) body.push(b)
    }
  }
  // 结果格式（text）
  body.push(0, 0)
  return encodeMessage('B', new Uint8Array(body))
}

/** Execute: E + portal\0 + maxRows(4) */
export function executeMessage(portal = '', maxRows = 0): Uint8Array {
  const body = new Uint8Array(portal.length + 1 + 4)
  body.set(utf8(portal), 0)
  body[portal.length] = 0
  const off = portal.length + 1
  body[off] = (maxRows >> 24) & 0xff
  body[off + 1] = (maxRows >> 16) & 0xff
  body[off + 2] = (maxRows >> 8) & 0xff
  body[off + 3] = maxRows & 0xff
  return encodeMessage('E', body)
}

/** Sync / Terminate / PasswordMessage */
export function syncMessage(): Uint8Array {
  return encodeMessage('S', new Uint8Array(0))
}

/** Flush: 强制服务器处理已缓冲的扩展查询消息（Parse/Bind/Execute 需 Flush 或 Sync 才执行） */
export function flushMessage(): Uint8Array {
  return encodeMessage('H', new Uint8Array(0))
}

/** Describe: D + 目标类型(S/P) + name\0——服务器返回 ParameterDescription(t) / RowDescription(T) */
export function describeMessage(kind: 'S' | 'P', name = ''): Uint8Array {
  return encodeMessage('D', concat(utf8(kind), utf8(name), new Uint8Array([0])))
}

export function terminateMessage(): Uint8Array {
  return encodeMessage('X', new Uint8Array(0))
}

export function passwordMessage(password: string): Uint8Array {
  return encodeMessage('p', utf8(password))
}

/** 增量消息流解析：零拷贝（buffer + offset 指针），喂入任意分片 */
export class MessageStream {
  private buf: Uint8Array = new Uint8Array(0)
  private off = 0

  push(chunk: Uint8Array): Message[] {
    this.append(chunk)
    const out: Message[] = []
    while (true) {
      const saved = this.off
      const msg = this.tryRead()
      if (!msg) {
        this.off = saved
        break
      }
      out.push(msg)
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

  private compact() {
    if (this.off === this.buf.length) {
      this.buf = new Uint8Array(0)
      this.off = 0
    } else if (this.off > 0) {
      this.buf = this.buf.subarray(this.off)
      this.off = 0
    }
  }

  /** 尝试读一条完整消息；不完整返回 null（不消费） */
  private tryRead(): Message | null {
    if (this.buf.length - this.off < 5) return null
    const len =
      (this.buf[this.off + 1] << 24) | (this.buf[this.off + 2] << 16) | (this.buf[this.off + 3] << 8) | this.buf[this.off + 4]
    if (this.buf.length - this.off < 1 + len) return null
    const type = String.fromCharCode(this.buf[this.off])
    const payload = this.buf.subarray(this.off + 5, this.off + 1 + len)
    this.off += 1 + len
    return { type, payload }
  }
}

/** 便捷：解析 buffer 中所有完整消息 */
export function parseMessageStream(data: Uint8Array): Message[] {
  return new MessageStream().push(data)
}

// ── 响应解析辅助 ──────────────────────────────

/** Authentication (R) 的认证码 */
export function authCode(msg: Message): number {
  if (msg.type !== 'R' || msg.payload.length < 4) return -1
  return (
    (msg.payload[0] << 24) | (msg.payload[1] << 16) | (msg.payload[2] << 8) | msg.payload[3]
  )
}

export interface ColumnInfo {
  name: string
  typeOid: number
  typeLen: number
}

/** RowDescription (T): 列信息 */
export function parseRowDescription(payload: Uint8Array): ColumnInfo[] {
  const count = (payload[0] << 8) | payload[1]
  const cols: ColumnInfo[] = []
  let i = 2
  for (let c = 0; c < count; c++) {
    // name\0
    let j = i
    while (payload[j] !== 0) j++
    const name = new TextDecoder().decode(payload.subarray(i, j))
    i = j + 1
    // tableOID(4) + attrNum(2)
    i += 6
    // typeOID(4)
    const typeOid =
      (payload[i] << 24) | (payload[i + 1] << 16) | (payload[i + 2] << 8) | payload[i + 3]
    i += 4
    // typeLen(2)
    const typeLen = (payload[i] << 8) | payload[i + 1]
    i += 2
    // typeMod(4) + format(2)
    i += 6
    cols.push({ name, typeOid, typeLen })
  }
  return cols
}

/** DataRow (D): 值列表（null 为 null，其余为文本字节） */
export function parseDataRow(payload: Uint8Array): (string | null)[] {
  const count = (payload[0] << 8) | payload[1]
  const values: (string | null)[] = []
  let i = 2
  for (let c = 0; c < count; c++) {
    const len =
      (payload[i] << 24) | (payload[i + 1] << 16) | (payload[i + 2] << 8) | payload[i + 3]
    i += 4
    if (len === -1) {
      values.push(null)
    } else {
      values.push(new TextDecoder().decode(payload.subarray(i, i + len)))
      i += len
    }
  }
  return values
}

/** ReadyForQuery (Z) 状态 */
export function readyStatus(payload: Uint8Array): 'idle' | 'tx' | 'error' {
  const s = String.fromCharCode(payload[0])
  return s === 'T' ? 'tx' : s === 'E' ? 'error' : 'idle'
}

export interface ErrorFields {
  severity?: string
  code?: string
  message?: string
  detail?: string
  hint?: string
  position?: string
}

/** ErrorResponse (E) 字段 */
export function parseErrorFields(payload: Uint8Array): ErrorFields {
  const out: ErrorFields = {}
  let i = 0
  while (i < payload.length && payload[i] !== 0) {
    const type = String.fromCharCode(payload[i])
    let j = i + 1
    while (j < payload.length && payload[j] !== 0) j++
    const value = new TextDecoder().decode(payload.subarray(i + 1, j))
    switch (type) {
      case 'S':
        out.severity = value
        break
      case 'C':
        out.code = value
        break
      case 'M':
        out.message = value
        break
      case 'D':
        out.detail = value
        break
      case 'H':
        out.hint = value
        break
      case 'P':
        out.position = value
        break
    }
    i = j + 1
  }
  return out
}

// ── 工具 ──────────────────────────────────────

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  let total = 0
  for (const p of parts) total += p.length
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}
