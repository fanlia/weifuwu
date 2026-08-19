/**
 * ws middleware — 注入 ctx.ws
 *
 * WebSocket 客户端，自动重连，支持房间。
 * 状态为普通值，组件通过 ctx.render() 刷新。
 */

import type { UIContext, AppMiddleware } from '../types.ts'
import { extendCtx } from '../types.ts'

export interface WsOptions {
  url?: string
  reconnectInterval?: number
  maxReconnect?: number
  pingInterval?: number
  pingTimeout?: number
}

/** ws 中间件注入到 ctx 的字段 */
/** ws 连接状态（页面清晰显示——用户要求"ws 链接状态一定要清晰"） */
export type WsStatus = 'connecting' | 'connected' | 'disconnected'

/** ws 中间件注入的客户端形状（与 UIContext.ws 一致） */
export interface WsClient {
  send: (msg: unknown) => void
  onMessage: (fn: (data: unknown) => void) => () => void
  isConnected: boolean
  /** 连接状态通知（open → connected / close → disconnected（重连中）/
   *  首次连接前 connecting）——页面渲染 + 状态清晰显示；payload 含重连信息 */
  onStatusChange: (fn: (status: WsStatus, detail?: { attempt: number; max: number }) => void) => () => void
}

export interface WsInjected {
  ws: WsClient
}

export function ws(options: WsOptions = {}): AppMiddleware<{}, WsInjected> {
  const wsUrl = options.url ?? '/ws'
  const reconnectInterval = options.reconnectInterval ?? 3000
  const maxReconnect = options.maxReconnect ?? 10
  const pingIntervalMs = options.pingInterval ?? 30_000
  const pingTimeoutMs = options.pingTimeout ?? 10_000

  return (ctx: UIContext) => {
    const messageHandlers = new Set<(data: unknown) => void>()
    let socket: WebSocket | null = null
    let reconnectAttempts = 0
    let reconnectTimer: any = null
    let pingTimer: any = null
    let pingTimeoutTimer: any = null
    let destroyed = false
    // 连接建立前 send 的消息排队（subscribe 等——首次 mount 时 socket 仍 CONNECTING，
    // 立即发送会被丢弃 → 房间订阅永久丢失 → 收不到推送。OPEN 后 flush 补发）
    let pending: string[] = []
    // 状态通知（页面清晰显示连接状态——connecting/connected/disconnected）
    const statusHandlers = new Set<(status: WsStatus, detail?: { attempt: number; max: number }) => void>()
    const notifyStatus = (status: WsStatus) => {
      wsClient.isConnected = status === 'connected'
      const detail = status === 'disconnected' ? { attempt: reconnectAttempts + 1, max: maxReconnect } : undefined
      for (const fn of statusHandlers) { try { fn(status, detail) } catch { /* 状态通知失败隔离 */ } }
    }

    const wsClient = {
      isConnected: false,
      onMessage: (fn: (data: unknown) => void): (() => void) => {
        messageHandlers.add(fn)
        return () => { messageHandlers.delete(fn) }
      },

      onStatusChange: (fn: (status: WsStatus, detail?: { attempt: number; max: number }) => void): (() => void) => {
        statusHandlers.add(fn)
        // 注册即通知当前状态（页面初始渲染正确显示）
        queueMicrotask(() => { try { fn(wsClient.isConnected ? 'connected' : 'connecting', { attempt: 0, max: maxReconnect }) } catch { /* 忽略 */ } })
        return () => { statusHandlers.delete(fn) }
      },

      send: (msg: unknown) => {
        const s = JSON.stringify(msg)
        try {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(s)
          } else {
            pending.push(s) // 未连接 → 排队，OPEN 后 flush
          }
        } catch {
          // 发送异常（socket 竞态关闭等）——降级排队——onopen 后重试——
          // 不中断调用链（提交/答题同步的 send 失败必须可重试——真实 bug：
          // socket.send 抛 → flushSync 中断 → 后续题/提交未发送）
          pending.push(s)
        }
      },

      _connect: connect,

      /** 断开连接并清理所有定时器 */
      close: () => {
        destroyed = true
        clearTimers()
        socket?.close()
        socket = null
        pending = []
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
          notifyStatus('connected')
          // flush 排队消息（首次 mount 的 subscribe 等）
          for (const s of pending) socket!.send(s)
          pending = []
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
          notifyStatus('disconnected')
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
