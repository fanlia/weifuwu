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

/** Minimal context shape for WS handler execution. */
export function createWsUpgradeHandler(
  wss: WebSocketServer,
  matchWs: (segments: string[]) => WsMatch | null,
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
      const ctx = { params: match.params, query: Object.fromEntries(url.searchParams) } as Context

      if (match.handler.open) match.handler.open(ws, ctx)
      ws.on('message', (data: string | Buffer) => {
        if (match.handler.message) match.handler.message(ws, ctx, data)
      })
      ws.on('close', () => {
        if (match.handler.close) match.handler.close(ws, ctx)
      })
      ws.on('error', (error: Error) => {
        if (match.handler.error) match.handler.error(ws, ctx, error)
      })
    })
  }
}
