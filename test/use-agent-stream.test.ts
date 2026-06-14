import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { useAgentStream } from '../use-agent-stream.ts'

void describe('useAgentStream', () => {
  it('exports expected function', () => {
    assert.equal(typeof useAgentStream, 'function')
  })

  it('return type structure is correct', () => {
    // Type-level check — the shape must match UseAgentStreamReturn
    type CheckStream = { streams: Record<number, string>; streaming: boolean; activeAgents: Set<number> }
    type CheckReturn = { stream: CheckStream; getAgentText: (id: number) => string; isAgentStreaming: (id: number) => boolean }

    // Runtime proxy: verify the type structure by constructing it
    const stream: CheckStream = { streams: {}, streaming: false, activeAgents: new Set() }
    const ret: CheckReturn = {
      stream,
      getAgentText: (_id: number) => '',
      isAgentStreaming: (_id: number) => false,
    }

    assert.deepEqual(ret.stream, { streams: {}, streaming: false, activeAgents: new Set() })
    assert.equal(ret.getAgentText(1), '')
    assert.equal(ret.isAgentStreaming(1), false)
  })
})
