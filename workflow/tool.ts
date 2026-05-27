import type { z } from 'zod'
import type { Tool, ToolContext } from './types.ts'

export function tool<TInput = unknown, TOutput = unknown>(def: {
  name?: string
  description: string
  inputSchema: z.ZodSchema<TInput>
  execute: (input: TInput, ctx: ToolContext) => Promise<TOutput>
}): Tool<TInput, TOutput> {
  return {
    name: def.name ?? '',
    description: def.description,
    inputSchema: def.inputSchema,
    execute: def.execute,
  }
}
