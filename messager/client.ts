import type { MessagerOptions, MessagerModule, Message } from './types.ts'
import { PgModule } from '../postgres/module.ts'
import { serial, text, integer, timestamptz, sql as schemaSql } from '../postgres/schema/index.ts'
import { buildRouter } from './rest.ts'
import { createWSHandler, broadcastToChannel } from './ws.ts'

export function messager(options: MessagerOptions): MessagerModule {
  const pg = options.pg
  const sql = pg.sql
  const agents = options.agents
  const redis = options.redis

  const base = new PgModule(pg)

  const channels = pg.table('_channels', {
    id: serial('id').primaryKey(),
    tenant_id: text('tenant_id'),
    name: text('name').notNull().default(''),
    type: text('type').notNull().default('channel'),
    created_by: integer('created_by').notNull(),
    created_at: timestamptz('created_at').notNull().default(schemaSql`NOW()`),
  })

  const members = pg.table('_channel_members', {
    id: serial('id').primaryKey(),
    channel_id: integer('channel_id').notNull().references('_channels', 'id', 'cascade'),
    member_id: integer('member_id').notNull(),
    member_type: text('member_type').notNull().default('user'),
    role: text('role').notNull().default('member'),
    last_read_id: integer('last_read_id'),
    last_read_at: timestamptz('last_read_at'),
  })

  const messages = pg.table('_messages', {
    id: serial('id').primaryKey(),
    channel_id: integer('channel_id').notNull().references('_channels', 'id', 'cascade'),
    sender_id: integer('sender_id').notNull(),
    sender_type: text('sender_type').notNull().default('user'),
    type: text('type').notNull().default('text'),
    content: text('content').notNull().default(''),
    file_url: text('file_url'),
    file_name: text('file_name'),
    file_size: integer('file_size'),
    mime_type: text('mime_type'),
    created_at: timestamptz('created_at').notNull().default(schemaSql`NOW()`),
  })

  return {
    migrate: async () => {
      await channels.create()
      await channels.createIndex('tenant_id')
      await members.create()
      await members.createIndex('member_id')
      await members.createIndex(['channel_id', 'member_id', 'member_type'], { unique: true })
      await messages.create()
      await messages.createIndex(['channel_id', 'created_at'], { desc: true })
    },
    router: () => buildRouter({ sql, channels, members, messages, agents }),
    wsHandler: () => createWSHandler({ sql, agents, redis }),
    async send(channelId: number, content: string, opts?: {
      sender_type?: string
      sender_id?: number
      type?: string
    }): Promise<Message> {
      const msg = await messages.insert({
        channel_id: channelId,
        sender_id: opts?.sender_id ?? 0,
        sender_type: opts?.sender_type ?? 'system',
        type: opts?.type ?? 'text',
        content,
      })
      broadcastToChannel(channelId, { type: 'message', data: msg })
      return msg as Message
    },
    close: () => base.close(),
  }
}
