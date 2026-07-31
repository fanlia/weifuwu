import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { encodeCommand, parseReply, RespError } from './resp.ts'

function buf(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

describe('resp encode', () => {
  it('encodes SET command as RESP array', () => {
    const out = encodeCommand(['SET', 'k', 'v'])
    assert.deepEqual(out, buf('*3\r\n$3\r\nSET\r\n$1\r\nk\r\n$1\r\nv\r\n'))
  })

  it('encodes empty command args', () => {
    const out = encodeCommand(['PING'])
    assert.deepEqual(out, buf('*1\r\n$4\r\nPING\r\n'))
  })

  it('encodes multi-word args (EXPIRE with ttl)', () => {
    const out = encodeCommand(['EXPIRE', 'k', '3600'])
    assert.deepEqual(out, buf('*3\r\n$6\r\nEXPIRE\r\n$1\r\nk\r\n$4\r\n3600\r\n'))
  })
})

describe('resp decode', () => {
  it('parses simple string +OK', () => {
    assert.equal(parseReply(buf('+OK\r\n')), 'OK')
  })

  it('parses integer :42', () => {
    assert.equal(parseReply(buf(':42\r\n')), 42)
  })

  it('parses bulk string', () => {
    assert.equal(parseReply(buf('$5\r\nhello\r\n')), 'hello')
  })

  it('parses null bulk string ($-1)', () => {
    assert.equal(parseReply(buf('$-1\r\n')), null)
  })

  it('parses array of bulk strings', () => {
    assert.deepEqual(parseReply(buf('*2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n')), ['foo', 'bar'])
  })

  it('parses null array (*-1)', () => {
    assert.equal(parseReply(buf('*-1\r\n')), null)
  })

  it('parses nested arrays', () => {
    assert.deepEqual(parseReply(buf('*2\r\n*1\r\n:1\r\n*2\r\n$1\r\na\r\n$1\r\nb\r\n')), [[1], ['a', 'b']])
  })

  it('throws RespError on error reply', () => {
    assert.throws(() => parseReply(buf('-ERR wrong type\r\n')), (e: unknown) => {
      return e instanceof RespError && e.message === 'ERR wrong type'
    })
  })

  it('throws on truncated data (streaming boundary)', () => {
    assert.throws(() => parseReply(buf('*2\r\n$3\r\nfoo')), /incomplete/i)
  })

  it('throws on unknown type byte', () => {
    assert.throws(() => parseReply(buf('?foo\r\n')), /unknown/i)
  })
})
