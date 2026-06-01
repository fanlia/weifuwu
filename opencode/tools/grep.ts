import { tool } from 'ai'
import { z } from 'zod'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import type { ToolContext } from './index.ts'

export function createGrepTool(ctx: ToolContext) {
  return tool({
    description: 'Search file contents using regex. Supports file type filtering and context lines.',
    inputSchema: z.object({
      pattern: z.string().describe('The regex pattern to search for'),
      include: z.string().optional().describe('File glob filter (e.g. "*.ts")'),
      path: z.string().optional().describe('Subdirectory relative to workspace'),
      context: z.number().default(0).describe('Number of context lines before and after each match'),
    }),
    execute: async ({ pattern, include, path, context }) => {
      const searchDir = path ? resolve(ctx.workspace, path) : ctx.workspace
      const contextArg = context > 0 ? `-C ${context}` : ''

      let cmd: string
      if (existsSync('/usr/bin/rg') || existsSync('/usr/local/bin/rg')) {
        cmd = `rg -n ${contextArg} ${include ? `-g '${include}'` : ''} '${pattern.replace(/'/g, "'\\''")}' '${searchDir}'`
      } else {
        cmd = `grep -rn ${contextArg} ${include ? `--include='${include}'` : ''} '${pattern.replace(/'/g, "'\\''")}' '${searchDir}'`
      }

      try {
        const stdout = execSync(cmd, { timeout: 15000, maxBuffer: 1024 * 1024 }).toString()
        const lines = stdout.split('\n').filter(Boolean)
        return { matches: lines.length, results: lines.slice(0, 200), truncated: lines.length > 200 }
      } catch (e: any) {
        if (e.status === 1) {
          return { matches: 0, results: [], truncated: false }
        }
        return { error: e.stderr?.toString() || e.message, matches: 0, results: [] }
      }
    },
  })
}
