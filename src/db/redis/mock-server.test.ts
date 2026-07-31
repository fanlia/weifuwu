import { describe, it, after, before } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { createMockRedis, type MockRedis } from './mock-server.ts'
import { encodeCommand, parseReply } from './resp.ts'

describe('mock redis server', () => {
  let mock: MockRedis
  let port: number
  let sock: net.Socket

  before(async () => {
    mock = createMockRedis({
      commands: {
        PING: () => 'PONG',
        ECHO: (args) => args[0] ?? '',
        GET: (args) => (args[0] === 'missing' ? null : `value:${args[0]}`),
        FAIL: () => {
          throw new Error('simulated failure')
        },
      },
    })
    port = await mock.listen(0)
    sock = net.connect(port)
    await new Promise((r) => sock.once('connect', r))
  })

  after(async () => {
    sock.destroy()
    await mock.close()
  })

  function send(args: (string | number)[]): Promise<string | number | null | undefined> {
    return new Promise((resolve, reject) => {
      const onData = (data: Buffer) => {
        try {
          const v = parseReply(new Uint8Array(data))
          sock.off('data', onData)
          resolve(v as string | number | null)
        } catch (e) {
          sock.off('data', onData)
          reject(e)
        }
      }
      sock.on('data', onData)
      sock.write(Buffer.from(encodeCommand(args)))
    })
  }

  it('responds PING → PONG over real TCP', async () => {
    assert.equal(await send(['PING']), 'PONG')
  })

  it('responds ECHO with args', async () => {
    assert.equal(await send(['ECHO', 'hello']), 'hello')
  })

  it('responds null for missing keys', async () => {
    assert.equal(await send(['GET', 'missing']), null)
  })

  it('propagates configured values', async () => {
    assert.equal(await send(['GET', 'deck:1']), 'value:deck:1')
  })

  it('returns Redis-style error for handler throw', async () => {
    await assert.rejects(() => send(['FAIL']), /simulated failure/)
  })
})
