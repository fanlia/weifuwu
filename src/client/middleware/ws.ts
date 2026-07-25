/**
 * ws middleware — 注入 ctx.ws
 *
 * WebSocket 客户端，自动重连，支持房间。
 * 状态为普通值，组件通过 ctx.ui.render() 刷新。
 */

import type { WfuiContext, AppMiddleware } from '../types.ts'
import { extendCtx } from '../types.ts'

export interface WsOptions {
  url?: string
  reconnectInterval?: number
  maxReconnect?: number
  pingInterval?: number
  pingTimeout?: number
}

export function ws(options: WsOptions = {}): AppMiddleware {
  const wsUrl = options.url ?? '/ws'
  const reconnectInterval = options.reconnectInterval ?? 3000
  const maxReconnect = options.maxReconnect ?? 10
  const pingIntervalMs = options.pingInterval ?? 30_000
  const pingTimeoutMs = options.pingTimeout ?? 10_000

  return (ctx: WfuiContext): WfuiContext => {
    const messageHandlers = new Set<(data: unknown) => void>()
    let socket: WebSocket | null = null
    let reconnectAttempts = 0
    let reconnectTimer: any = null
    let pingTimer: any = null
    let pingTimeoutTimer: any = null
    let destroyed = false

    const wsClient = {
      isConnected: false,
      onMessage: (fn: (data: unknown) => void): (() => void) => {
        messageHandlers.add(fn)
        return () => { messageHandlers.delete(fn) }
      },

      send: (msg: unknown) => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(msg))
        }
      },

      _connect: connect,

      /** 断开连接并清理所有定时器 */
      close: () => {
        destroyed = true
        clearTimers()
        socket?.close()
        socket = null
        wsClient.isConnected = false
      },
    }

    async function connect() {
      if (destroyed) return

      try {
        socket = new WebSocket(wsUrl)
        socket.onopen = () => {
          wsClient.isConnected = true
          reconnectAttempts = 0
          startPing()
        }
        socket.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data)
            for (const handler of messageHandlers) handler(data)
          } catch { /* ignore */ }
          resetPingTimeout()
        }
        socket.onclose = () => {
          wsClient.isConnected = false
          clearTimers()
          if (!destroyed && reconnectAttempts < maxReconnect) {
            reconnectAttempts++
            reconnectTimer = setTimeout(connect, reconnectInterval * Math.min(reconnectAttempts, 5))
          }
        }
        socket.onerror = () => {
          socket?.close()
        }
      } catch {
        if (!destroyed) {
          reconnectTimer = setTimeout(connect, reconnectInterval)
        }
      }
    }

    function startPing() {
      if (pingIntervalMs <= 0) return
      pingTimer = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }))
        }
        pingTimeoutTimer = setTimeout(() => {
          socket?.close()
        }, pingTimeoutMs)
      }, pingIntervalMs)
    }

    function resetPingTimeout() {
      clearTimeout(pingTimeoutTimer)
    }

    function clearTimers() {
      clearInterval(pingTimer)
      clearTimeout(pingTimeoutTimer)
      clearTimeout(reconnectTimer)
    }

    connect()

    return extendCtx(ctx, { ws: wsClient })
  }
}
