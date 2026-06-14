/* eslint-disable @typescript-eslint/no-explicit-any */
import { tool } from 'ai'
import { z } from 'zod'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isPathAllowed } from '../permissions.ts'
import type { ToolContext } from './index.ts'

export function createEditTool(ctx: ToolContext) {
  return tool({
    description:
      'Perform exact string replacements in a file. If oldString appears multiple times, provide more surrounding context.',
    inputSchema: z.object({
      path: z.string().describe('File path relative to workspace'),
      oldString: z.string().describe('The exact text to replace'),
      newString: z.string().describe('The replacement text'),
      replaceAll: z.boolean().default(false).describe('Replace all occurrences'),
    }),
    execute: async ({ path, oldString, newString, replaceAll }) => {
      const resolved = resolve(ctx.workspace, path)

      if (!isPathAllowed(resolved, ctx.workspace, (ctx as any).permissions.permissions)) {
        return { error: 'Path not allowed' }
      }

      const content = readFileSync(resolved, 'utf-8')

      if (replaceAll) {
        if (!content.includes(oldString)) {
          return { error: 'oldString not found in file', replaced: 0 }
        }
        const count = content.split(oldString).length - 1
        const result = content.replaceAll(oldString, newString)
        writeFileSync(resolved, result, 'utf-8')
        return { path, replaced: count }
      }

      const firstIdx = content.indexOf(oldString)
      if (firstIdx === -1) {
        return { error: 'oldString not found in file', replaced: 0 }
      }
      const secondIdx = content.indexOf(oldString, firstIdx + 1)
      if (secondIdx !== -1) {
        return {
          error: 'Found multiple matches. Provide more surrounding context in oldString.',
          replaced: 0,
        }
      }

      const result = content.replace(oldString, newString)
      writeFileSync(resolved, result, 'utf-8')
      return { path, replaced: 1 }
    },
  })
}
