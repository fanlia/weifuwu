import type { Context } from './types.ts'
import { Router } from './router.ts'

type StreamTextParams = {
  model: unknown
  prompt?: string
  system?: string
  messages?: unknown[]
  maxTokens?: number
  temperature?: number
  [key: string]: unknown
}

export type AIHandler = (
  req: Request,
  ctx: Context,
) => StreamTextParams | Promise<StreamTextParams>

export const _ai = {
  streamText: null as unknown as (params: StreamTextParams) => { toTextStreamResponse: () => Response },
}

export async function ai(handler: AIHandler): Promise<Router> {
  if (!_ai.streamText) {
    _ai.streamText = (await import('ai')).streamText as typeof _ai.streamText
  }

  const r = new Router()

  r.post('/', async (req, ctx) => {
    const options = await handler(req, ctx)
    const result = _ai.streamText(options)
    return result.toTextStreamResponse()
  })

  return r
}
