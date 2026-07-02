/**
 * WebSocket upgrade + connection lifecycle.
 *
 * Handles the HTTP-to-WS upgrade and per-connection state.
 * Used internally by Router — not exported to end users.
 */

import { WebSocketServer } from 'ws'
import type { WebSocket, Context, Handler, Middleware } from '../types.ts'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { type Hub } from '../hub.ts'

/** WebSocket lifecycle handler. */
export type WebSocketHandler = {
  open?: (ws: WebSocket, ctx: Context) => void | Promise<void>
  message?: (ws: WebSocket, ctx: Context, data: string | Buffer) => void | Promise<void>
  close?: (ws: WebSocket, ctx: Context) => void | Promise<void>
  error?: (ws: WebSocket, ctx: Context, error: Error) => void | Promise<void>
}

export type WsUpgradeHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => void

// ── Helpers ────────────────────────────────────────────────────────

export function nodeReqHeadersToRecord(headers: IncomingMessage['headers']): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (v !== undefined) result[k] = Array.isArray(v) ? v.join(', ') : v
  }
  return result
}

function sendHttpResponseOnSocket(socket: Duplex, response: Response): void {
  const statusLine = `HTTP/1.1 ${response.status} ${response.statusText}`
  const lines = [statusLine]
  response.headers.forEach((v, k) => lines.push(`${k}: ${v}`))
  lines.push('Connection: close', '')
  const headerStr = lines.join('\r\n')

  response.arrayBuffer().then((buf) => {
    socket.write(headerStr + '\r\n')
    if (buf.byteLength > 0) socket.write(Buffer.from(buf))
    socket.end()
  }).catch(() => {
    socket.write(headerStr + '\r\n')
    socket.end()
  })
}

// ── Upgrade ─────────────────────────────────────────────────────────

export function upgradeSocket(
  wss: WebSocketServer, req: IncomingMessage, socket: Duplex, head: Buffer,
  handler: WebSocketHandler, ctx: Context, hub: Hub,
): void {
  wss.handleUpgrade(req, socket, head, (ws) => {
    const connCtx: Context = { ...ctx, params: { ...ctx.params }, query: { ...ctx.query } }
    const wsState: Record<string, unknown> = {}

    connCtx.ws = {
      get state() { return wsState },
      json(data: unknown) { ws.send(JSON.stringify(data)) },
      join(room: string) { hub.join(room, ws) },
      leave() { hub.leave(ws) },
      sendRoom(room: string, data: unknown) { hub.broadcast(room, data) },
    }

    handler.open?.(ws, connCtx)
    ws.on('message', (data) => handler.message?.(ws, connCtx, data as string | Buffer))
    ws.on('close', () => { hub.leave(ws); handler.close?.(ws, connCtx) })
    ws.on('error', (err) => handler.error?.(ws, connCtx, err))
  })
}

// ── Upgrade handler factory ─────────────────────────────────────────

type WsMatch = { handler: WebSocketHandler; middlewares: Middleware[]; params: Record<string, string> }

export function createWsUpgradeHandler(
  wss: WebSocketServer,
  hub: Hub,
  matchWsFn: (segments: string[]) => WsMatch | null,
  globalMws: Middleware[],
  runChainFn: (mws: Middleware[], h: Handler, req: Request, ctx: Context) => Promise<Response>,
): WsUpgradeHandler {
  return (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const segments = url.pathname.split('/').filter(Boolean)

    const match = matchWsFn(segments)
    if (!match) { socket.destroy(); return }

    const query = Object.fromEntries(url.searchParams)
    const ctx = { params: match.params, query } as Context

    const mws = globalMws.length === 0 && match.middlewares.length === 0
      ? [] as Middleware[]
      : [...globalMws, ...match.middlewares]

    if (mws.length === 0) {
      upgradeSocket(wss, req, socket, head, match.handler, ctx, hub)
      return
    }

    const finalHandler: Handler = () => {
      try { upgradeSocket(wss, req, socket, head, match.handler, ctx, hub) }
      catch { socket.destroy(); return new Response('WebSocket upgrade failed', { status: 500 }) }
      return new Response(null, { status: 200 })
    }

    const webReq = new Request(url.href, {
      method: req.method ?? 'GET',
      headers: nodeReqHeadersToRecord(req.headers),
    })

    void runChainFn(mws, finalHandler, webReq, ctx).then((result) => {
      if (result.status >= 400) sendHttpResponseOnSocket(socket, result)
    }).catch(() => {
      socket.destroy()
    })
  }
}
