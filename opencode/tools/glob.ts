import { tool } from 'ai'
import { z } from 'zod'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import type { ToolContext } from './index.ts'

export function createGlobTool(ctx: ToolContext) {
  return tool({
    description: 'Find files matching a glob pattern.',
    inputSchema: z.object({
      pattern: z.string().describe('Glob pattern (e.g. "src/**/*.ts")'),
      path: z.string().optional().describe('Subdirectory relative to workspace'),
    }),
    execute: async ({ pattern, path }) => {
      const searchDir = path ? resolve(ctx.workspace, path) : ctx.workspace

      try {
        const stdout = execFileSync(
          'find',
          [searchDir, '-name', pattern, '-not', '-path', '*/node_modules/*'],
          {
            timeout: 10000,
            maxBuffer: 1024 * 1024,
          },
        ).toString()

        const lines = stdout.split('\n').filter(Boolean).slice(0, 200)
        return {
          files: lines,
          total: lines.length,
          truncated: stdout.split('\n').filter(Boolean).length > 200,
        }
      } catch {
        return { files: [], total: 0, truncated: false }
      }
    },
  })
}
