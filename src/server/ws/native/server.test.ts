/**
 * RFC6455 服务端集成契约（W5——真实 TCP + 原始帧客户端）
 *
 * 覆盖：握手（Accept/版本）· 长度档回显 · 分片+控制帧插入 · 关闭握手/回显 ·
 * 协议错误矩阵（1002/1007/1009）· maxPayload · 停机 1001 · 任意字节边界喂入。
 */
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { connect } from 'node:net'
import { Router } from '../../../core/l1/server/router.ts'
import { serve, type Server } from '../../../core/l1/server/serve.ts'
import { createNativeWsAdapter, type NativeWsOptions } from './index.ts'
import { rawWsConnect, OP, encodeFrame, type RawWs } from '../../../test/helpers/raw-ws-client.ts'

const servers: Server[] = []
afterEach(async () => {
  for (const s of servers.splice(0)) await s.stop().catch(() => {})
})

async function startNative(opts?: NativeWsOptions): Promise<Server> {
  const app = new Router()
  app.ws('/ws', {
    open: (ws) => ws.send('open'),
    message: (ws, _ctx, data) => ws.send(data),
  })
  const server = serve(app, { port: 0, wsAdapter: () => createNativeWsAdapter(opts) })
  await server.ready
  servers.push(server)
  return server
}

async function opened(opts?: NativeWsOptions): Promise<{ server: Server; c: RawWs }> {
  const server = await startNative(opts)
  const c = await rawWsConnect(server.port)
  await c.waitFor(() => c.frames.length >= 1) // open 欢迎帧
  return { server, c }
}

async function expectClose(server: Server, send: (c: RawWs) => void, code: number, timeoutMs = 3000): Promise<void> {
  const c = await rawWsConnect(server.port)
  send(c)
  await c.waitFor(() => c.closeFrame !== null, timeoutMs)
  assert.equal(c.closeFrame?.code, code)
  c.destroy()
}

