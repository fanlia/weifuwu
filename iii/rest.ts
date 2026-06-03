import { Router } from '../router.ts'
import type { IIIModule } from './types.ts'

export function buildRouter(engine: IIIModule, wsHandler: any): Router {
  const r = new Router()

  r.get('/workers', () => {
    return Response.json(engine.listWorkers())
  })

  r.get('/functions', () => {
    return Response.json(engine.listFunctions())
  })

  r.get('/triggers', () => {
    return Response.json(engine.listTriggers())
  })

  r.post('/trigger/:functionId', async (req, ctx) => {
    let body: any
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    const { payload, action, timeout_ms } = body

    try {
      const result = await engine.trigger({
        function_id: ctx.params.functionId,
        payload: payload ?? {},
        action: action ?? 'sync',
        timeout_ms,
      })

      if (action === 'void') {
        return Response.json({ status: 'accepted' }, { status: 202 })
      }

      return Response.json(result)
    } catch (err: any) {
      return Response.json(
        { error: err.message || 'Internal error' },
        { status: 500 },
      )
    }
  })

  r.ws('/worker', wsHandler)

  return r
}
