import { streamText } from 'ai'
import type { Context } from './types.ts'
import { Router } from './router.ts'

type StreamTextParams = Parameters<typeof streamText>[0]

export type AIHandler = (
  req: Request,
  ctx: Context,
) => StreamTextParams | Promise<StreamTextParams>

export function ai(handler: AIHandler): Router {
  const r = new Router()

  r.post('/', async (req, ctx) => {
    const options = await handler(req, ctx)
    const result = streamText(options)
    return result.toTextStreamResponse()
  })

  return r
}