describe('RFC6455 服务端', () => {
  it('握手——RFC 样例 Accept + open 欢迎帧', async () => {
    const server = await startNative()
    const c = await rawWsConnect(server.port, '/ws', { key: 'dGhlIHNhbXBsZSBub25jZQ==' })
    assert.equal(c.status, 101)
    assert.equal(c.headers['sec-websocket-accept'], 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=')
    assert.equal(c.headers.upgrade?.toLowerCase(), 'websocket')
    await c.waitFor(() => c.frames.length >= 1)
    assert.equal(c.frames[0].payload.toString(), 'open')
    c.destroy()
  })

  it('版本 ≠13 → 426 + Sec-WebSocket-Version: 13', async () => {
    const server = await startNative()
    const c = await rawWsConnect(server.port, '/ws', { version: '8' })
    assert.equal(c.status, 426)
    assert.equal(c.headers['sec-websocket-version'], '13')
    c.destroy()
  })

  it('缺 Sec-WebSocket-Key → 400', async () => {
    const server = await startNative()
    const socket = connect(server.port, '127.0.0.1')
    const chunks: Buffer[] = []
    socket.on('data', (d: Buffer) => chunks.push(d))
    await new Promise<void>((r) => socket.once('connect', r))
    socket.write('GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
    await new Promise<void>((r) => socket.once('close', () => r()))
    assert.match(Buffer.concat(chunks).toString(), /^HTTP\/1\.1 400 /)
  })

  it('回显矩阵——长度档 0/1/125/126/127/65535/65536（text+binary）', async () => {
    const { c } = await opened()
    const lens = [0, 1, 125, 126, 127, 65535, 65536]
    for (const n of lens) {
      c.sendFrame(OP.TEXT, 'a'.repeat(n))
      c.sendFrame(OP.BINARY, Buffer.alloc(n, 0x62))
    }
    await c.waitFor(() => c.frames.length >= 1 + lens.length * 2, 10000)
    const echoed = c.frames.slice(1)
    for (let i = 0; i < lens.length; i++) {
      assert.equal(echoed[i * 2].opcode, OP.TEXT)
      assert.equal(echoed[i * 2].payload.length, lens[i])
      assert.equal(echoed[i * 2 + 1].opcode, OP.BINARY)
      assert.equal(echoed[i * 2 + 1].payload.length, lens[i])
    }
    c.destroy()
  })

  it('分片消息 + 插入 ping——消息完整回显且 pong 先到', async () => {
    const { c } = await opened()
    c.sendFrame(OP.TEXT, 'he', { fin: false })
    c.sendFrame(OP.PING, 'p')
    c.sendFrame(OP.CONT, 'llo ', { fin: false })
    c.sendFrame(OP.CONT, '世界', { fin: true })
    await c.waitFor(() => c.frames.length >= 3)
    const [pong, echo] = c.frames.slice(1)
    assert.equal(pong.opcode, OP.PONG)
    assert.equal(pong.payload.toString(), 'p')
    assert.equal(echo.opcode, OP.TEXT)
    assert.equal(echo.payload.toString(), 'hello 世界')
    assert.equal(c.closeFrame, null)
    c.destroy()
  })

  it('关闭握手——客户端先发 4000 → 服务端回显 4000', async () => {
    const { c } = await opened()
    c.sendFrame(OP.CLOSE, Buffer.concat([Buffer.from([0x0f, 0xa0]), Buffer.from('bye')]))
    await c.waitFor(() => c.closeFrame !== null)
    assert.equal(c.closeFrame?.code, 4000)
    assert.equal(c.closeFrame?.reason, 'bye')
  })

  it('协议错误矩阵——全部 1002/1007', async () => {
    const server = await startNative()
    const mask4 = Buffer.from([1, 2, 3, 4])
    const cases: Array<[string, (c: RawWs) => void, number]> = [
      ['未掩码帧', (c) => c.write(encodeFrame(OP.TEXT, 'x', { mask: false })), 1002],
      ['RSV1', (c) => c.write(Buffer.from([0xc1, 0x81, 1, 2, 3, 4, 0x78])), 1002],
      ['非法 opcode', (c) => c.write(Buffer.from([0x83, 0x80, 1, 2, 3, 4])), 1002],
      ['CONT 无起始', (c) => c.sendFrame(OP.CONT, 'x'), 1002],
      ['分片中插入新数据帧', (c) => { c.sendFrame(OP.TEXT, 'a', { fin: false }); c.sendFrame(OP.TEXT, 'b') }, 1002],
      ['控制帧分片', (c) => c.sendFrame(OP.PING, 'x', { fin: false }), 1002],
      ['控制帧超 125', (c) => c.sendFrame(OP.PING, Buffer.alloc(126)), 1002],
      ['关闭载荷 1 字节', (c) => c.sendFrame(OP.CLOSE, Buffer.from([0x03])), 1002],
      ['关闭码 999', (c) => c.sendFrame(OP.CLOSE, Buffer.from([0x03, 0xe7])), 1002],
      ['关闭理由非法 UTF-8', (c) => c.sendFrame(OP.CLOSE, Buffer.concat([Buffer.from([0x03, 0xe8]), Buffer.from([0xff])])), 1007],
      ['文本非法 UTF-8', (c) => c.sendFrame(OP.TEXT, Buffer.from([0xff])), 1007],
      ['分片中非法 UTF-8', (c) => { c.sendFrame(OP.TEXT, Buffer.from([0xe2, 0x82]), { fin: false }); c.sendFrame(OP.CONT, Buffer.from([0x28]), { fin: true }) }, 1007],
    ]
    for (const [name, send, code] of cases) {
      await expectClose(server, send, code).catch((e) => {
        throw new Error(`${name}: ${e.message}`)
      })
    }
    void mask4
  })

  it('maxPayload——单帧超限 1009 · 跨分片累计超限 1009', async () => {
    const server = await startNative({ maxPayload: 64 })
    await expectClose(server, (c) => c.sendFrame(OP.BINARY, Buffer.alloc(65)), 1009)
    await expectClose(
      server,
      (c) => {
        c.sendFrame(OP.TEXT, 'a'.repeat(40), { fin: false })
        c.sendFrame(OP.CONT, 'b'.repeat(40), { fin: true })
      },
      1009,
    )
  })

  it('任意字节边界——64KB 帧按 7 字节分片喂入仍完整回显', async () => {
    const { c } = await opened()
    const payload = Buffer.alloc(65536, 0x63)
    const wire = encodeFrame(OP.BINARY, payload, { mask: true })
    for (let i = 0; i < wire.length; i += 7) c.write(wire.subarray(i, i + 7))
    await c.waitFor(() => c.frames.length >= 2, 10000)
    assert.equal(c.frames[1].opcode, OP.BINARY)
    assert.deepEqual(c.frames[1].payload, payload)
    c.destroy()
  })

  it('逐字节分片多字节文本——不误报 UTF-8（Autobahn 6.2.4 形态）', async () => {
    const { c } = await opened()
    const bytes = Buffer.from('κόσμε', 'utf8')
    c.sendFrame(OP.TEXT, bytes.subarray(0, 1), { fin: false })
    for (let i = 1; i < bytes.length; i++) {
      c.sendFrame(OP.CONT, bytes.subarray(i, i + 1), { fin: i === bytes.length - 1 })
    }
    await c.waitFor(() => c.frames.length >= 2)
    assert.equal(c.frames[1].opcode, OP.TEXT)
    assert.equal(c.frames[1].payload.toString(), 'κόσμε')
    assert.equal(c.closeFrame, null)
    c.destroy()
  })

  it('fail-fast——首片合法前缀不误杀，非法完成字节到达立即 1007（Autobahn 6.4.2 形态）', async () => {
    const server = await startNative()
    const c = await rawWsConnect(server.port)
    c.sendFrame(OP.TEXT, Buffer.from('cebae1bdb9cf83cebcceb5f4', 'hex'), { fin: false })
    await new Promise((r) => setTimeout(r, 150))
    assert.equal(c.closeFrame, null, '首片（未完成序列）不得关闭')
    // f4 90：F4 的第二字节上界 8F——此字节即非法（不等 PART3 完成）
    c.sendFrame(OP.CONT, Buffer.from('90', 'hex'), { fin: false })
    await c.waitFor(() => c.closeFrame !== null)
    assert.equal(c.closeFrame?.code, 1007)
    c.destroy()
  })

  it('停机——server.stop() 触发 1001 握手', async () => {
    const { server, c } = await opened()
    await server.stop()
    await c.waitFor(() => c.closeFrame !== null)
    assert.equal(c.closeFrame?.code, 1001)
    c.destroy()
  })
})
