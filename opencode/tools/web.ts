import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './index.ts'

export function createWebTool(ctx: ToolContext) {
  return tool({
    description: 'Fetch a URL and return the content as text.',
    inputSchema: z.object({
      url: z.string().describe('The URL to fetch'),
    }),
    execute: async ({ url }) => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
        const contentType = response.headers.get('content-type') || ''
        const text = await response.text()
        return {
          content: text.slice(0, 100_000),
          url,
          contentType,
          truncated: text.length > 100_000,
          status: response.status,
        }
      } catch (e: any) {
        return { error: e.message, url, content: null }
      }
    },
  })
}
