import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'
import type { OpencodeOptions, OpencodeModule, SkillRegistry, PendingQuestion } from './types.ts'
import { PgModule } from '../postgres/module.ts'
import { migrate as runMigrations } from './migrate.ts'
import { buildRouter } from './rest.ts'
import { createWSHandler } from './ws.ts'
import { discoverSkills, buildSkillRegistry } from './skills.ts'

export async function opencode(options: OpencodeOptions): Promise<OpencodeModule> {
  const pg = options.pg
  const sql = pg.sql
  const baseURL = options.baseURL || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'
  const apiKey = options.apiKey || process.env.DEEPSEEK_API_KEY
  const workspace = options.workspace || process.cwd()
  const systemPrompt = options.systemPrompt
  const manualSkills = options.skills || []
  const permissions = options.permissions
  const modelName = options.model || 'deepseek-v4-flash'

  const [discoveredSkills] = await Promise.all([discoverSkills(workspace)])
  const skillsRegistry: SkillRegistry = buildSkillRegistry(discoveredSkills, manualSkills)

  const provider = createOpenAI({ baseURL, apiKey })
  const model: LanguageModel = provider.chat(modelName)

  const pendingQuestions: Map<string, PendingQuestion> = new Map()

  const base = new PgModule(pg)

  return {
    migrate: () => runMigrations(sql),
    router: () => buildRouter({ sql, model, workspace, systemPrompt, skills: manualSkills, skillsRegistry, permissions, pendingQuestions }),
    wsHandler: () => createWSHandler({ sql, model, workspace, systemPrompt, skills: manualSkills, skillsRegistry, permissions, pendingQuestions }),
    close: () => base.close(),
  }
}
