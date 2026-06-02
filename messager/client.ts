import type { MessagerOptions, MessagerModule, Message } from './types.ts'
import { PgModule } from '../postgres/module.ts'
import { serial, text, integer, timestamptz, sql } from '../postgres/schema/index.ts'
import { migrate as runMigrations } from './migrate.ts'
import { buildRouter } from './rest.ts'
import { createWSHandler, broadcastToChannel } from './ws.ts'

export function messager(options: MessagerOptions): MessagerModule {
  const pg = options.pg
  const sql = pg.sql
  const agents = options.agents

  const base = new PgModule(pg)

  const channels = pg.table('_channels', {
    id: serial('id'),
    tenant_id: text('tenant_id'),
    name: text('name'),
    type: text('type'),
    created_by: integer('created_by'),
    created_at: timestamptz('created_at'),
  })

  const members = pg.table('_channel_members', {
    id: serial('id'),
    channel_id: integer('channel_id'),
    member_id: integer('member_id'),
    member_type: text('member_type'),
    role: text('role'),
    last_read_id: integer('last_read_id'),
    last_read_at: timestamptz('last_read_at'),
  })

  const messages = pg.table('_messages', {
    id: serial('id'),
    channel_id: integer('channel_id'),
    sender_id: integer('sender_id'),
    sender_type: text('sender_type'),
    type: text('type'),
    content: text('content'),
    file_url: text('file_url'),
    file_name: text('file_name'),
    file_size: integer('file_size'),
    mime_type: text('mime_type'),
    created_at: timestamptz('created_at'),
  })

  return {
    migrate: () => runMigrations(sql),
    router: () => buildRouter({ sql, channels, members, messages, agents }),
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
