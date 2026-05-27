import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { createWorkflowEngine } from '../../workflow/engine.ts'
import { tool } from '../../workflow/tool.ts'

const tools = {
  add: tool({
    description: '加法',
    inputSchema: z.object({ a: z.number(), b: z.number() }),
    execute: async ({ a, b }) => a + b,
  }),
  double: tool({
    description: '翻倍',
    inputSchema: z.object({ x: z.number() }),
    execute: async ({ x }) => x * 2,
  }),
}

const engine = createWorkflowEngine({ tools })

describe('createWorkflowEngine', () => {
  it('executes linear workflow', async () => {
    const result = await engine.execute({
      nodes: [
        { id: 's1', tool: 'set', input: { name: 'a', value: 10 } },
        { id: 's2', tool: 'set', input: { name: 'b', value: 20 } },
        { id: 'c1', tool: 'call', input: { tool: 'add', args: { a: '$var.a', b: '$var.b' } } },
      ],
    })
    assert.equal(result, 30)
  })

  it('executes call tool with direct values', async () => {
    const result = await engine.execute({
      nodes: [
        { id: 'c1', tool: 'call', input: { tool: 'double', args: { x: 21 } } },
      ],
    })
    assert.equal(result, 42)
  })

  it('passes initial input as $input', async () => {
    const result = await engine.execute({
      nodes: [
        { id: 's1', tool: 'set', input: { name: 'val', value: '$input.value' } },
        { id: 'g1', tool: 'get', input: { name: 'val' } },
      ],
    }, { initialInput: { value: 99 } })
    assert.equal(result, 99)
  })

  it('stops at maxSteps', async () => {
    await assert.rejects(
      () => engine.execute({
        nodes: [
          { id: 's1', tool: 'set', input: { name: 'x', value: 1 } },
        ],
      }, { maxSteps: 0 }),
    )
  })

  it('empty workflow returns undefined', async () => {
    const result = await engine.execute({ nodes: [] })
    assert.equal(result, undefined)
  })
})
