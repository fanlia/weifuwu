/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Sql, WebSocket } from '../vendor.ts'
import type { AgentModule } from '../agent/types.ts'
import type { WSMessage, Message } from './types.ts'
import type { Context } from '../types.ts'
import { createHub, type Hub } from '../hub.ts'
import { runAgentRouting } from './agent.ts'

interface WSDeps {
  sql: Sql<{}>
  agents?: AgentModule
  redis?: import('../vendor.ts').Redis
}

export function broadcastToChannel(hub: Hub | undefined, channelId: number, data: any): void {
  hub?.broadcast(`messager:${channelId}`, data)
}

export function createWSHandler(deps: WSDeps): { handler: any; hub: Hub } {
  const { sql, agents } = deps

  const hub = createHub({
    redis: deps.redis,
    prefix: 'messager:',
  })

  // user_id → Set<WebSocket> (hub handles channel membership)
  const userConnections = new Map<number, Set<WebSocket>>()

  function trackConnection(userId: number, ws: WebSocket) {
    let conns = userConnections.get(userId)
    if (!conns) {
      conns = new Set()
      userConnections.set(userId, conns)
    }
    conns.add(ws)
  }

  function untrackConnection(ws: WebSocket) {
    for (const [userId, conns] of userConnections) {
      conns.delete(ws)
      if (conns.size === 0) userConnections.delete(userId)
    }
  }

  return {
    handler: {
      open(ws: WebSocket, ctx: Context) {
        const userId = (ctx as any).user?.id
        if (!userId) {
          ws.close(4001, 'Unauthorized')
          return
        }
      },

      async message(ws: WebSocket, ctx: Context, data: string | Buffer) {
        const userId = (ctx as any).user?.id
        if (!userId) return

        let msg: WSMessage
        try {
          msg = JSON.parse(data.toString()) as WSMessage
        } catch {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }))
          return
        }

        const { type, channel_id, content, is_typing, last_message_id } = msg

        switch (type) {
          case 'message': {
            if (!content || !channel_id) return
            const [row] = await sql`
              INSERT INTO "_messages" ("channel_id", "sender_id", "sender_type", "content")
              VALUES (${channel_id}, ${userId}, 'user', ${content})
              RETURNING *
            `
            const message = row as Message

            hub.join(`messager:${channel_id}`, ws)
            trackConnection(userId, ws)

            broadcastToChannel(hub, channel_id, { type: 'message', data: message })

            // Agent routing
            if (agents) {
              const insertMsg = (data: any) =>
                sql`
              INSERT INTO "_messages" ("channel_id", "sender_id", "sender_type", "content")
              VALUES (${data.channel_id}, ${data.sender_id}, ${data.sender_type}, ${data.content})
              RETURNING *
            `.then(([r]) => r)
              runAgentRouting(sql, { insert: insertMsg }, agents, hub, channel_id, content)
            }
            break
          }

          case 'typing': {
            if (channel_id) {
              hub.join(`messager:${channel_id}`, ws)
            }
            broadcastToChannel(hub, channel_id, {
              type: 'typing',
              channel_id,
              user_id: userId,
              is_typing: is_typing ?? false,
            })
            break
          }

          case 'read': {
            if (!channel_id || !last_message_id) return
            hub.join(`messager:${channel_id}`, ws)
            await sql`
              UPDATE "_channel_members"
              SET last_read_id = ${last_message_id}, last_read_at = NOW()
              WHERE channel_id = ${channel_id} AND member_id = ${userId} AND member_type = 'user'
            `
            broadcastToChannel(hub, channel_id, {
              type: 'read',
              channel_id,
              user_id: userId,
              last_message_id,
            })
            break
          }
        }
      },

      close(ws: WebSocket) {
        hub.leave(ws)
        untrackConnection(ws)
      },

      error(ws: WebSocket) {
        hub.leave(ws)
        untrackConnection(ws)
      },
    },
    hub,
  }
}
