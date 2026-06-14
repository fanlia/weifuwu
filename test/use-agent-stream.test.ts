import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import './setup.ts'
import { createElement } from 'react'
import { renderHook } from './react-harness.ts'
import { useAgentStream } from '../use-agent-stream.ts'
import type { UseAgentStreamReturn, MockWebSocket } from './setup.ts'

/** Wait for React effects to flush, then get the mock WS. */
async function getMockWs(): Promise<MockWebSocket> {
  await new Promise(r => setTimeout(r, 50))
  const ws = (globalThis as any).__lastMockWs as MockWebSocket | undefined
  if (!ws) throw new Error('WebSocket not created — did the hook mount?')
  return ws
}

void describe('useAgentStream', () => {
  it('exports expected function', () => {
    assert.equal(typeof useAgentStream, 'function')
  })

  it('returns expected shape on initial render', async () => {
    let result!: UseAgentStreamReturn

    function TestComponent() {
      result = useAgentStream({ wsPath: '/test', channelId: 1 })
      return null
    }

    renderHook(TestComponent)
    await getMockWs()

    assert.equal(typeof result.stream, 'object')
    assert.equal(typeof result.stream.streams, 'object')
    assert.equal(result.stream.streaming, false)
    assert.equal(result.stream.activeAgents instanceof Set, true)
    assert.equal(result.stream.activeAgents.size, 0)
    assert.equal(typeof result.getAgentText, 'function')
    assert.equal(typeof result.isAgentStreaming, 'function')
    assert.equal(result.getAgentText(1), '')
    assert.equal(result.isAgentStreaming(1), false)
  })

  it('accumulates tokens from agent_stream messages', async () => {
    let result!: UseAgentStreamReturn

    function TestComponent() {
      result = useAgentStream({ wsPath: '/test-acc', channelId: 1 })
      return null
    }

    renderHook(TestComponent)
    const ws = await getMockWs()
    ws.connect()

    ws.simulateMessage(JSON.stringify({
      type: 'agent_stream',
      data: { agent_id: 1, token: 'Hello ' },
    }))
    ws.simulateMessage(JSON.stringify({
      type: 'agent_stream',
      data: { agent_id: 1, token: 'World' },
    }))

    await new Promise(r => setTimeout(r, 50))

    assert.equal(result.getAgentText(1), 'Hello World')
    assert.equal(result.isAgentStreaming(1), true)
  })

  it('handles agent_stream_end correctly', async () => {
    let result!: UseAgentStreamReturn
    let endedAgentId: number | undefined
    let endedText: string | undefined

    function TestComponent() {
      result = useAgentStream({
        wsPath: '/test-end',
        channelId: 1,
        onStreamEnd: (agentId, fullText) => {
          endedAgentId = agentId
          endedText = fullText
        },
      })
      return null
    }

    renderHook(TestComponent)
    const ws = await getMockWs()
    ws.connect()

    ws.simulateMessage(JSON.stringify({
      type: 'agent_stream',
      data: { agent_id: 2, token: 'Done' },
    }))

    ws.simulateMessage(JSON.stringify({
      type: 'agent_stream_end',
      data: { agent_id: 2 },
    }))

    await new Promise(r => setTimeout(r, 50))

    assert.equal(result.getAgentText(2), 'Done')
    assert.equal(result.isAgentStreaming(2), false)
    assert.equal(endedAgentId, 2)
    assert.equal(endedText, 'Done')
  })

  it('handles agent_error correctly', async () => {
    let result!: UseAgentStreamReturn
    let errorAgentId: number | undefined
    let errorMsg: string | undefined

    function TestComponent() {
      result = useAgentStream({
        wsPath: '/test-err',
        channelId: 1,
        onError: (agentId, error) => {
          errorAgentId = agentId
          errorMsg = error
        },
      })
      return null
    }

    renderHook(TestComponent)
    const ws = await getMockWs()
    ws.connect()

    ws.simulateMessage(JSON.stringify({
      type: 'agent_error',
      data: { agent_id: 3, error: 'Something broke' },
    }))

    await new Promise(r => setTimeout(r, 50))

    assert.equal(result.isAgentStreaming(3), false)
    assert.equal(errorAgentId, 3)
    assert.equal(errorMsg, 'Something broke')
  })

  it('ignores non-stream messages', async () => {
    let result!: UseAgentStreamReturn

    function TestComponent() {
      result = useAgentStream({ wsPath: '/test-ign', channelId: 1 })
      return null
    }

    renderHook(TestComponent)
    const ws = await getMockWs()
    ws.connect()

    ws.simulateMessage(JSON.stringify({ type: 'chat_message', data: { text: 'hi' } }))
    ws.simulateMessage('not json')
    ws.simulateMessage(JSON.stringify({}))

    await new Promise(r => setTimeout(r, 50))

    assert.equal(result.getAgentText(1), '')
    assert.equal(result.isAgentStreaming(1), false)
  })
})
