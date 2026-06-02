import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { tool } from 'ai'
import { z } from 'zod'

describe('runWorkflow', () => {
  it('executes nodes directly', async () => {
    const { runWorkflow } = await import('../ai/workflow.ts')
    const wf = runWorkflow()

    const result = await wf.execute!({
      goal: 'test',
      nodes: [
        { id: 's1', tool: 'set', input: { name: 'x', value: '42' } },
        { id: 's2', tool: 'eval', input: { expression: '$var.x + 1' } },
      ],
    } as any, { toolCallId: 'test' })

    assert.ok(result)
    assert.equal((result as any).result?.result, 43)
  })

  it('executes if condition', async () => {
    const { runWorkflow } = await import('../ai/workflow.ts')
    const wf = runWorkflow()

    const result = await wf.execute!({
      goal: 'test condition',
      nodes: [
        { id: 's1', tool: 'set', input: { name: 'val', value: true } },
        {
          id: 's2', tool: 'if', input: {}, conditions: [
            { test: '$var.val', body: [{ id: 's3', tool: 'set', input: { name: 'result', value: 'true_branch' } }] },
          ],
        },
      ],
    } as any, { toolCallId: 'test' })

    assert.ok(result)
    assert.equal((result as any).result, 'true_branch')
  })

  it('executes http node', async () => {
    const { runWorkflow } = await import('../ai/workflow.ts')
    const wf = runWorkflow()

    const result = await wf.execute!({
      goal: 'test http',
      nodes: [
        { id: 'h1', tool: 'http', input: { url: 'https://httpbin.org/get', method: 'GET' } },
      ],
    } as any, { toolCallId: 'test' })

    assert.ok(result)
    const httpResult = (result as any).result
    assert.ok(httpResult)
    assert.equal(httpResult.status, 200)
  })

  it('executes call node with AI SDK tool', async () => {
    const { runWorkflow } = await import('../ai/workflow.ts')
    const greetTool = tool({
      description: 'Greet a person',
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => `Hello, ${name}!`,
    })

    const wf = runWorkflow({ tools: { greet: greetTool } })

    const result = await wf.execute!({
      goal: 'test call',
      nodes: [
        { id: 'g1', tool: 'call', input: { tool: 'greet', args: { name: 'World' } } },
      ],
    } as any, { toolCallId: 'test' })

    assert.ok(result)
    assert.equal((result as any).result, 'Hello, World!')
  })

  it('call node with resolved references', async () => {
    const { runWorkflow } = await import('../ai/workflow.ts')
    const greetTool = tool({
      description: 'Greet',
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => `Hi ${name}!`,
    })

    const wf = runWorkflow({ tools: { greet: greetTool } })

    const result = await wf.execute!({
      goal: 'test ref',
      nodes: [
        { id: 's1', tool: 'set', input: { name: 'person', value: 'Alice' } },
        { id: 'g1', tool: 'call', input: { tool: 'greet', args: { name: '$var.person' } } },
      ],
    } as any, { toolCallId: 'test' })

    assert.ok(result)
    assert.equal((result as any).result, 'Hi Alice!')
  })
})
