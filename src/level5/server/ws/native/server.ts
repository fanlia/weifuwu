/**
 * 自研 RFC6455 适配器（W5）——`WsHandlePort` 实现（core 零改动替换）
 *
 * - 握手：GET + Upgrade/Connection 校验 + Sec-WebSocket-Key → Accept（RFC §4.2）
 *   版本≠13 → 426 + `Sec-WebSocket-Version: 13`；其余非法 → 400
 * - 连接：NativeConnection（帧层 frame.ts / 状态层 connection.ts）
 * - 停机：逐一 1001 握手（上限 500ms——与 ws 适配器同语义）
 *
 * 诚实裁剪：无扩展/无压缩/无子协议协商（忽略 `Sec-WebSocket-Protocol`）。
 */
import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { WsHandlePort } from '../../../../level2/ws.ts'
import type { WebSocket } from '../../../../level0/types.ts'
import { NativeConnection } from './connection.ts'

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
/** RFC6455 §4.1：16 字节随机数的 base64（22 字符 + "=="）——与 ws 校验对齐 */
const KEY_RE = /^[+/0-9A-Za-z]{22}==$/

export interface NativeWsOptions {
  /** 单帧/单消息上限（默认 100 MiB——与 ws 默认 maxPayload 对齐） */
  maxPayload?: number
  /** 关闭握手等待上限（默认 5000ms） */
  closeTimeoutMs?: number
}

export function createNativeWsAdapter(options: NativeWsOptions = {}): WsHandlePort {
  const conns = new Set<NativeConnection>()

  return {
    handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, callback: (ws: WebSocket) => void): void {
      const key = String(req.headers['sec-websocket-key'] ?? '')
      const upgrade = String(req.headers.upgrade ?? '').toLowerCase()
      const connection = String(req.headers.connection ?? '').toLowerCase()
      const version = String(req.headers['sec-websocket-version'] ?? '')

      if (version !== '13' && key) {
        socket.end('HTTP/1.1 426 Upgrade Required\r\nSec-WebSocket-Version: 13\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
        return
      }
      if (
        req.method !== 'GET' ||
        upgrade !== 'websocket' ||
        !connection.split(/\s*,\s*/).includes('upgrade') ||
        !key ||
        !KEY_RE.test(key)
      ) {
        socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
        return
      }

      const accept = createHash('sha1').update(key + GUID).digest('base64')
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
      )

      const conn = new NativeConnection(socket, options)
      conns.add(conn)
      conn.on('close', () => conns.delete(conn))
      callback(conn as unknown as WebSocket)
      // 升级请求余量在监听器就绪后再喂入（避免首批消息丢失）
      if (head?.length) conn.feed(head)
    },

    async shutdown(): Promise<void> {
      if (conns.size === 0) return
      const clients = [...conns]
      const done = new Promise<void>((resolve) => {
        let remaining = clients.length
        const timer = setTimeout(resolve, 500)
        for (const c of clients) {
          c.once('close', () => {
            if (--remaining === 0) {
              clearTimeout(timer)
              resolve()
            }
          })
        }
      })
      for (const c of clients) {
        try {
          c.close(1001, 'server shutting down')
        } catch {
          /* already closed */
        }
      }
      await done
    },
  }
}
