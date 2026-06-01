import { tool } from 'ai'
import { z } from 'zod'
import { isSkillAllowed } from '../permissions.ts'
import type { ToolContext } from './index.ts'

export function createSkillTool(ctx: ToolContext) {
  const skills = ctx.skillsRegistry.list()

  const availableList = skills.map(s =>
    `  <skill>\n    <name>${s.name}</name>\n    <description>${s.description}</description>\n  </skill>`
  ).join('\n')

  const description = availableList
    ? `Load a skill by name to get specialized instructions.\n\n<available_skills>\n${availableList}\n</available_skills>`
    : 'No skills available.'

  return tool({
    description,
    inputSchema: z.object({
      name: z.string().describe('The name of the skill to load'),
    }),
    execute: async ({ name }) => {
      if (!isSkillAllowed(name, ctx.permissions)) {
        return { error: `Skill "${name}" is not permitted` }
      }

      const skill = ctx.skillsRegistry.get(name)
      if (!skill) {
        return { error: `Skill "${name}" not found` }
      }

      return {
        name: skill.name,
        description: skill.description,
        content: skill.content,
        license: skill.license ?? null,
        compatibility: skill.compatibility ?? null,
      }
    },
  })
}
