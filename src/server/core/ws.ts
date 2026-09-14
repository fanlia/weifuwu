/**
 * WebSocket upgrade + connection lifecycle.
 *
 * Handles the HTTP-to-WS upgrade and per-connection state.
 * Used internally by Router — not exported to end users.
 *
 * W2 端口化：core 不依赖 `ws`——协议侧由 `WsHandlePort` 注入
 * （装备实现 src/server/ws/adapter.ts；自研 RFC6455 为 W5 条件波次）。
 */

import type { Duplex } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import type { Context, Hub, WebSocket } from '../types.ts'

/** Hub 类型自 L0 types.ts 重出（历史导入路径兼容）。 */
export type { Hub } from '../types.ts'

/** WebSocket lifecycle handler. */
export type WebSocketHandler = {
  open?: (ws: WebSocket, ctx: Context) => void | Promise<void>
  message?: (ws: WebSocket, ctx: Context, data: string | Buffer) => void | Promise<void>
  close?: (ws: WebSocket, ctx: Context) => void | Promise<void>
  error?: (ws: WebSocket, ctx: Context, error: Error) => void | Promise<void>
}

/**
 * WS 升级端口（core 契约）——协议侧实现属装备：
 * - `ws` 实现：src/server/ws/adapter.ts（默认——`weifuwu` 入口 serve() 自动注入）
 * - 自研 RFC6455 / 测试替身：同一结构即可替换
 *
 * 缺适配器且注册了 WS 路由 → serve() 显式报错（不静默 404）。
 */
export interface WsHandlePort {
  /** HTTP upgrade → 协议握手；完成时回调连接（结构兼容 ws 的 handleUpgrade） */
  handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    callback: (ws: WebSocket) => void,
  ): void
  /** 优雅停机：通知活跃连接关闭（1001）并等待握手（可选——无连接管理时省略） */
  shutdown?(): void | Promise<void>
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
  port: WsHandlePort,
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

    port.handleUpgrade(req, socket, head, (ws: WebSocket) => {
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
      ws.on('message', (data) => messageHook(ws, ctx, data as string | Buffer))
      ws.on('close', () => closeHook(ws, ctx))
      ws.on('error', (error) => {
        const e = error as Error
        if (errorHook) errorHook(e)
        else console.error('[ws] connection error:', e.message)
      })
    })
  }
}
