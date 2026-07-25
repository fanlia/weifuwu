/**
 * get-current-time skill — tool definitions and handlers
 */

import type { ToolDefinition } from '../../../src/ai/types.ts'
import type { Context } from 'weifuwu'

export const tools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: '获取当前日期和时间，当用户询问时间时使用',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
]

export function createHandlers(_ctxProvider: () => Context): Record<string, (args: Record<string, unknown>) => unknown | Promise<unknown>> {
  return {
    get_current_time: async (_args: Record<string, unknown>) => {
      const now = new Date()
      return now.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    },
  }
}
