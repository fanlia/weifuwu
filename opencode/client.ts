import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'
import type { OpencodeOptions, OpencodeModule, SkillRegistry, PendingQuestion } from './types.ts'
import { PgModule } from '../postgres/module.ts'
import { uuid, serial, text, integer, boolean, timestamptz, jsonb, sql as schemaSql } from '../postgres/schema/index.ts'
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

  const r = await buildRouter({ sql, model, workspace, systemPrompt, skills: manualSkills, skillsRegistry, permissions, pendingQuestions })
  const mod = r as OpencodeModule
  mod.migrate = async () => {
    const sessions = pg.table('_opencode_sessions', {
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
    await sessions.create()
    await sessions.createIndex('user_id')

    const messages = pg.table('_opencode_messages', {
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
    await messages.create()
    await messages.createIndex(['session_id', 'created_at'])
  }
  mod.wsHandler = () => createWSHandler({ sql, model, workspace, systemPrompt, skills: manualSkills, skillsRegistry, permissions, pendingQuestions })
  mod.close = () => base.close()
  return mod
}
