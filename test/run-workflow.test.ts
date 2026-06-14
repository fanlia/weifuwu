import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { tool } from 'ai'
import { z } from 'zod'
import { createTestServer } from '../serve.ts'

describe('runWorkflow', () => {
  it('executes nodes directly', async () => {
    const { runWorkflow } = await import('../ai/workflow.ts')
    const wf = runWorkflow()

    const result = await wf.execute!(
      {
        goal: 'test',
        nodes: [
          { id: 's1', tool: 'set', input: { name: 'x', value: '42' } },
          { id: 's2', tool: 'eval', input: { expression: '$var.x + 1' } },
        ],
      } as any,
      { toolCallId: 'test' },
    )

    assert.ok(result)
    assert.equal((result as any).result?.result, 43)
  })

  it('executes if condition', async () => {
    const { runWorkflow } = await import('../ai/workflow.ts')
    const wf = runWorkflow()

    const result = await wf.execute!(
      {
        goal: 'test condition',
        nodes: [
          { id: 's1', tool: 'set', input: { name: 'val', value: true } },
          {
            id: 's2',
            tool: 'if',
            input: {},
            conditions: [
              {
                test: '$var.val',
                body: [{ id: 's3', tool: 'set', input: { name: 'result', value: 'true_branch' } }],
              },
            ],
          },
        ],
      } as any,
      { toolCallId: 'test' },
    )

    assert.ok(result)
    assert.equal((result as any).result, 'true_branch')
  })

  it('executes http node', async () => {
    const { server, url } = await createTestServer(async (req) => {
      return Response.json({ status: 200, url: req.url })
    })
    try {
      const { runWorkflow } = await import('../ai/workflow.ts')
      const wf = runWorkflow()

      const result = await wf.execute!(
        {
          goal: 'test http',
          nodes: [{ id: 'h1', tool: 'http', input: { url: url + '/get', method: 'GET' } }],
        } as any,
        { toolCallId: 'test' },
      )

      assert.ok(result)
      const httpResult = (result as any).result
      assert.ok(httpResult)
      assert.equal(httpResult.status, 200)
    } finally {
      server.stop()
    }
  })

  it('executes call node with AI SDK tool', async () => {
    const { runWorkflow } = await import('../ai/workflow.ts')
    const greetTool = tool({
      description: 'Greet a person',
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => `Hello, ${name}!`,
    })

    const wf = runWorkflow({ tools: { greet: greetTool } })

    const result = await wf.execute!(
      {
        goal: 'test call',
        nodes: [{ id: 'g1', tool: 'call', input: { tool: 'greet', args: { name: 'World' } } }],
      } as any,
      { toolCallId: 'test' },
    )

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

    const result = await wf.execute!(
      {
        goal: 'test ref',
        nodes: [
          { id: 's1', tool: 'set', input: { name: 'person', value: 'Alice' } },
          { id: 'g1', tool: 'call', input: { tool: 'greet', args: { name: '$var.person' } } },
        ],
      } as any,
      { toolCallId: 'test' },
    )

    assert.ok(result)
    assert.equal((result as any).result, 'Hi Alice!')
  })

  it('executes while loop', async () => {
    const { runWorkflow } = await import('../ai/workflow.ts')
    const wf = runWorkflow()

    const result = await wf.execute!(
      {
        goal: 'test while',
        nodes: [
          { id: 's1', tool: 'set', input: { name: 'i', value: 0 } },
          {
            id: 'w1',
            tool: 'while',
            input: { condition: '$var.i < 3' },
            body: [
              { id: 'inc', tool: 'eval', input: { expression: '$var.i + 1' } },
              { id: 's2', tool: 'set', input: { name: 'i', value: '$nodes.inc.output.result' } },
            ],
          },
          { id: 's3', tool: 'get', input: { name: 'i' } },
        ],
      } as any,
      { toolCallId: 'test' },
    )

    assert.ok(result)
    assert.equal((result as any).result, 3)
  })

  it('while loop stops when condition is false', async () => {
    const { runWorkflow } = await import('../ai/workflow.ts')
    const wf = runWorkflow()

    const result = await wf.execute!(
      {
        goal: 'test while stop',
        nodes: [
          { id: 's1', tool: 'set', input: { name: 'i', value: 0 } },
          {
            id: 'w1',
            tool: 'while',
            input: { condition: 'false' },
            body: [{ id: 'inc', tool: 'set', input: { name: 'i', value: 99 } }],
          },
          { id: 's2', tool: 'get', input: { name: 'i' } },
        ],
      } as any,
      { toolCallId: 'test' },
    )

    assert.ok(result)
    assert.equal((result as any).result, 0)
  })

  it('steps limit exceeded throws', async () => {
    const { runWorkflow } = await import('../ai/workflow.ts')
    const wf = runWorkflow({ maxSteps: 5 })

    await assert.rejects(
      () =>
        wf.execute!(
          {
            goal: 'test limit',
            nodes: [
              { id: 's1', tool: 'set', input: { name: 'i', value: 0 } },
              {
                id: 'w1',
                tool: 'while',
                input: { condition: 'true' },
                body: [
                  { id: 'inc', tool: 'eval', input: { expression: '$var.i + 1' } },
                  {
                    id: 's2',
                    tool: 'set',
                    input: { name: 'i', value: '$nodes.inc.output.result' },
                  },
                ],
              },
            ],
          } as any,
          { toolCallId: 'test' },
        ),
      /Step limit exceeded/,
    )
  })

  it('conditional false branch', async () => {
    const { runWorkflow } = await import('../ai/workflow.ts')
    const wf = runWorkflow()

    const result = await wf.execute!(
      {
        goal: 'test false',
        nodes: [
          { id: 's1', tool: 'set', input: { name: 'val', value: false } },
          {
            id: 'if1',
            tool: 'if',
            input: {},
            conditions: [
              {
                test: '$var.val',
                body: [{ id: 's2', tool: 'set', input: { name: 'r', value: 'yes' } }],
              },
            ],
          },
          { id: 's3', tool: 'eval', input: { expression: 'false' } },
        ],
      } as any,
      { toolCallId: 'test' },
    )

    // if condition was false, so the last executed node is s3 (eval false)
    assert.equal((result as any).result?.result, false)
  })

  it('http node with JSON body', async () => {
    const { server, url } = await createTestServer(async (req) => {
      const body = req.method === 'POST' ? await req.json() : null
      return Response.json({ status: 200, body: { json: body } })
    })
    try {
      const { runWorkflow } = await import('../ai/workflow.ts')
      const wf = runWorkflow()

      const result = await wf.execute!(
        {
          goal: 'test http post',
          nodes: [
            {
              id: 'h1',
              tool: 'http',
              input: {
                url: url + '/post',
                method: 'POST',
                body: { hello: 'world' },
              },
            },
          ],
        } as any,
        { toolCallId: 'test' },
      )

      assert.ok(result)
      const h = (result as any).result
      assert.ok(h)
      assert.equal(h.status, 200)
      assert.equal(h.body?.body?.json?.hello, 'world')
    } finally {
      server.stop()
    }
  })

  it('expressions: arithmetic and comparison', async () => {
    const { runWorkflow } = await import('../ai/workflow.ts')
    const wf = runWorkflow()

    async function evalExpr(expression: string) {
      const r = await wf.execute!(
        {
          goal: 'test',
          nodes: [{ id: 'e1', tool: 'eval', input: { expression } }],
        } as any,
        { toolCallId: 'test' },
      )
      return (r as any).result?.result
    }

    assert.equal(await evalExpr('2 + 3'), 5)
    assert.equal(await evalExpr('10 - 4'), 6)
    assert.equal(await evalExpr('3 * 4'), 12)
    assert.equal(await evalExpr('10 / 2'), 5)
    assert.equal(await evalExpr('1 === 1'), true)
    assert.equal(await evalExpr('1 !== 2'), true)
    assert.equal(await evalExpr('5 > 3'), true)
    assert.equal(await evalExpr('3 < 5'), true)
  })
})
