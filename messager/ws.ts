import type { Sql } from 'postgres'
import type { AgentModule } from '../agent/types.ts'
import type { WSMessage, Message } from './types.ts'
import type { Context } from '../types.ts'

interface WSDeps {
  sql: Sql<{}>
  agents?: AgentModule
}

// In-memory channel subscriptions
// channel_id → Set<{ ws, userId }>
const channels = new Map<number, Set<{ ws: WebSocket; userId: number }>>()
// user_id → Set<WebSocket>
const userConnections = new Map<number, Set<WebSocket>>()

export function broadcastToChannel(channelId: number, data: any): void {
  const members = channels.get(channelId)
  if (!members) return
  const msg = JSON.stringify(data)
  for (const { ws } of members) {
    try { ws.send(msg) } catch {}
  }
}

function subscribe(ws: WebSocket, userId: number, channelId: number): void {
  if (!channels.has(channelId)) channels.set(channelId, new Set())
  channels.get(channelId)!.add({ ws, userId })

  if (!userConnections.has(userId)) userConnections.set(userId, new Set())
  userConnections.get(userId)!.add(ws)
}

function unsubscribe(ws: WebSocket): void {
  for (const [, members] of channels) {
    for (const m of members) {
      if (m.ws === ws) { members.delete(m); break }
    }
  }
  for (const [, conns] of userConnections) {
    conns.delete(ws)
  }
}

export function createWSHandler(deps: WSDeps): any {
  const { sql, agents } = deps

  return {
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

          // Broadcast to all channel members
          broadcastToChannel(channel_id, { type: 'message', data: message })

          // Auto-subscribe
          subscribe(ws, userId, channel_id)

          // Agent routing
          if (agents) {
            const agentMembers = await sql`
              SELECT member_id FROM "_channel_members"
              WHERE channel_id = ${channel_id} AND member_type = 'agent'
            ` as any[]

            for (const am of agentMembers) {
              agents.run(am.member_id, { input: content, stream: false }).then(result => {
                if ('output' in result && result.output) {
                  sql`
                    INSERT INTO "_messages" ("channel_id", "sender_id", "sender_type", "content")
                    VALUES (${channel_id}, ${am.member_id}, 'agent', ${result.output})
                  `.then(([r]) => {
                    broadcastToChannel(channel_id, { type: 'message', data: r })
                  })
                }
              }).catch(() => {})
            }
          }
          break
        }

        case 'typing': {
          broadcastToChannel(channel_id, {
            type: 'typing',
            channel_id,
            user_id: userId,
            is_typing: is_typing ?? false,
          })
          break
        }

        case 'read': {
          if (!channel_id || !last_message_id) return
          await sql`
            UPDATE "_channel_members"
            SET last_read_id = ${last_message_id}, last_read_at = NOW()
            WHERE channel_id = ${channel_id} AND member_id = ${userId} AND member_type = 'user'
          `
          broadcastToChannel(channel_id, {
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
      unsubscribe(ws)
    },

    error(ws: WebSocket) {
      unsubscribe(ws)
    },
  }
}
