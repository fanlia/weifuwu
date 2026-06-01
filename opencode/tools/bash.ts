import { tool } from 'ai'
import { z } from 'zod'
import { exec } from 'node:child_process'
import { isCommandAllowed } from '../permissions.ts'
import type { ToolContext } from './index.ts'

export function createBashTool(ctx: ToolContext) {
  return tool({
    description: 'Execute a shell command in the workspace directory. Returns stdout, stderr, and exit code.',
    inputSchema: z.object({
      command: z.string().describe('The shell command to execute'),
      timeout: z.number().default(30).describe('Timeout in seconds'),
      workdir: z.string().optional().describe('Subdirectory relative to workspace'),
    }),
    execute: async ({ command, timeout, workdir }) => {
      if (!isCommandAllowed(command)) {
        return { stdout: '', stderr: 'Command denied: potentially dangerous command', exitCode: 1 }
      }

      const cwd = workdir ? `${ctx.workspace}/${workdir}` : ctx.workspace

      return new Promise((resolve) => {
        const child = exec(command, { cwd, timeout: timeout * 1000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
          const truncated = stdout.length > 1_000_000 || stderr.length > 1_000_000
          resolve({
            stdout: stdout.slice(0, 1_000_000),
            stderr: stderr.slice(0, 1_000_000),
            exitCode: error?.code ?? 0,
            signal: error?.signal ?? null,
            truncated,
          })
        })
      })
    },
  })
}
