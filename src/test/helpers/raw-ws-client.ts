/**
 * 原始帧测试客户端（W5——原生 TCP 逐帧控制）
 *
 * 用途：RFC6455 一致性测试与 native/ws 差分对账——必须能发送**任意**字节
 * （非法帧/未掩码/非最小编码/任意分片），`ws` 客户端库做不到。
 * 只读 HTTP 握手 + 帧流；服务端→客户端帧无掩码（decodeFrames expectMask=false）。
 */
import { connect, type Socket } from 'node:net'
import { randomBytes } from 'node:crypto'
import { decodeFrames, encodeFrame, OP, type Frame } from '../../level5/server/ws/native/frame.ts'

export interface RawWs {
  socket: Socket
  status: number
  headers: Record<string, string>
  frames: Frame[]
  closeFrame: { code: number; reason: string } | null
  /** 编码并发送客户端帧（默认掩码——非法场景可 mask:false） */
  sendFrame(opcode: number, payload?: Buffer | string, opts?: { fin?: boolean; mask?: boolean }): void
  /** 原样发送字节（畸形帧） */
  write(raw: Buffer): void
  waitFor(check: () => boolean, timeoutMs?: number): Promise<void>
  destroy(): void
}

function parseClose(payload: Buffer): { code: number; reason: string } {
  if (payload.length < 2) return { code: 1005, reason: '' }
  return { code: payload.readUInt16BE(0), reason: payload.subarray(2).toString('utf8') }
}

export async function rawWsConnect(
  port: number,
  path = '/ws',
  opts: { key?: string; version?: string; extraHeaders?: string[] } = {},
): Promise<RawWs> {
  const socket = connect(port, '127.0.0.1')
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('error', reject)
  })
  const key = opts.key ?? randomBytes(16).toString('base64')
  socket.write(
    [
      `GET ${path} HTTP/1.1`,
      'Host: 127.0.0.1',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Key: ${key}`,
      `Sec-WebSocket-Version: ${opts.version ?? '13'}`,
      ...(opts.extraHeaders ?? []),
      '',
      '',
    ].join('\r\n'),
  )

  let buf: Buffer = Buffer.alloc(0)
  let handshakeDone = false
  let status = 0
  const headers: Record<string, string> = {}

  const client: RawWs = {
    socket,
    status: 0,
    headers,
    frames: [],
    closeFrame: null,
    sendFrame(opcode, payload = Buffer.alloc(0), o = {}) {
      socket.write(encodeFrame(opcode, payload, { fin: o.fin, mask: o.mask !== false }))
    },
    write(raw) {
      socket.write(raw)
    },
    async waitFor(check, timeoutMs = 3000) {
      const start = Date.now()
      while (!check()) {
        if (Date.now() - start > timeoutMs) throw new Error('raw-ws waitFor 超时')
        await new Promise((r) => setTimeout(r, 5))
      }
    },
    destroy() {
      socket.destroy()
    },
  }

  socket.on('data', (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk])
    if (!handshakeDone) {
      const idx = buf.indexOf('\r\n\r\n')
      if (idx < 0) return
      const head = buf.subarray(0, idx).toString('utf8')
      const [first, ...rest] = head.split('\r\n')
      status = Number(first.split(' ')[1] ?? 0)
      for (const line of rest) {
        const c = line.indexOf(':')
        if (c > 0) headers[line.slice(0, c).trim().toLowerCase()] = line.slice(c + 1).trim()
      }
      client.status = status
      buf = buf.subarray(idx + 4)
      handshakeDone = true
    }
    if (status !== 101) return
    const { frames, rest } = decodeFrames(buf, 100 * 1024 * 1024, false)
    buf = rest
    for (const f of frames) {
      client.frames.push(f)
      if (f.opcode === OP.CLOSE) client.closeFrame = parseClose(f.payload)
    }
  })

  // 握手响应就绪（协议错误时也不 101——等待头部解析即可）
  const start = Date.now()
  while (!handshakeDone) {
    if (Date.now() - start > 3000) throw new Error('raw-ws 握手响应超时')
    await new Promise((r) => setTimeout(r, 5))
  }
  return client
}

export { OP, encodeFrame }
