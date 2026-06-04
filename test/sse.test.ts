import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatSSE, formatSSEData, createSSEStream } from '../sse.ts'

describe('sse', () => {
  it('formatSSE', () => {
    const result = formatSSE('message', { text: 'hello' })
    assert.equal(result, 'event: message\ndata: {"text":"hello"}\n\n')
  })

  it('formatSSEData', () => {
    const result = formatSSEData({ text: 'hello' })
    assert.equal(result, 'data: {"text":"hello"}\n\n')
  })

  it('createSSEStream returns a Response with correct headers', () => {
    async function* gen() {
      yield { type: 'message', text: 'hello' }
    }
    const res = createSSEStream(gen())
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('Content-Type'), 'text/event-stream')
    assert.equal(res.headers.get('Cache-Control'), 'no-cache')
  })

  it('createSSEStream supports custom headers and status', () => {
    async function* gen() {
      yield { type: 'message', text: 'hello' }
    }
    const res = createSSEStream(gen(), {
      status: 201,
      headers: { 'X-Custom': 'val' },
    })
    assert.equal(res.status, 201)
    assert.equal(res.headers.get('X-Custom'), 'val')
  })

  it('createSSEStream emits SSE events', async () => {
    async function* gen() {
      yield { type: 'message', text: 'hello' }
    }
    const res = createSSEStream(gen())
    const text = await res.text()
    assert.match(text, /event: message/)
    assert.match(text, /data: {"type":"message","text":"hello"}/)
  })

  it('createSSEStream uses formatSSEData when no type field', async () => {
    async function* gen() {
      yield { text: 'hello' }
    }
    const res = createSSEStream(gen())
    const text = await res.text()
    assert.match(text, /^data: {"text":"hello"}\n\n$/)
  })
})
