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
  /** 心跳间隔(ms), 默认 30s。设 0 关闭。 */
  pingInterval?: number
  /** 心跳超时(ms), 默认 10s。超过此时间未收到 pong 则重连。 */
  pingTimeout?: number
}

export function ws(opts: WsOptions = {}): AppMiddleware {
  const wsUrl = opts.url ?? '/ws'
  const reconnectInterval = opts.reconnectInterval ?? 3000
  const maxReconnect = opts.maxReconnect ?? 10
  const pingIntervalMs = opts.pingInterval ?? 30_000
  const pingTimeoutMs = opts.pingTimeout ?? 10_000

  return (ctx: WfuiContext): WfuiContext => {
    const isConnected = signal(false)
    const messageHandlers = new Set<(data: unknown) => void>()
    let socket: WebSocket | null = null
    let reconnectCount = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    /** 连接未就绪时暂存的消息队列 */
    const sendQueue: unknown[] = []
    /** 心跳定时器 */
    let pingTimer: ReturnType<typeof setInterval> | null = null
    let pongTimer: ReturnType<typeof setTimeout> | null = null

    function clearTimers() {
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
      if (pongTimer) { clearTimeout(pongTimer); pongTimer = null }
    }

    function onPongReceived() {
      if (pongTimer) { clearTimeout(pongTimer); pongTimer = null }
    }

    function startPing() {
      if (pingIntervalMs <= 0) return
      clearTimers()
      pingTimer = setInterval(() => {
        if (socket?.readyState !== WebSocket.OPEN) return
        // 发送 ping 帧
        try { socket.send(JSON.stringify({ type: 'ping' })) } catch { return }
        // 等待 pong 超时
        pongTimer = setTimeout(() => {
          // 未收到 pong，认为连接已死，主动关闭触发重连
          socket?.close()
        }, pingTimeoutMs)
      }, pingIntervalMs)
    }

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
        // 启动心跳
        startPing()
      }

      socket.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data)
          // 拦截 pong 响应
          if (data && data.type === 'pong') {
            onPongReceived()
            return
          }
          for (const h of messageHandlers) h(data)
        } catch {
          for (const h of messageHandlers) h(event.data)
        }
      }

      socket.onclose = () => {
        isConnected.value = false
        socket = null
        clearTimers()
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
