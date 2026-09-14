/**
 * RFC6455 帧编解码契约（W5——纯函数矩阵）
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { decodeFrames, encodeFrame, OP } from './frame.ts'

const MAX = 100 * 1024 * 1024

/** 手工构造未掩码客户端帧（绕过 encodeFrame 的合法性——测解析校验） */
function rawFrame(opcode: number, payload: Buffer, opts: { fin?: boolean; rsv?: number; mask?: Buffer } = {}): Buffer {
  const mask = opts.mask
  const len = payload.length
  const head = Buffer.alloc(2 + (len >= 126 ? (len < 65536 ? 2 : 8) : 0) + (mask ? 4 : 0))
  let o = 2
  head[0] = (opts.fin === false ? 0 : 0x80) | (opts.rsv ?? 0) | opcode
  if (len < 126) head[1] = len
  else if (len < 65536) {
    head[1] = 126
    head.writeUInt16BE(len, o)
    o += 2
  } else {
    head[1] = 127
    head.writeUInt32BE(0, o)
    head.writeUInt32BE(len, o + 4)
    o += 8
  }
  if (mask) {
    head[1] |= 0x80
    mask.copy(head, o)
    return Buffer.concat([head, payload.map((b, i) => b ^ mask[i & 3])])
  }
  return Buffer.concat([head, payload])
}

describe('RFC6455 帧编解码', () => {
  it('往返矩阵——长度档 0/1/125/126/127/65535/65536/1MB × 掩码双态', () => {
    for (const len of [0, 1, 125, 126, 127, 65535, 65536, 1024 * 1024]) {
      const payload = Buffer.alloc(len, 0x61)
      for (const mask of [false, true]) {
        const wire = encodeFrame(OP.BINARY, payload, { mask })
        const { frames, rest, error } = decodeFrames(wire, MAX, mask)
        assert.equal(error, undefined, `len=${len} mask=${mask}`)
        assert.equal(rest.length, 0)
        assert.equal(frames.length, 1)
        assert.equal(frames[0].opcode, OP.BINARY)
        assert.equal(frames[0].fin, true)
        assert.deepEqual(frames[0].payload, payload)
      }
    }
  })

  it('逐字节喂入——增量解码（单字节边界不产出半帧）', () => {
    const payload = Buffer.from('hello-世界'.repeat(20))
    const wire = encodeFrame(OP.TEXT, payload, { mask: true })
    let buf: Buffer = Buffer.alloc(0)
    const out: number[] = []
    for (const byte of wire) {
      buf = Buffer.concat([buf, Buffer.from([byte])])
      const { frames, rest, error } = decodeFrames(buf, MAX, true)
      assert.equal(error, undefined)
      buf = rest
      out.push(...frames.map((f) => f.payload.length))
    }
    assert.deepEqual(out, [payload.length])
    assert.equal(buf.length, 0)
  })

  it('多帧粘连——一次解码产出全部完整帧并保留余量', () => {
    const a = encodeFrame(OP.TEXT, 'a', { mask: true })
    const b = encodeFrame(OP.TEXT, 'b', { mask: true })
    const partial = encodeFrame(OP.TEXT, 'c'.repeat(10), { mask: true }).subarray(0, 4)
    const { frames, rest, error } = decodeFrames(Buffer.concat([a, b, partial]), MAX, true)
    assert.equal(error, undefined)
    assert.deepEqual(frames.map((f) => f.payload.toString()), ['a', 'b'])
    assert.equal(rest.length, 4)
  })

  it('错误矩阵——RSV/非法 opcode/未掩码/控制帧/非最小编码/高位/超限', () => {
    const mask4 = Buffer.from([1, 2, 3, 4])
    const maskedOf = (payload: Buffer) => Buffer.from(payload.map((b, i) => b ^ mask4[i & 3]))
    const nonMinimal16 = Buffer.concat([Buffer.from([0x81, 0x80 | 126, 0, 5]), mask4, maskedOf(Buffer.alloc(5, 0x61))])
    const nonMinimal64 = Buffer.concat([
      Buffer.from([0x81, 0x80 | 127, 0, 0, 0, 0, 0, 0, 0, 126]),
      mask4,
      maskedOf(Buffer.alloc(126, 0x61)),
    ])
    const cases: Array<[string, Buffer, number]> = [
      ['RSV1 置位', rawFrame(OP.TEXT, Buffer.from('x'), { rsv: 0x40, mask: mask4 }), 1002],
      ['非法 opcode 0x3', rawFrame(0x3, Buffer.alloc(0), { mask: mask4 }), 1002],
      ['未掩码客户端帧', rawFrame(OP.TEXT, Buffer.from('x')), 1002],
      ['控制帧分片', rawFrame(OP.PING, Buffer.from('x'), { fin: false, mask: mask4 }), 1002],
      ['控制帧载荷 126', rawFrame(OP.PING, Buffer.alloc(126), { mask: mask4 }), 1002],
      ['16 位非最小编码（len=5）', nonMinimal16, 1002],
      ['64 位非最小编码（len=126）', nonMinimal64, 1002],
    ]
    for (const [name, wire, code] of cases) {
      const { error } = decodeFrames(wire, MAX, true)
      assert.equal(error?.code, code, name)
    }
    // 64 位长度最高位 = 1
    const hiBit = Buffer.from([0x82, 0xff, 0x80, 0, 0, 0, 0, 0, 0, 1, 1, 2, 3, 4, 0])
    assert.equal(decodeFrames(hiBit, MAX, true).error?.code, 1002)
    // 超 maxFrame → 1009
    const big = encodeFrame(OP.BINARY, Buffer.alloc(200), { mask: true })
    assert.equal(decodeFrames(big, 100, true).error?.code, 1009)
  })

  it('不完整帧——无错误无产出（余量待续）', () => {
    const wire = encodeFrame(OP.TEXT, 'hello', { mask: true })
    const { frames, rest, error } = decodeFrames(wire.subarray(0, wire.length - 1), MAX, true)
    assert.equal(error, undefined)
    assert.equal(frames.length, 0)
    assert.equal(rest.length, wire.length - 1)
  })
})
