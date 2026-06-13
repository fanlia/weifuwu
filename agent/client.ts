import type { AgentOptions, AgentModule } from './types.ts'
import { PgModule } from '../postgres/module.ts'
import { serial, text, integer, boolean, timestamptz, jsonb, vector, sql as schemaSql } from '../postgres/schema/index.ts'
import { buildRouter } from './rest.ts'
import { createRunner } from './run.ts'
import { aiProvider } from '../ai/provider.ts'

export function agent(options: AgentOptions): AgentModule {
  const pg = options.pg
  const sql = pg.sql
  const resolvedProvider = options.provider ?? aiProvider()
  const dimension = options.embeddingDimension ?? resolvedProvider.dimension

  const agentsTable = pg.table('_agents', {
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

  const knowledgeTable = pg.table('_knowledge_documents', {
    id: serial('id').primaryKey(),
    agent_id: integer('agent_id').notNull().references('_agents', 'id', 'cascade'),
    title: text('title').notNull().default(''),
    content: text('content').notNull(),
    embedding: vector('embedding', dimension),
    metadata: jsonb('metadata').notNull().default(schemaSql`'{}'::jsonb`),
    created_at: timestamptz('created_at').notNull().default(schemaSql`NOW()`),
  })

  const runsTable = pg.table('_agent_runs', {
    id: serial('id').primaryKey(),
    agent_id: integer('agent_id').notNull().references('_agents', 'id', 'cascade'),
    input: text('input'),
    output: text('output'),
    model: text('model').notNull().default(''),
    tokens_in: integer('tokens_in').notNull().default(0),
    tokens_out: integer('tokens_out').notNull().default(0),
    elapsed_ms: integer('elapsed_ms').notNull().default(0),
    status: text('status').notNull().default('success'),
    error_msg: text('error_msg'),
    trace_id: text('trace_id'),
    created_at: timestamptz('created_at').notNull().default(schemaSql`NOW()`),
  })

  const runner = createRunner({ sql, agents: agentsTable, runs: runsTable, knowledge: knowledgeTable, provider: resolvedProvider, userTools: options.tools })

  const base = new PgModule(pg)

  const r = buildRouter({ agents: agentsTable, runs: runsTable, knowledge: knowledgeTable, runner })
  const mod = r as AgentModule
  mod.migrate = async () => {
    await agentsTable.create()
    await agentsTable.createIndex('tenant_id')
    await knowledgeTable.create()
    await knowledgeTable.createIndex('agent_id')
    await runsTable.create()
    await runsTable.createIndex(['agent_id', 'created_at'])
  }
  mod.run = (agentId: number, params) => runner.run(agentId, params)
  mod.addKnowledge = (agentId: number, title: string, content: string) => runner.addKnowledge(agentId, title, content)
  mod.close = () => base.close()
  return mod
}
