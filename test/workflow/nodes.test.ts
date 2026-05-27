import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { executeNode } from '../../workflow/nodes.ts'
import { tool } from '../../workflow/tool.ts'
import type { WorkflowContext } from '../../workflow/types.ts'

function makeCtx(overrides?: Partial<WorkflowContext>): WorkflowContext {
  const toolRegistry = new Map()
  toolRegistry.set('add', tool({
    description: '加法',
    inputSchema: z.object({ a: z.number(), b: z.number() }),
    execute: async ({ a, b }) => a + b,
  }))

  return {
    variables: new Map([['x', 10]]),
    nodeOutputs: new Map(),
    functions: {},
    stepCount: 0,
    maxSteps: 1000,
    input: {},
    toolRegistry,
    ...overrides,
  }
}

describe('eval node', () => {
  it('evaluates expression with $var', async () => {
    const result = await executeNode(
      { id: 'e1', tool: 'eval', input: { expression: '$var.x + 5' } },
      makeCtx(),
    )
    assert.equal((result as any).result, 15)
  })

  it('evaluates boolean expression', async () => {
    const result = await executeNode(
      { id: 'e2', tool: 'eval', input: { expression: '$var.x > 5' } },
      makeCtx(),
    )
    assert.equal((result as any).result, true)
  })
})

describe('set node', () => {
  it('sets a variable', async () => {
    const ctx = makeCtx()
    const result = await executeNode(
      { id: 's1', tool: 'set', input: { name: 'y', value: 20 } },
      ctx,
    )
    assert.equal(result, 20)
    assert.equal(ctx.variables.get('y'), 20)
  })
})

describe('get node', () => {
  it('gets a variable', async () => {
    const result = await executeNode(
      { id: 'g1', tool: 'get', input: { name: 'x' } },
      makeCtx(),
    )
    assert.equal(result, 10)
  })

  it('throws on undefined variable', async () => {
    await assert.rejects(
      () => executeNode({ id: 'g2', tool: 'get', input: { name: 'nonexistent' } }, makeCtx()),
    )
  })
})

describe('if node', () => {
  it('executes true branch', async () => {
    const ctx = makeCtx()
    await executeNode({
      id: 'if1',
      tool: 'if',
      input: {},
      conditions: [
        { test: true, body: [{ id: 's1', tool: 'set', input: { name: 'result', value: 'yes' } }] },
        { test: false, body: [{ id: 's2', tool: 'set', input: { name: 'result', value: 'no' } }] },
      ],
    }, ctx)
    assert.equal(ctx.variables.get('result'), 'yes')
  })

  it('executes false branch', async () => {
    const ctx = makeCtx()
    await executeNode({
      id: 'if2',
      tool: 'if',
      input: {},
      conditions: [
        { test: false, body: [{ id: 's1', tool: 'set', input: { name: 'result', value: 'yes' } }] },
        { test: true, body: [{ id: 's2', tool: 'set', input: { name: 'result', value: 'no' } }] },
      ],
    }, ctx)
    assert.equal(ctx.variables.get('result'), 'no')
  })

  it('no matching branch returns undefined', async () => {
    const result = await executeNode({
      id: 'if3',
      tool: 'if',
      input: {},
      conditions: [
        { test: false, body: [{ id: 's1', tool: 'set', input: { name: 'result', value: 'yes' } }] },
      ],
    }, makeCtx())
    assert.equal(result, undefined)
  })
})

describe('call node', () => {
  it('calls a registered tool', async () => {
    const result = await executeNode({
      id: 'c1',
      tool: 'call',
      input: { tool: 'add', args: { a: 3, b: 4 } },
    }, makeCtx())
    assert.equal(result, 7)
  })

  it('throws on unknown tool', async () => {
    await assert.rejects(
      () => executeNode({
        id: 'c2',
        tool: 'call',
        input: { tool: 'nonexistent', args: {} },
      }, makeCtx()),
    )
  })
})

describe('while node', () => {
  it('loops until condition is false', async () => {
    const ctx = makeCtx()
    ctx.variables.set('i', 0)

    await executeNode({
      id: 'w1',
      tool: 'while',
      input: { condition: '$var.i < 3' },
      body: [
        {
          id: 'inc',
          tool: 'set',
          input: { name: 'i', value: '$var.i + 1' },
        },
      ],
    }, ctx)

    assert.equal(ctx.variables.get('i'), 3)
  })

  it('does not execute body when condition is initially false', async () => {
    const ctx = makeCtx()
    ctx.variables.set('executed', false)

    await executeNode({
      id: 'w2',
      tool: 'while',
      input: { condition: 'false' },
      body: [
        { id: 's1', tool: 'set', input: { name: 'executed', value: true } },
      ],
    }, ctx)

    assert.equal(ctx.variables.get('executed'), false)
  })
})
