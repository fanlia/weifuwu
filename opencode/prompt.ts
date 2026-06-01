import type { SkillDef } from './types.ts'

export interface PromptOptions {
  workspace: string
  model: string
  skills: SkillDef[]
  systemPrompt?: string
}

export function buildSystemPrompt(opts: PromptOptions): string {
  const lines: string[] = [
    'You are weifuwu Opencode — an AI programming assistant running in the cloud.',
    '',
    `Workspace: ${opts.workspace}`,
    `Model: ${opts.model}`,
    '',
    'You have access to a set of tools to read, write, search, and execute commands.',
    'Use tools step by step. After each tool call, analyze the result before deciding the next action.',
    '',
  ]

  if (opts.skills.length > 0) {
    lines.push('=== Skills ===')
    lines.push('The following skills are relevant to this task. Use them when appropriate.')
    lines.push('')
    for (const skill of opts.skills) {
      lines.push(`## ${skill.name}`)
      if (skill.description) lines.push(`Description: ${skill.description}`)
      lines.push('')
      lines.push(skill.content)
      lines.push('')
    }
  }

  if (opts.systemPrompt) {
    lines.push('=== Additional Instructions ===')
    lines.push(opts.systemPrompt)
    lines.push('')
  }

  return lines.join('\n')
}
