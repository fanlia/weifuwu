import type { Middleware } from '../types.ts'
import type { AiOptions, GenerateTextParams } from './types.ts'

export type { AiOptions, Ai } from './types.ts'

/**
 * AI middleware — injects `ctx.ai` for LLM integration via the Vercel AI SDK.
 *
 * Requires a language model provider (e.g. `@ai-sdk/openai`, `@ai-sdk/anthropic`).
 *
 * @example
 * ```ts
 * import { ai } from 'weifuwu'
 * import { openai } from '@ai-sdk/openai'
 *
 * app.use(ai({
 *   model: openai('gpt-4o'),
 *   system: 'You are a helpful assistant.',
 * }))
 *
 * app.post('/api/chat', async (req, ctx) => {
 *   const { prompt } = await req.json()
 *   const result = await ctx.ai.generateText({ prompt })
 *   return Response.json({ text: result.text })
 * })
 * ```
 */
export function ai(opts: AiOptions): Middleware {
  let aiModule: typeof import('ai') | null = null
  const model = opts.model

  async function getAi() {
    if (!aiModule) aiModule = await import('ai')
    return aiModule
  }

  return async (_req, ctx, next) => {
    ctx.ai = {
      model,
      system: opts.system,

      async generateText(params: GenerateTextParams) {
        const { generateText } = await getAi()

        const messages: any[] = [...(params.messages ?? [])]
        const system = params.system ?? opts.system

        if (system) {
          const hasSystem = messages.some(m => m.role === 'system')
          if (!hasSystem) {
            messages.unshift({ role: 'system', content: system })
          }
        }

        const baseOpts: any = {
          model: model,
          tools: opts.tools,
          maxSteps: params.maxSteps ?? opts.maxSteps ?? 1,
          temperature: params.temperature ?? opts.temperature,
          maxTokens: params.maxTokens ?? opts.maxTokens,
          abortSignal: _req.signal,
        }

        if (messages.length > 0) {
          baseOpts.messages = messages
        } else {
          baseOpts.prompt = params.prompt
        }

        return generateText(baseOpts as any)
      },
    }

    return next(_req, ctx)
  }
}
