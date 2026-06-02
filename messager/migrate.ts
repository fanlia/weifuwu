import type { Sql } from '../vendor.ts'
import { pgTable, serial, text, integer, timestamptz, sql as schemaSql } from '../postgres/schema/index.ts'

export async function migrate(sql: Sql<{}>): Promise<void> {
  const channels = pgTable('_channels', {
    id: serial('id').primaryKey(),
    tenant_id: text('tenant_id'),
    name: text('name').notNull().default(''),
    type: text('type').notNull().default('channel'),
    created_by: integer('created_by').notNull(),
    created_at: timestamptz('created_at').notNull().default(schemaSql`NOW()`),
  })
  await channels.create(sql)
  await channels.createIndex(sql, 'tenant_id')

  const members = pgTable('_channel_members', {
    id: serial('id').primaryKey(),
    channel_id: integer('channel_id').notNull().references('_channels', 'id', 'cascade'),
    member_id: integer('member_id').notNull(),
    member_type: text('member_type').notNull().default('user'),
    role: text('role').notNull().default('member'),
    last_read_id: integer('last_read_id'),
    last_read_at: timestamptz('last_read_at'),
  })
  await members.create(sql)
  await members.createIndex(sql, 'member_id')
  await sql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "_channel_members_unique_idx" ON "_channel_members" ("channel_id", "member_id", "member_type")`)

  const messages = pgTable('_messages', {
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
  await messages.create(sql)
  await messages.createIndex(sql, ['channel_id', 'created_at'], { desc: true })
}
