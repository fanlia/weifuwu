import type { MessagerOptions, MessagerModule, Message } from './types.ts'
import { migrate as runMigrations } from './migrate.ts'
import { buildRouter } from './rest.ts'
import { createWSHandler, broadcastToChannel } from './ws.ts'

export function messager(options: MessagerOptions): MessagerModule {
  const pg = options.pg
  const sql = pg.sql
  const agents = options.agents

  return {
    async migrate() {
      await runMigrations(sql)
    },

    router() {
      return buildRouter({ sql, agents })
    },

    wsHandler() {
      return createWSHandler({ sql, agents })
    },

    async send(channelId: number, content: string, opts?: {
      sender_type?: string
      sender_id?: number
      type?: string
    }): Promise<Message> {
      const [row] = await sql`
        INSERT INTO "_messages" ("channel_id", "sender_id", "sender_type", "type", "content")
        VALUES (${channelId}, ${opts?.sender_id ?? 0}, ${opts?.sender_type ?? 'system'}, ${opts?.type ?? 'text'}, ${content})
        RETURNING *
      `
      const msg = row as Message
      broadcastToChannel(channelId, { type: 'message', data: msg })
      return msg
    },

    async close() {
      if (typeof pg.close === 'function') {
        await pg.close()
      }
    },
  }
}
