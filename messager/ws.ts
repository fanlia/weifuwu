import type { Sql } from '../vendor.ts'
import type { AgentModule } from '../agent/types.ts'
import type { WSMessage, Message } from './types.ts'
import type { Context } from '../types.ts'
import { createHub } from '../hub.ts'
import type { Hub } from '../hub.ts'

interface WSDeps {
  sql: Sql<{}>
  agents?: AgentModule
  redis?: import('../vendor.ts').Redis
}

// user_id → Set<WebSocket> (hub handles channel membership)
const userConnections = new Map<number, Set<WebSocket>>()

let hub: Hub | undefined

export function broadcastToChannel(channelId: number, data: any): void {
  hub?.broadcast(`messager:${channelId}`, data)
}

export function createWSHandler(deps: WSDeps): any {
  const { sql, agents } = deps

  hub = createHub({
    redis: deps.redis,
    prefix: 'messager:',
  })

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

          hub!.join(`messager:${channel_id}`, ws)
          if (!userConnections.has(userId)) userConnections.set(userId, new Set())
          userConnections.get(userId)!.add(ws)

          broadcastToChannel(channel_id, { type: 'message', data: message })

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
                  }).catch((e) => {
                    console.error('[messager] agent reply insert failed:', e)
                  })
                }
              }).catch((e) => {
                console.error('[messager] agent run failed:', e)
              })
            }
          }
          break
        }

        case 'typing': {
          if (channel_id) {
            hub!.join(`messager:${channel_id}`, ws)
          }
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
          hub!.join(`messager:${channel_id}`, ws)
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
      hub?.leave(ws)
      for (const [, conns] of userConnections) {
        conns.delete(ws)
      }
    },

    error(ws: WebSocket) {
      hub?.leave(ws)
      for (const [, conns] of userConnections) {
        conns.delete(ws)
      }
    },
  }
}
