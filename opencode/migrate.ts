import type { Sql } from '../vendor.ts'
import { pgTable, uuid, serial, text, integer, boolean, timestamptz, jsonb, sql as schemaSql } from '../postgres/schema/index.ts'

export async function migrate(sql: Sql<{}>): Promise<void> {
  const sessions = pgTable('_opencode_sessions', {
    id: uuid('id').default(schemaSql`gen_random_uuid()`).primaryKey(),
    tenant_id: text('tenant_id'),
    user_id: integer('user_id').default(0),
    title: text('title'),
    agent_type: text('agent_type').default('build'),
    model: text('model').default('deepseek-v4-flash'),
    system_prompt: text('system_prompt'),
    workspace: text('workspace'),
    metadata: jsonb('metadata').default(schemaSql`'{}'::jsonb`),
    active: boolean('active').default(true),
    created_at: timestamptz('created_at').default(schemaSql`NOW()`),
    updated_at: timestamptz('updated_at').default(schemaSql`NOW()`),
  })
  await sessions.create(sql)
  await sessions.createIndex(sql, 'user_id')

  const messages = pgTable('_opencode_messages', {
    id: serial('id').primaryKey(),
    session_id: uuid('session_id').notNull().references('_opencode_sessions', 'id', 'cascade'),
    role: text('role').notNull(),
    content: text('content'),
    tool_calls: jsonb('tool_calls'),
    tool_results: jsonb('tool_results'),
    tokens_in: integer('tokens_in').default(0),
    tokens_out: integer('tokens_out').default(0),
    created_at: timestamptz('created_at').default(schemaSql`NOW()`),
  })
  await messages.create(sql)
  await messages.createIndex(sql, ['session_id', 'created_at'])
}
