import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { tool } from '../../workflow/tool.ts'

describe('tool', () => {
  it('creates a tool with description and inputSchema', () => {
    const t = tool({
      description: '查询用户信息',
      inputSchema: z.object({ userId: z.string() }),
      execute: async ({ userId }) => ({ id: userId, name: 'test' }),
    })
    assert.equal(t.description, '查询用户信息')
    assert.ok(t.inputSchema instanceof z.ZodObject)
  })

  it('execute returns validated result', async () => {
    const t = tool({
      description: '加法',
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      execute: async ({ a, b }) => a + b,
    })
    const result = await t.execute({ a: 1, b: 2 }, { nodeId: 'test' })
    assert.equal(result, 3)
  })

  it('inputSchema parse rejects invalid input', () => {
    const t = tool({
      description: '需要数字',
      inputSchema: z.object({ x: z.number() }),
      execute: async ({ x }) => x,
    })
    const result = t.inputSchema.safeParse({ x: 'not-a-number' })
    assert.equal(result.success, false)
  })
})
