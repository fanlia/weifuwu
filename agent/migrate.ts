import type { Sql } from '../vendor.ts'
import { pgTable, serial, text, integer, boolean, timestamptz, jsonb, vector, sql as schemaSql } from '../postgres/schema/index.ts'

export interface MigrateOptions {
  sql: Sql<{}>
  embeddingDimension: number
}

export async function migrate(opts: MigrateOptions): Promise<void> {
  const { sql, embeddingDimension } = opts

  const agents = pgTable('_agents', {
    id: serial('id').primaryKey(),
    tenant_id: text('tenant_id'),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    type: text('type').notNull().default('chat'),
    model: text('model').notNull().default(''),
    system_prompt: text('system_prompt').notNull().default(''),
    owner_id: integer('owner_id').notNull(),
    active: boolean('active').notNull().default(true),
    created_at: timestamptz('created_at').notNull().default(schemaSql`NOW()`),
    updated_at: timestamptz('updated_at').notNull().default(schemaSql`NOW()`),
  })
  await agents.create(sql)
  await agents.createIndex(sql, 'tenant_id')

  const docs = pgTable('_knowledge_documents', {
    id: serial('id').primaryKey(),
    agent_id: integer('agent_id').notNull().references('_agents', 'id', 'cascade'),
    title: text('title').notNull().default(''),
    content: text('content').notNull(),
    embedding: vector('embedding', embeddingDimension),
    metadata: jsonb('metadata').notNull().default(schemaSql`'{}'::jsonb`),
    created_at: timestamptz('created_at').notNull().default(schemaSql`NOW()`),
  })
  await docs.create(sql)
  await docs.createIndex(sql, 'agent_id')
}
