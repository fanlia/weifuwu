import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel, EmbeddingModel } from 'ai'
import type { AgentOptions, AgentModule } from './types.ts'
import { PgModule } from '../postgres/module.ts'
import { serial, text, integer, boolean, timestamptz, jsonb, vector, sql } from '../postgres/schema/index.ts'
import { migrate as runMigrations } from './migrate.ts'
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
    id: serial('id'),
    tenant_id: text('tenant_id'),
    name: text('name'),
    description: text('description'),
    type: text('type'),
    model: text('model'),
    system_prompt: text('system_prompt'),
    owner_id: integer('owner_id'),
    active: boolean('active'),
    created_at: timestamptz('created_at'),
    updated_at: timestamptz('updated_at'),
  })

  const knowledgeTable = pg.table('_knowledge_documents', {
    id: serial('id'),
    agent_id: integer('agent_id'),
    title: text('title'),
    content: text('content'),
    embedding: vector('embedding', dimension),
    metadata: jsonb('metadata'),
    created_at: timestamptz('created_at'),
  })

  const runner = createRunner({ sql, agents: agentsTable, knowledge: knowledgeTable, getModel, getEmbeddingModel, userTools: options.tools })

  const base = new PgModule(pg)

  return {
    migrate: () => runMigrations({ sql, embeddingDimension: dimension }),
    router: () => buildRouter({ sql, agents: agentsTable, runner }),
    run: (agentId: number, params) => runner.run(agentId, params),
    addKnowledge: (agentId: number, title: string, content: string) => runner.addKnowledge(agentId, title, content),
    close: () => base.close(),
  }
}
