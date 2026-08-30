/**
 * WebSocket upgrade + connection lifecycle.
 *
 * Handles the HTTP-to-WS upgrade and per-connection state.
 * Used internally by Router — not exported to end users.
 */

import { WebSocketServer } from 'ws'
import { Duplex } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import type { Context } from '../types.ts'

/**
 * WebSocket room hub — manages pub/sub groups for real-time messaging.
 *
 * Rooms are identified by string keys. Multiple WebSocket connections
 * can join/leave rooms, and messages are broadcast to all members.
 *
 * The default implementation is in-memory (single process).
 * Pass a custom Hub with Redis backend for multi-instance deployments.
 */
export interface Hub {
  join(key: string, ws: import('ws').WebSocket): void
  leave(ws: import('ws').WebSocket): void
  send(key: string, message: string): void
  close(): Promise<void>
}

/** WebSocket lifecycle handler. */
export type WebSocketHandler = {
  open?: (ws: import('ws').WebSocket, ctx: Context) => void | Promise<void>
  message?: (ws: import('ws').WebSocket, ctx: Context, data: string | Buffer) => void | Promise<void>
  close?: (ws: import('ws').WebSocket, ctx: Context) => void | Promise<void>
  error?: (ws: import('ws').WebSocket, ctx: Context, error: Error) => void | Promise<void>
}

type WsMatch = { handler: WebSocketHandler; params: Record<string, string> }

export type WsUpgradeHandler = (
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) => void

/**
 * hook 错误兑底（S3——SERVER-PERF-PLAN 波次 1）：
 * 任意 hook（open/message/close）同步抛错或异步拒绝都**不逃逸进程**
 * （无兑底 = unhandledRejection/uncaughtException = 生产整机宕机——实证）：
 *   - 有 error hook → 转交（应用获得感知点）
 *   - 无 error hook → console.error（审计可见——静默吞错是违例）
 */
function safeHook<A extends unknown[]>(
  hookName: string,
  fn: ((...args: A) => unknown) | undefined,
  onError: ((err: Error) => void) | null,
): (...args: A) => void {
  if (!fn) return () => {}
  const report = (err: unknown) => {
    const e = err instanceof Error ? err : new Error(String(err))
    if (onError) {
      onError(e)
    } else {
      console.error(`[ws] ${hookName} handler error:`, e.stack || e.message)
    }
  }
  return (...args: A) => {
    try {
      const result = fn(...args)
      if (
        result &&
        typeof (result as Promise<unknown>).catch === 'function'
      ) {
        ;(result as Promise<unknown>).catch(report)
      }
    } catch (err) {
      report(err)
    }
  }
}

/**
 * Minimal context shape for WS handler execution.
 * ctx.hub = 路由级 Hub（默认内存，可用 app.wsHub() 替换为 Redis 后端）。
 */
export function createWsUpgradeHandler(
  wss: WebSocketServer,
  matchWs: (segments: string[]) => WsMatch | null,
  hub: Hub,
): WsUpgradeHandler {
  return (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const segments = req.url?.split('/').filter(Boolean) ?? []
    const match = matchWs(segments)

    if (!match) {
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const ctx = { params: match.params, query: Object.fromEntries(url.searchParams), hub } as Context
      const h = match.handler

      // error hook 本体也要兑底（防递归/防二次逃逸）
      const errorHook = h.error
        ? (err: Error) => {
            try {
              const result = h.error!(ws, ctx, err)
              if (result && typeof (result as Promise<unknown>).catch === 'function') {
                ;(result as Promise<unknown>).catch((e: unknown) =>
                  console.error('[ws] error handler failed:', e),
                )
              }
            } catch (e) {
              console.error('[ws] error handler failed:', e)
            }
          }
        : null

      const openHook = safeHook('open', h.open, errorHook)
      const messageHook = safeHook('message', h.message, errorHook)
      const closeHook = safeHook('close', h.close, errorHook)

      openHook(ws, ctx)
      ws.on('message', (data: string | Buffer) => messageHook(ws, ctx, data))
      ws.on('close', () => closeHook(ws, ctx))
      ws.on('error', (error: Error) => {
        if (errorHook) errorHook(error)
        else console.error('[ws] connection error:', error.message)
      })
    })
  }
}
