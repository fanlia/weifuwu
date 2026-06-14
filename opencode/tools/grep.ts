import { tool } from 'ai'
import { z } from 'zod'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import type { ToolContext } from './index.ts'

export function createGrepTool(ctx: ToolContext) {
  return tool({
    description:
      'Search file contents using regex. Supports file type filtering and context lines.',
    inputSchema: z.object({
      pattern: z.string().describe('The regex pattern to search for'),
      include: z.string().optional().describe('File glob filter (e.g. "*.ts")'),
      path: z.string().optional().describe('Subdirectory relative to workspace'),
      context: z
        .number()
        .default(0)
        .describe('Number of context lines before and after each match'),
    }),
    execute: async ({ pattern, include, path, context }) => {
      const searchDir = path ? resolve(ctx.workspace, path) : ctx.workspace

      try {
        let stdout: string
        if (existsSync('/usr/bin/rg') || existsSync('/usr/local/bin/rg')) {
          const args = ['-n']
          if (context > 0) args.push('-C', String(context))
          if (include) args.push('-g', include)
          args.push(pattern, searchDir)
          stdout = execFileSync('rg', args, { timeout: 15000, maxBuffer: 1024 * 1024 }).toString()
        } else {
          const args = ['-rn']
          if (context > 0) args.push('-C', String(context))
          if (include) args.push('--include', include)
          args.push(pattern, searchDir)
          stdout = execFileSync('grep', args, { timeout: 15000, maxBuffer: 1024 * 1024 }).toString()
        }
        const lines = stdout.split('\n').filter(Boolean)
        return {
          matches: lines.length,
          results: lines.slice(0, 200),
          truncated: lines.length > 200,
        }
      } catch (e: any) {
        if (e.status === 1) {
          return { matches: 0, results: [], truncated: false }
        }
        return { error: e.stderr?.toString() || e.message, matches: 0, results: [] }
      }
    },
  })
}
