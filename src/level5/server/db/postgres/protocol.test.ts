import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  encodeMessage,
  startupMessage,
  queryMessage,
  parseMessage,
  bindMessage,
  executeMessage,
  parseMessageStream,
  MessageStream,
  type Message,
  authCode,
  parseRowDescription,
  parseDataRow,
  readyStatus,
  parseErrorFields,
} from './protocol.ts'

function buf(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

describe('pg protocol encode', () => {
  it('encodes a Query message frame', () => {
    // type 'Q' + length(4) + payload ('SELECT 1' = 8 字节 + \0 终止 = 9, 4+9=13)
    const out = queryMessage('SELECT 1')
    const expected = new Uint8Array([0x51, 0, 0, 0, 13, ...buf('SELECT 1'), 0])
    assert.deepEqual(out, expected)
  })

  it('encodes generic message frame with type + length', () => {
    const out = encodeMessage('S', new Uint8Array(0))
    // Sync: 'S' + length 4
    assert.deepEqual(out, new Uint8Array([0x53, 0, 0, 0, 4]))
  })

  it('encodes startup message with user/database', () => {
    const out = startupMessage({ user: 'root', database: 'demo' })
    // length(4) + version 196608 + "user\0root\0database\0demo\0\0"
    const ver = 196608
    const expected = new Uint8Array([
      0, 0, 0, 0, // length placeholder (patched below)
      0, 3, 0, 0, // version 3.0: major(2) minor(2) = 196608
      ...buf('user'), 0, ...buf('root'), 0,
      ...buf('database'), 0, ...buf('demo'), 0,
      0, // terminator
    ])
    expected[0] = 0
    expected[1] = 0
    expected[2] = 0
    expected[3] = expected.length
    assert.deepEqual(out, expected)
  })
})

describe('pg protocol decode (MessageStream)', () => {
  it('parses a single message', () => {
    const stream = new MessageStream()
    const msgs = stream.push(encodeMessage('Z', new Uint8Array([0x49]))) // ReadyForQuery idle
    assert.equal(msgs.length, 1)
    assert.equal(msgs[0].type, 'Z')
    assert.deepEqual(msgs[0].payload, new Uint8Array([0x49]))
  })

  it('parses multiple messages in one chunk', () => {
    const stream = new MessageStream()
    const msgs = stream.push(
      concatBytes(
        encodeMessage('Z', new Uint8Array([0x49])),
        encodeMessage('C', buf('SELECT 1')),
      ),
    )
    assert.equal(msgs.length, 2)
    assert.equal(msgs[0].type, 'Z')
    assert.equal(msgs[1].type, 'C')
  })

  it('accumulates partial messages across chunks', () => {
    const stream = new MessageStream()
    const full = encodeMessage('C', buf('SELECT 1'))
    // 拆成两半喂入
    const half = Math.floor(full.length / 2)
    const m1 = stream.push(full.subarray(0, half))
    assert.equal(m1.length, 0)
    const m2 = stream.push(full.subarray(half))
    assert.equal(m2.length, 1)
    assert.equal(m2[0].type, 'C')
  })

  it('parseMessageStream returns all messages', () => {
    const msgs = parseMessageStream(
      concatBytes(encodeMessage('Z', new Uint8Array([0x49])), encodeMessage('S', new Uint8Array())),
    )
    assert.deepEqual(msgs.map((m) => m.type), ['Z', 'S'])
  })
})

describe('pg response parsing', () => {
  it('extracts auth code from Authentication message', () => {
    // R + length + code (0=OK)
    const payload = new Uint8Array([0, 0, 0, 0])
    assert.equal(authCode({ type: 'R', payload }), 0)
    // SASL: code 10
    const payload10 = new Uint8Array([0, 0, 0, 10])
    assert.equal(authCode({ type: 'R', payload: payload10 }), 10)
  })

  it('parses RowDescription columns', () => {
    // 列1: id int4 (OID 23)
    const id = [
      ...buf('id'), 0, // name
      0, 0, 0, 0, // tableOID
      0, 1, // attrNum
      0, 0, 0, 23, // typeOID int4
      0, 4, // typeLen
      0, 0, 0, 0, // typeMod
      0, 0, // format
    ]
    // 列2: name text (OID 25)
    const name = [
      ...buf('name'), 0,
      0, 0, 0, 0,
      0, 2,
      0, 0, 0, 25, // typeOID text
      255, 255, // typeLen -1
      0, 0, 0, 0,
      0, 0,
    ]
    const p = new Uint8Array([0, 2, ...id, ...name])
    const cols = parseRowDescription(p)
    assert.equal(cols.length, 2)
    assert.equal(cols[0].name, 'id')
    assert.equal(cols[0].typeOid, 23)
    assert.equal(cols[1].name, 'name')
    assert.equal(cols[1].typeOid, 25)
  })

  it('parses DataRow values', () => {
    // D: count(2) + for each: len(4) + bytes
    const p = new Uint8Array([
      0, 2,
      0, 0, 0, 1, 0x31, // "1"
      0, 0, 0, 4, 0x74, 0x65, 0x73, 0x74, // "test"
    ])
    assert.deepEqual(parseDataRow(p), ['1', 'test'])
  })

  it('parses DataRow with null values', () => {
    const p = new Uint8Array([0, 1, 255, 255, 255, 255])
    assert.deepEqual(parseDataRow(p), [null])
  })

  it('extracts ReadyForQuery status', () => {
    assert.equal(readyStatus(new Uint8Array([0x49])), 'idle') // I
    assert.equal(readyStatus(new Uint8Array([0x54])), 'tx') // T
    assert.equal(readyStatus(new Uint8Array([0x45])), 'error') // E
  })

  it('parses ErrorResponse fields', () => {
    // E: field type + content + \0 ... final \0
    const p = new Uint8Array([
      0x53, ...buf('ERROR'), 0, // S severity
      0x43, ...buf('23505'), 0, // C code
      0x4d, ...buf('duplicate key'), 0, // M message
      0, // terminator
    ])
    const fields = parseErrorFields(p)
    assert.equal(fields.severity, 'ERROR')
    assert.equal(fields.code, '23505')
    assert.equal(fields.message, 'duplicate key')
  })
})

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

describe('pg extended query encode', () => {
  it('encodes Parse message', () => {
    // P + name\0 + sql\0 + Int16 count + Int32 OIDs
    const out = parseMessage('', 'SELECT $1::int', [0])
    // 'SELECT $1::int' = 14 字节: name(1) + sql(14) + \0(1) + count(2) + OID(4) = 22 payload
    const expected = new Uint8Array([
      0x50,
      0, 0, 0, 26, // len = 4 + 22 = 26
      0, // name empty
      ...buf('SELECT $1::int'), 0,
      0, 1, // count = 1
      0, 0, 0, 0, // OID 0
    ])
    assert.deepEqual(out, expected)
  })

  it('encodes Bind message with text params', () => {
    // B + portal\0 + statement\0 + fmtCount(2) + paramCount(2) + len(4)+val ...
    const out = bindMessage('', ['42'])
    // payload: portal(1) + stmt(1) + fmtCount(2) + count(2) + len(4)+val(2) + resultFmt(2) = 14
    const expected = new Uint8Array([
      0x42,
      0, 0, 0, 18, // len = 4 + 14 = 18
      0, // portal
      0, // statement
      0, 0, // fmtCount 0
      0, 1, // paramCount 1
      0, 0, 0, 2, 0x34, 0x32, // len=2 + "42"
      0, 0, // resultFmtCount 0
    ])
    assert.deepEqual(out, expected)
  })

  it('encodes Bind with 256KB param byte-exact (no O(n²) number[] accumulation)', () => {
    const big = 'x'.repeat(256 * 1024)
    const out = bindMessage('', [big])
    // payload: portal\0 + stmt\0 + fmtCount(2) + paramCount(2) + len(4) + content + resultFmt(2)
    const payload = out.subarray(5)
    const paramLen =
      (payload[6] << 24) | (payload[7] << 16) | (payload[8] << 8) | payload[9]
    assert.equal(paramLen, big.length)
    assert.equal(new TextDecoder().decode(payload.subarray(10, 10 + paramLen)), big)
  })

  it('encodes Bind with null params preserved', () => {
    const out = bindMessage('', ['a', null, 'b'])
    // 中间 null 参数：len = -1 (0xffffffff)
    const payload = out.subarray(5)
    // paramCount 在 fmtCount(2) + count(2) 后: payload[2..5]
    assert.equal((payload[4] << 8) | payload[5], 3)
    // 第一个参数 len=1 'a'：payload[6..9]=len, [10]='a'
    assert.equal((payload[6] << 24) | (payload[7] << 16) | (payload[8] << 8) | payload[9], 1)
    assert.equal(payload[10], 0x61)
    // null：4 字节 0xff
    assert.equal(payload[11], 0xff)
    assert.equal(payload[12], 0xff)
    assert.equal(payload[13], 0xff)
    assert.equal(payload[14], 0xff)
    // 'b'
    assert.equal((payload[15] << 24) | (payload[16] << 16) | (payload[17] << 8) | payload[18], 1)
    assert.equal(payload[19], 0x62)
  })

  it('encodes Execute message', () => {
    const out = executeMessage()
    // E + len + portal\0 + maxRows(4)
    assert.deepEqual(out, new Uint8Array([0x45, 0, 0, 0, 9, 0, 0, 0, 0, 0]))
  })
})
