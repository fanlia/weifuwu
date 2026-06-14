import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '../types.ts'

const fakeStreamResponse = new Response('stream data', {
  headers: { 'content-type': 'text/event-stream' },
})

describe('aiStream', () => {
  it('calls streamText with handler options and returns response', async () => {
    const { _ai, aiStream } = await import('../ai.ts')
    const streamTextMock = mock.fn(() => ({
      toTextStreamResponse: () => fakeStreamResponse,
    }))
    _ai.streamText = streamTextMock

    const m = await aiStream(async () => ({ model: 'gpt-4', prompt: 'hi' }))

    const res = await m.handler()(
      new Request('http://localhost/', { method: 'POST', body: '{}' }),
      { params: {}, query: {} } as Context,
    )

    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'stream data')
    assert.equal(streamTextMock.mock.callCount(), 1)
    assert.deepStrictEqual(streamTextMock.mock.calls[0]!.arguments[0], {
      model: 'gpt-4',
      prompt: 'hi',
    })
  })

  it('returns 500 when handler throws', async () => {
    const { _ai, aiStream } = await import('../ai.ts')
    _ai.streamText = mock.fn(() => ({ toTextStreamResponse: () => new Response() }))

    const m = await aiStream(async () => {
      throw new Error('fail')
    })

    const res = await m.handler()(
      new Request('http://localhost/', { method: 'POST', body: '{}' }),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 500)
  })

  it('returns 405 for GET request', async () => {
    const { _ai, aiStream } = await import('../ai.ts')
    _ai.streamText = mock.fn(() => ({ toTextStreamResponse: () => new Response() }))

    const m = await aiStream(async () => ({ model: 'test', prompt: 'x' }))

    const res = await m.handler()(new Request('http://localhost/', { method: 'GET' }), {
      params: {},
      query: {},
    } as Context)
    assert.equal(res.status, 405)
    assert.equal(res.headers.get('Allow'), 'POST')
  })

  it('handler receives request and context', async () => {
    const { _ai, aiStream } = await import('../ai.ts')
    _ai.streamText = mock.fn(() => ({ toTextStreamResponse: () => new Response() }))

    let receivedReq: Request | null = null
    let receivedCtx: Context | null = null
    const m = await aiStream(async (req, ctx) => {
      receivedReq = req
      receivedCtx = ctx
      return { model: 'gpt-4', prompt: 'test' }
    })

    const testCtx = { params: { id: '1' }, query: { q: 'test' } } as Context
    await m.handler()(new Request('http://localhost/', { method: 'POST', body: '{}' }), testCtx)

    assert.ok(receivedReq)
    assert.equal(receivedReq!.method, 'POST')
    assert.equal(receivedCtx!.params.id, '1')
    assert.equal(receivedCtx!.query.q, 'test')
  })

  it('uses streamObject when handler returns schema', async () => {
    const { _ai, aiStream } = await import('../ai.ts')
    const fos = new Response('object-stream', { headers: { 'content-type': 'text/event-stream' } })
    const streamObjectMock = mock.fn(() => ({
      toTextStreamResponse: () => fos,
    }))
    _ai.streamObject = streamObjectMock
    _ai.streamText = mock.fn(() => ({ toTextStreamResponse: () => new Response() }))

    const m = await aiStream(async () => ({
      model: 'gpt-4',
      prompt: 'hi',
      schema: { type: 'object' },
    }))

    const res = await m.handler()(
      new Request('http://localhost/', { method: 'POST', body: '{}' }),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'object-stream')
  })

  it('lazy-loads streamText when not pre-populated', async () => {
    const { _ai, aiStream } = await import('../ai.ts')
    delete _ai.streamText
    const m = await aiStream(async () => ({ model: 'test', prompt: 'x' }))

    const res = await m.handler()(
      new Request('http://localhost/', { method: 'POST', body: '{}' }),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 200)
  })
})
