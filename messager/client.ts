import type { MessagerOptions, MessagerModule, Message } from './types.ts'
import { PgModule } from '../postgres/module.ts'
import { migrate as runMigrations } from './migrate.ts'
import { buildRouter } from './rest.ts'
import { createWSHandler, broadcastToChannel } from './ws.ts'

export function messager(options: MessagerOptions): MessagerModule {
  const pg = options.pg
  const sql = pg.sql
  const agents = options.agents

  const base = new PgModule(pg)

  return {
    migrate: () => runMigrations(sql),
    router: () => buildRouter({ sql, agents }),
    wsHandler: () => createWSHandler({ sql, agents }),
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
    close: () => base.close(),
  }
}
