/* eslint-disable @typescript-eslint/no-explicit-any */
import { tool } from 'ai'
import { z } from 'zod'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { isPathAllowed } from '../permissions.ts'
import type { ToolContext } from './index.ts'

export function createWriteTool(ctx: ToolContext) {
  return tool({
    description: 'Create or overwrite a file. Parent directories are created automatically.',
    inputSchema: z.object({
      path: z.string().describe('File path relative to workspace'),
      content: z.string().describe('File content'),
    }),
    execute: async ({ path, content }) => {
      const resolved = resolve(ctx.workspace, path)

      if (!isPathAllowed(resolved, ctx.workspace, (ctx as any).permissions.permissions)) {
        return { error: 'Path not allowed' }
      }

      mkdirSync(dirname(resolved), { recursive: true })
      writeFileSync(resolved, content, 'utf-8')

      return { path, size: content.length }
    },
  })
}
