import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createSSEManager } from '../../workflow/sse.ts'
import { createWorkflowEngine } from '../../workflow/engine.ts'
import { tool } from '../../workflow/tool.ts'
import { z } from 'zod'

const tools = {
  echo: tool({
    description: 'echo',
    inputSchema: z.object({ msg: z.string() }),
    execute: async ({ msg }) => ({ message: msg }),
  }),
}

describe('createSSEManager', () => {
  it('creates a ReadableStream', () => {
    const sse = createSSEManager()
    const stream = sse.createStream('test-1')
    assert.ok(stream instanceof ReadableStream)
    sse.close('test-1')
  })

  it('sends events to the stream', async () => {
    const sse = createSSEManager()
    const stream = sse.createStream('test-2')

    sse.send('test-2', { event: 'hello', data: { msg: 'world' } })
    sse.close('test-2')

    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let result = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      result += decoder.decode(value, { stream: true })
    }

    assert.ok(result.includes('event: hello'))
    assert.ok(result.includes('"msg":"world"'))
  })
})

describe('engine runAsync with SSE', () => {
  it('executes workflow and sends events', async () => {
    const sse = createSSEManager()
    const engine = createWorkflowEngine({ tools, sseManager: sse })

    const wfId = 'async-test-1'
    const stream = sse.createStream(wfId)

    const readPromise = (async () => {
      const reader = stream.getReader()
      const decoder = new TextDecoder()
      let result = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        result += decoder.decode(value, { stream: true })
      }
      return result
    })()

    await engine.runAsync(wfId, {
      name: 'test',
      nodes: [
        { id: 's1', tool: 'set', input: { name: 'x', value: 42 } },
      ],
    })

    const result = await readPromise

    assert.ok(result.includes('event: workflow-start'))
    assert.ok(result.includes('event: node-start'))
    assert.ok(result.includes('event: node-end'))
    assert.ok(result.includes('event: complete'))

    const state = engine.getState(wfId)
    assert.equal(state?.status, 'completed')
    assert.equal(state?.result, 42)
  })

  it('sends error event on failure', async () => {
    const sse = createSSEManager()
    const engine = createWorkflowEngine({ tools, sseManager: sse })

    const wfId = 'async-test-2'
    const stream = sse.createStream(wfId)

    const readPromise = (async () => {
      const reader = stream.getReader()
      const decoder = new TextDecoder()
      let result = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        result += decoder.decode(value, { stream: true })
      }
      return result
    })()

    await engine.runAsync(wfId, {
      nodes: [
        { id: 'bad', tool: 'nonexistent', input: {} },
      ],
    })

    const result = await readPromise
    assert.ok(result.includes('event: error'))

    const state = engine.getState(wfId)
    assert.equal(state?.status, 'error')
  })
})
