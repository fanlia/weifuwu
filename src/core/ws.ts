/**
 * WebSocket upgrade + connection lifecycle.
 *
 * Handles the HTTP-to-WS upgrade and per-connection state.
 * Used internally by Router — not exported to end users.
 */

import { WebSocketServer } from 'ws'
import { Duplex } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import type { Context, Handler, Middleware } from '../types.ts'

/** WebSocket lifecycle handler. */
export type WebSocketHandler = {
  open?: (ws: import('ws').WebSocket, ctx: Context) => void | Promise<void>
  message?: (ws: import('ws').WebSocket, ctx: Context, data: string | Buffer) => void | Promise<void>
  close?: (ws: import('ws').WebSocket, ctx: Context) => void | Promise<void>
  error?: (ws: import('ws').WebSocket, ctx: Context, error: Error) => void | Promise<void>
}

type WsMatch = { handler: WebSocketHandler; middlewares: Middleware[]; params: Record<string, string> }

export type WsUpgradeHandler = (
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) => void

/** Minimal context shape for WS handler execution. */
interface WsContext {
  params: Record<string, string>
  query: Record<string, string>
  [key: string]: unknown
}

/** Make a partial Context look like a full Context for the middleware chain. */
function asContext(wsc: WsContext): Context {
  return wsc as unknown as Context
}

export function createWsUpgradeHandler(
  wss: WebSocketServer,
  matchWs: (segments: string[]) => WsMatch | null,
  globalMws: Middleware[],
  runChain: (mws: Middleware[], handler: any, req: Request, ctx: Context) => Promise<Response>,
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
      const ctx: WsContext = { params: match.params, query: Object.fromEntries(url.searchParams) }

      const fakeReq = new Request(url, { method: 'GET' })
      runChain(globalMws, match.handler, fakeReq, asContext(ctx))

      if (match.handler.open) match.handler.open(ws, asContext(ctx))
      ws.on('message', (data: string | Buffer) => {
        if (match.handler.message) match.handler.message(ws, asContext(ctx), data)
      })
      ws.on('close', () => {
        if (match.handler.close) match.handler.close(ws, asContext(ctx))
      })
      ws.on('error', (error: Error) => {
        if (match.handler.error) match.handler.error(ws, asContext(ctx), error)
      })
    })
  }
}
