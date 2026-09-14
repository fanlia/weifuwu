/**
 * RFC6455 帧编解码（W5 自研——诚实裁剪：无扩展/无压缩）
 *
 * 解析层校验（RFC §5.2——错误码 = 关闭码）：
 * - RSV≠0 → 1002（无扩展协商）
 * - opcode ∉ {CONT,TEXT,BINARY,CLOSE,PING,PONG} → 1002
 * - 客户端帧未掩码 → 1002（RFC 要求 fail）
 * - 控制帧：FIN 必须 1、载荷 ≤125 → 1002
 * - 长度非最小编码（126 指示但 <126 / 127 指示但 ≤0xffff）→ 1002
 * - 64 位长度最高位 =1 → 1002；超 maxFrame → 1009（message too big）
 *
 * 状态层校验（分片序列/UTF-8/关闭码）在 connection.ts。
 */
export const OP = { CONT: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa } as const

export interface Frame {
  fin: boolean
  opcode: number
  payload: Buffer
}

export interface FrameError {
  code: number
  reason: string
}

export interface DecodeResult {
  frames: Frame[]
  rest: Buffer
  error?: FrameError
}

const EMPTY = Buffer.alloc(0)

/** 编码帧（mask=true 时生成客户端帧——测试/对账用；服务端默认不掩码） */
export function encodeFrame(opcode: number, payload: Buffer | string = EMPTY, opts: { fin?: boolean; mask?: boolean } = {}): Buffer {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8')
  const fin = opts.fin !== false
  const mask = opts.mask === true
  const len = body.length
  let header: Buffer
  if (len < 126) {
    header = Buffer.allocUnsafe(2)
    header[1] = len
  } else if (len < 65536) {
    header = Buffer.allocUnsafe(4)
    header[1] = 126
    header.writeUInt16BE(len, 2)
  } else {
    header = Buffer.allocUnsafe(10)
    header[1] = 127
    header.writeUInt32BE(Math.floor(len / 2 ** 32), 2)
    header.writeUInt32BE(len >>> 0, 6)
  }
  header[0] = (fin ? 0x80 : 0) | (opcode & 0x0f)
  if (!mask) return Buffer.concat([header, body])
  header[1] |= 0x80
  const key = Buffer.allocUnsafe(4)
  for (let i = 0; i < 4; i++) key[i] = (Math.random() * 256) | 0
  const masked = Buffer.allocUnsafe(len)
  for (let i = 0; i < len; i++) masked[i] = body[i] ^ key[i & 3]
  return Buffer.concat([header, key, masked])
}

/** 增量解码（可任意分片喂入——返回完整帧 + 未消费余量）；expectMask=false 供测试读服务端帧 */
export function decodeFrames(buf: Buffer, maxFrame = 100 * 1024 * 1024, expectMask = true): DecodeResult {
  const frames: Frame[] = []
  let offset = 0
  const fail = (code: number, reason: string): DecodeResult => ({ frames, rest: buf.slice(offset), error: { code, reason } })

  for (;;) {
    if (buf.length - offset < 2) break
    const b0 = buf[offset]
    const b1 = buf[offset + 1]
    const fin = (b0 & 0x80) !== 0
    const rsv = b0 & 0x70
    const opcode = b0 & 0x0f
    const masked = (b1 & 0x80) !== 0
    let len = b1 & 0x7f

    if (rsv !== 0) return fail(1002, 'RSV must be 0')
    if (opcode > 0x0a || (opcode > 0x02 && opcode < 0x08)) return fail(1002, `invalid opcode ${opcode}`)
    if (expectMask && !masked) return fail(1002, 'client frame must be masked')
    if (opcode >= 0x08) {
      if (!fin) return fail(1002, 'control frame must not be fragmented')
      if (len > 125) return fail(1002, 'control frame payload > 125')
    }

    let headerLen = 2
    if (len === 126) {
      if (buf.length - offset < 4) break
      len = buf.readUInt16BE(offset + 2)
      if (len < 126) return fail(1002, 'non-minimal length encoding')
      headerLen = 4
    } else if (len === 127) {
      if (buf.length - offset < 10) break
      const hi = buf.readUInt32BE(offset + 2)
      const lo = buf.readUInt32BE(offset + 6)
      if (hi & 0x80000000) return fail(1002, 'length high bit must be 0')
      const val = hi * 2 ** 32 + lo
      if (val <= 0xffff) return fail(1002, 'non-minimal length encoding')
      len = val
      headerLen = 10
    }
    if (len > maxFrame) return fail(1009, `frame payload ${len} exceeds maxPayload ${maxFrame}`)
    const need = headerLen + (masked ? 4 : 0) + len
    if (buf.length - offset < need) break

    if (masked) {
      const key = buf.slice(offset + headerLen, offset + headerLen + 4)
      const payload = Buffer.allocUnsafe(len)
      for (let i = 0; i < len; i++) payload[i] = buf[offset + headerLen + 4 + i] ^ key[i & 3]
      frames.push({ fin, opcode, payload })
    } else {
      frames.push({ fin, opcode, payload: Buffer.from(buf.subarray(offset + headerLen, offset + headerLen + len)) })
    }
    offset += need
  }
  return { frames, rest: buf.slice(offset) }
}
