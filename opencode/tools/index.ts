/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Tool } from 'ai'
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

  if (isToolEnabled('bash', (ctx as any).permissions.permissions)) {
    tools.bash = createBashTool(ctx)
  }
  if (isToolEnabled('read', (ctx as any).permissions.permissions)) {
    tools.read = createReadTool(ctx)
  }
  if (isToolEnabled('write', (ctx as any).permissions.permissions)) {
    tools.write = createWriteTool(ctx)
  }
  if (isToolEnabled('edit', (ctx as any).permissions.permissions)) {
    tools.edit = createEditTool(ctx)
  }
  if (isToolEnabled('grep', (ctx as any).permissions.permissions)) {
    tools.grep = createGrepTool(ctx)
  }
  if (isToolEnabled('glob', (ctx as any).permissions.permissions)) {
    tools.glob = createGlobTool(ctx)
  }
  if (isToolEnabled('web', (ctx as any).permissions.permissions)) {
    tools.web = createWebTool(ctx)
  }
  if (
    ctx.skillsRegistry.all.length > 0 &&
    isToolEnabled('skill', (ctx as any).permissions.permissions)
  ) {
    tools.skill = createSkillTool(ctx)
  }

  tools.question = createQuestionTool(ctx)

  return tools
}
