import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel, EmbeddingModel } from '../vendor.ts'
import type { AgentOptions, AgentModule } from './types.ts'
import { PgModule } from '../postgres/module.ts'
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

  const runner = createRunner({ sql, getModel, getEmbeddingModel, userTools: options.tools })

  const base = new PgModule(pg)

  return {
    migrate: () => runMigrations({ sql, embeddingDimension: dimension }),
    router: () => buildRouter({ sql, runner }),
    run: (agentId: number, params) => runner.run(agentId, params),
    addKnowledge: (agentId: number, title: string, content: string) => runner.addKnowledge(agentId, title, content),
    close: () => base.close(),
  }
}
