/**
 * weifuwu/db/redis — Mock Redis 服务器（测试基础设施）
 *
 * 基于 node:net 的 RESP2 TCP 服务器，用于协议级测试。
 * 可配置命令 → 响应生成器，支持故障注入（handler 抛错 → -ERR）。
 *
 * 用法:
 *   const mock = createMockRedis({ commands: { PING: () => 'PONG' } })
 *   const port = await mock.listen(0)
 *   // ... 连接测试 ...
 *   await mock.close()
 */

import net from 'node:net'
import { RespParser, RespError, type RespValue } from '../redis/resp.ts'

export interface MockRedisOptions {
  /** 命令名 → 响应生成器。返回 RESP 值（string/number/null/array）或抛错（→ -ERR）。 */
  commands?: Record<string, (args: string[]) => RespValue>
  /** 全局钩子：每个命令进来时调用（用于故障注入/记录）。返回 false 则拒绝。 */
  onCommand?: (name: string, args: string[]) => void | boolean
}

export interface MockRedis {
  listen(port: number): Promise<number>
  close(): Promise<void>
  /** 强制断开所有客户端连接（模拟服务器重启/宕机） */
  hardClose(): void
  /** 统计：收到命令次数 */
  commandCount: () => number
  /** 最后一次收到的命令 */
  lastCommand: () => { name: string; args: string[] } | null
}

export function createMockRedis(options: MockRedisOptions = {}): MockRedis {
  let count = 0
  let last: { name: string; args: string[] } | null = null

  const server = net.createServer((socket) => {
    const parser = new RespParser()
    socket.on('data', (chunk) => {
      try {
        const { value, incomplete } = parser.push(new Uint8Array(chunk))
        if (incomplete) return

        const [name, ...args] = value as string[]
        const cmd = String(name ?? '').toUpperCase()
        count++
        last = { name: cmd, args: args.map(String) }

        // 全局钩子（可拒绝）
        if (options.onCommand?.(cmd, last.args) === false) {
          writeError(socket, 'ERR rejected by mock hook')
          return
        }

        const handler = options.commands?.[cmd]
        if (!handler) {
          writeError(socket, `ERR unknown command '${cmd}'`)
          return
        }

        let reply: RespValue
        try {
          reply = handler(last.args)
        } catch (e) {
          writeError(socket, `ERR ${e instanceof Error ? e.message : String(e)}`)
          return
        }
        socket.write(Buffer.from(encodeReply(reply)))
      } catch (e) {
        // 协议层错误——终止连接（模拟真实服务器行为）
        socket.destroy()
      }
    })
  })

  function writeError(socket: net.Socket, message: string) {
    socket.write(Buffer.from(`-${message}\r\n`))
  }

  const sockets = new Set<net.Socket>()
  server.on('connection', (s) => {
    sockets.add(s)
    s.on('close', () => sockets.delete(s))
  })

  return {
    listen: (port) =>
      new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '127.0.0.1', () => {
          server.removeListener('error', reject)
          const addr = server.address()
          resolve(typeof addr === 'object' && addr ? addr.port : port)
        })
      }),
    close: () => new Promise((resolve) => server.close(() => resolve())),
    hardClose: () => {
      for (const s of sockets) s.destroy()
    },
    commandCount: () => count,
    lastCommand: () => last,
  }
}

/** 编码 RESP 响应值（服务端视角） */
function encodeReply(value: RespValue): Uint8Array {
  if (value === null) return new TextEncoder().encode('$-1\r\n')
  if (typeof value === 'number') return new TextEncoder().encode(`:${value}\r\n`)
  if (typeof value === 'string') return new TextEncoder().encode(`$${Buffer.byteLength(value)}\r\n${value}\r\n`)
  // 数组
  const parts = [`*${value.length}\r\n`]
  for (const item of value) {
    const enc = encodeReply(item)
    parts.push(new TextDecoder().decode(enc))
  }
  return new TextEncoder().encode(parts.join(''))
}
