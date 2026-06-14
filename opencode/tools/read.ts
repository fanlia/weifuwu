/* eslint-disable @typescript-eslint/no-explicit-any */
import { tool } from 'ai'
import { z } from 'zod'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isPathAllowed } from '../permissions.ts'
import type { ToolContext } from './index.ts'

export function createReadTool(ctx: ToolContext) {
  return tool({
    description: 'Read file contents. Supports offset and limit for reading specific line ranges.',
    inputSchema: z.object({
      path: z.string().describe('File path relative to workspace'),
      offset: z.number().optional().describe('Starting line number (1-indexed)'),
      limit: z.number().optional().describe('Number of lines to read'),
    }),
    execute: async ({ path, offset, limit }) => {
      const resolved = resolve(ctx.workspace, path)

      if (!isPathAllowed(resolved, ctx.workspace, (ctx as any).permissions.permissions)) {
        return { error: 'Path not allowed', content: null, totalLines: 0 }
      }

      const content = readFileSync(resolved, 'utf-8')
      const lines = content.split('\n')
      const totalLines = lines.length

      if (offset !== undefined) {
        const start = Math.max(0, offset - 1)
        const end = limit ? start + limit : undefined
        return {
          content: lines.slice(start, end).join('\n'),
          totalLines,
          linesReturned: end ? Math.min(end - start, lines.length - start) : lines.length - start,
        }
      }

      if (limit !== undefined) {
        return {
          content: lines.slice(0, limit).join('\n'),
          totalLines,
          linesReturned: Math.min(limit, lines.length),
        }
      }

      return { content, totalLines, linesReturned: lines.length }
    },
  })
}
