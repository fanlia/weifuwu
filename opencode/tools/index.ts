import type { Tool } from '../../vendor.ts'
import type { OpencodePermissions, SkillRegistry } from '../types.ts'
import { isToolEnabled } from '../permissions.ts'
import { createBashTool } from './bash.ts'
import { createReadTool } from './read.ts'
import { createWriteTool } from './write.ts'
import { createEditTool } from './edit.ts'
import { createGrepTool } from './grep.ts'
import { createGlobTool } from './glob.ts'
import { createWebTool } from './web.ts'
import { createQuestionTool } from './question.ts'
import { createSkillTool } from './skill.ts'

export interface ToolContext {
  workspace: string
  permissions?: OpencodePermissions
  pendingQuestions: Map<string, { resolve: (answer: string) => void; reject: (err: Error) => void }>
  skillsRegistry: SkillRegistry
}

export function createTools(ctx: ToolContext): Record<string, Tool> {
  const tools: Record<string, Tool> = {}

  if (isToolEnabled('bash', ctx.permissions)) {
    tools.bash = createBashTool(ctx)
  }
  if (isToolEnabled('read', ctx.permissions)) {
    tools.read = createReadTool(ctx)
  }
  if (isToolEnabled('write', ctx.permissions)) {
    tools.write = createWriteTool(ctx)
  }
  if (isToolEnabled('edit', ctx.permissions)) {
    tools.edit = createEditTool(ctx)
  }
  if (isToolEnabled('grep', ctx.permissions)) {
    tools.grep = createGrepTool(ctx)
  }
  if (isToolEnabled('glob', ctx.permissions)) {
    tools.glob = createGlobTool(ctx)
  }
  if (isToolEnabled('web', ctx.permissions)) {
    tools.web = createWebTool(ctx)
  }
  if (ctx.skillsRegistry.all.length > 0 && isToolEnabled('skill', ctx.permissions)) {
    tools.skill = createSkillTool(ctx)
  }

  tools.question = createQuestionTool(ctx)

  return tools
}
