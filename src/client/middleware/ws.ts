/**
 * ws middleware — 注入 ctx.ws
 *
 * WebSocket 客户端，自动重连，支持房间。
 *
 * ```tsx
 * app.use(ws({ url: '/ws' }))
 *
 * // In component:
 * const unsub = ctx.ws.onMessage((data) => ...)
 * ctx.ws.send({ type: 'ping' })
 * onCleanup(() => unsub())
 * ```
 */

import type { WfuiContext, AppMiddleware } from '../types.ts'
import { extendCtx } from '../types.ts'
import { signal } from '../signal.ts'

export interface WsOptions {
  url?: string
  reconnectInterval?: number
  maxReconnect?: number
}

export function ws(opts: WsOptions = {}): AppMiddleware {
  const wsUrl = opts.url ?? '/ws'
  const reconnectInterval = opts.reconnectInterval ?? 3000
  const maxReconnect = opts.maxReconnect ?? 10

  return (ctx: WfuiContext): WfuiContext => {
    const isConnected = signal(false)
    const messageHandlers = new Set<(data: unknown) => void>()
    let socket: WebSocket | null = null
    let reconnectCount = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    /** 连接未就绪时暂存的消息队列 */
    const sendQueue: unknown[] = []

    function connect() {
      if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return

      const url = wsUrl

      try {
        socket = new WebSocket(url)
      } catch {
        scheduleReconnect()
        return
      }

      socket.onopen = () => {
        isConnected.value = true
        reconnectCount = 0
        // 连接就绪后发送积压消息
        while (sendQueue.length > 0) {
          const msg = sendQueue.shift()
          try { socket!.send(typeof msg === 'string' ? msg : JSON.stringify(msg)) } catch {}
        }
      }

      socket.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data)
          for (const h of messageHandlers) h(data)
        } catch {
          for (const h of messageHandlers) h(event.data)
        }
      }

      socket.onclose = () => {
        isConnected.value = false
        socket = null
        scheduleReconnect()
      }

      socket.onerror = () => {
        socket?.close()
      }
    }

    function scheduleReconnect() {
      if (reconnectCount >= maxReconnect) return
      reconnectCount++
      reconnectTimer = setTimeout(connect, reconnectInterval * reconnectCount)
    }

    function send(data: unknown) {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(typeof data === 'string' ? data : JSON.stringify(data))
      } else {
        // 连接未就绪（CONNECTING 或 CLOSED）— 暂存到队列等待 open 后发送
        sendQueue.push(data)
      }
    }

    // 初始连接
    connect()

    return extendCtx(ctx, {
      ws: {
        send,
        onMessage: (handler: (data: unknown) => void): (() => void) => {
          messageHandlers.add(handler)
          return () => messageHandlers.delete(handler)
        },
        get isConnected() { return isConnected },
      },
    })
  }
}
