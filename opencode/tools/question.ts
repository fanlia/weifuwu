import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './index.ts'

export function createQuestionTool(ctx: ToolContext) {
  return tool({
    description: 'Ask the user a question when you need more information to proceed.',
    inputSchema: z.object({
      question: z.string().describe('The question to ask the user'),
      options: z.array(z.string()).optional().describe('Optional multiple choice options'),
    }),
    execute: async ({ question, options }, { toolCallId }) => {
      return new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          ctx.pendingQuestions.delete(toolCallId)
          reject(new Error('Question timed out'))
        }, 300_000)

        ctx.pendingQuestions.set(toolCallId, {
          resolve: (answer: string) => {
            clearTimeout(timeout)
            resolve(answer)
          },
          reject: (err: Error) => {
            clearTimeout(timeout)
            reject(err)
          },
        })
      })
    },
  })
}
