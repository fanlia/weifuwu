import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from '../vendor.ts'
import type { OpencodeOptions, OpencodeModule, PendingQuestion } from './types.ts'
import { migrate as runMigrations } from './migrate.ts'
import { buildRouter } from './rest.ts'
import { createWSHandler } from './ws.ts'

export function opencode(options: OpencodeOptions): OpencodeModule {
  const pg = options.pg
  const sql = pg.sql
  const baseURL = options.baseURL || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'
  const apiKey = options.apiKey || process.env.DEEPSEEK_API_KEY
  const workspace = options.workspace || process.cwd()
  const systemPrompt = options.systemPrompt
  const skills = options.skills || []
  const permissions = options.permissions
  const modelName = options.model || 'deepseek-v4-flash'

  const provider = createOpenAI({ baseURL, apiKey })
  const model: LanguageModel = provider.chat(modelName)

  const pendingQuestions: Map<string, PendingQuestion> = new Map()

  return {
    async migrate() {
      await runMigrations(sql)
    },

    async router() {
      return await buildRouter({ sql, model, workspace, systemPrompt, skills, permissions, pendingQuestions })
    },

    wsHandler() {
      return createWSHandler({ sql, model, workspace, systemPrompt, skills, permissions, pendingQuestions })
    },

    async close() {
      if (typeof pg.close === 'function') {
        await pg.close()
      }
    },
  }
}
