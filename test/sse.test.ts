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

  it('createSSEStream uses formatSSEData when type is empty string', async () => {
    async function* gen() {
      yield { type: '', text: 'hello' }
    }
    const res = createSSEStream(gen())
    const text = await res.text()
    assert.match(text, /^data: {"type":"","text":"hello"}\n\n$/)
  })

  it('createSSEStream uses formatSSEData when type is null', async () => {
    async function* gen() {
      yield { type: null, text: 'hello' }
    }
    const res = createSSEStream(gen())
    const text = await res.text()
    assert.match(text, /^data: {"type":null,"text":"hello"}\n\n$/)
  })

  it('createSSEStream emits multiple events', async () => {
    async function* gen() {
      yield { type: 'msg', text: 'first' }
      yield { type: 'msg', text: 'second' }
    }
    const res = createSSEStream(gen())
    const text = await res.text()
    assert.match(
      text,
      /event: msg\ndata: {"type":"msg","text":"first"}\n\nevent: msg\ndata: {"type":"msg","text":"second"}\n\n/,
    )
  })

  it('createSSEStream closes immediately for empty iterable', async () => {
    async function* gen() {}
    const res = createSSEStream(gen())
    const text = await res.text()
    assert.equal(text, '')
  })

  it('createSSEStream sends error SSE on non-AbortError exception', async () => {
    async function* gen() {
      yield { type: 'msg', text: 'before-error' }
      throw new Error('something broke')
    }
    const res = createSSEStream(gen())
    const text = await res.text()
    assert.match(text, /event: msg/)
    assert.match(text, /event: error/)
    assert.match(text, /something broke/)
  })

  it('createSSEStream silently swallows AbortError', async () => {
    async function* gen() {
      yield { type: 'msg', text: 'before-abort' }
      const err = new Error('cancelled')
      err.name = 'AbortError'
      throw err
    }
    const res = createSSEStream(gen())
    const text = await res.text()
    assert.match(text, /event: msg/)
    assert.match(text, /before-abort/)
    // AbortError should be swallowed, no error event
    assert.doesNotMatch(text, /event: error/)
  })
})
