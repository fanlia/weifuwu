import type { Context } from './types.ts'
import { Router } from './router.ts'

export type AIHandler = (
  req: Request,
  ctx: Context,
) => Record<string, unknown> | Promise<Record<string, unknown>>

export const _ai: Record<string, any> = {}

async function getStreamText() {
  if (!_ai.streamText) _ai.streamText = (await import('ai')).streamText
  return _ai.streamText
}

async function getStreamObject() {
  if (!_ai.streamObject) _ai.streamObject = (await import('ai')).streamObject
  return _ai.streamObject
}

export async function aiStream(handler: AIHandler): Promise<{ router(): Router }> {
  const r = new Router()

  r.post('/', async (req, ctx) => {
    const options = await handler(req, ctx)

    if (options.schema) {
      const streamObject = await getStreamObject()
      const { schema, ...params } = options
      const result = streamObject({ ...params, schema: schema as any, output: 'object' as const })
      return result.toTextStreamResponse()
    }

    const streamText = await getStreamText()
    const result = streamText(options)
    return result.toTextStreamResponse()
  })

  return { router: () => r }
}
