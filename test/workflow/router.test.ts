import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../../router.ts'
import { tool } from '../../workflow/tool.ts'
import { z } from 'zod'

const testTools = {
  echo: tool({
    description: 'returns the input as-is',
    inputSchema: z.object({ msg: z.string() }),
    execute: async ({ msg }) => ({ message: msg }),
  }),
}

describe('Router workflow integration', () => {
  it('executes workflow from nodes in POST body', async () => {
    const app = new Router()
    app.workflow('/test', { tools: testTools })

    const res = await app.handler()(
      new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: [
            { id: 's1', tool: 'set', input: { name: 'x', value: 42 } },
            { id: 'g1', tool: 'get', input: { name: 'x' } },
          ],
        }),
      }),
      { params: {}, query: {} },
    )

    assert.equal(res.status, 200)
    const body = await res.json() as any
    assert.equal(body.result, 42)
  })

  it('executes tool call workflow from POST body', async () => {
    const app = new Router()
    app.workflow('/call', { tools: testTools })

    const res = await app.handler()(
      new Request('http://localhost/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: [
            { id: 'c1', tool: 'call', input: { tool: 'echo', args: { msg: 'hello workflow' } } },
          ],
        }),
      }),
      { params: {}, query: {} },
    )

    assert.equal(res.status, 200)
    const body = await res.json() as any
    assert.equal(body.result.message, 'hello workflow')
  })

  it('returns 400 when no goal/nodes/workflow provided', async () => {
    const app = new Router()
    app.workflow('/test', { tools: testTools })
    const res = await app.handler()(
      new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: {}, query: {} },
    )
    assert.equal(res.status, 400)
  })

  it('works with middleware', async () => {
    let middlewareCalled = false
    const app = new Router()
    app.use('/api', async (req, ctx, next) => {
      middlewareCalled = true
      return next(req, ctx)
    })
    app.workflow('/api/run', { tools: testTools })

    await app.handler()(
      new Request('http://localhost/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: [{ id: 's1', tool: 'set', input: { name: 'x', value: 1 } }] }),
      }),
      { params: {}, query: {} },
    )

    assert.equal(middlewareCalled, true)
  })
})
