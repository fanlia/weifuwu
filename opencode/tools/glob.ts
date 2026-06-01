import { tool } from 'ai'
import { z } from 'zod'
import { execSync } from 'node:child_process'
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
        const stdout = execSync(`find '${searchDir}' -name '${pattern.replace(/'/g, "'\\''")}' -not -path '*/node_modules/*' 2>/dev/null | head -200`, {
          timeout: 10000,
          maxBuffer: 1024 * 1024,
        }).toString()

        const files = stdout.split('\n').filter(Boolean)
        return { files, total: files.length, truncated: files.length >= 200 }
      } catch {
        return { files: [], total: 0, truncated: false }
      }
    },
  })
}
