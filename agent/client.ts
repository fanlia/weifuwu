import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel, EmbeddingModel } from 'ai'
import type { AgentOptions, AgentModule } from './types.ts'
import { PgModule } from '../postgres/module.ts'
import { serial, text, integer, boolean, timestamptz, jsonb, vector, sql as schemaSql } from '../postgres/schema/index.ts'
import { buildRouter } from './rest.ts'
import { createRunner } from './run.ts'

function createModelsFromEnv(): { model: LanguageModel; embeddingModel: EmbeddingModel; dimension: number } {
  const baseURL = process.env.OPENAI_BASE_URL || 'http://localhost:11434/v1'
  const apiKey = process.env.OPENAI_API_KEY || 'ollama'
  const modelName = process.env.OPENAI_MODEL || 'qwen3:0.6b'
  const embedModelName = process.env.OPENAI_EMBEDDING_MODEL || 'qwen3-embedding:0.6b'

  const provider = createOpenAI({ baseURL, apiKey })
  return {
    model: provider(modelName),
    embeddingModel: provider.embedding(embedModelName),
    dimension: parseInt(process.env.EMBEDDING_DIMENSION || '1024', 10),
  }
}

export function agent(options: AgentOptions): AgentModule {
  const pg = options.pg
  const sql = pg.sql
  const model = options.model
  const embeddingModel = options.embeddingModel
  const dimension = options.embeddingDimension ?? 1024

  let defaultModels: { model: LanguageModel; embeddingModel: EmbeddingModel } | null = null

  function getModel(): LanguageModel {
    if (model) return model
    if (!defaultModels) defaultModels = createModelsFromEnv()
    return defaultModels.model
  }

  function getEmbeddingModel(): EmbeddingModel {
    if (embeddingModel) return embeddingModel
    if (!defaultModels) defaultModels = createModelsFromEnv()
    return defaultModels.embeddingModel
  }

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

  const runner = createRunner({ sql, agents: agentsTable, knowledge: knowledgeTable, getModel, getEmbeddingModel, userTools: options.tools })

  const base = new PgModule(pg)

  return {
    migrate: async () => {
      await agentsTable.create()
      await agentsTable.createIndex('tenant_id')
      await knowledgeTable.create()
      await knowledgeTable.createIndex('agent_id')
    },
    router: () => buildRouter({ agents: agentsTable, knowledge: knowledgeTable, runner }),
    run: (agentId: number, params) => runner.run(agentId, params),
    addKnowledge: (agentId: number, title: string, content: string) => runner.addKnowledge(agentId, title, content),
    close: () => base.close(),
  }
}
