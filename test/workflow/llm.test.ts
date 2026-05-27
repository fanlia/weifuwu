import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { tool } from '../../workflow/tool.ts'
import { generateWorkflow } from '../../workflow/llm.ts'

const testTools = {
  queryUser: tool({
    description: '根据用户ID查询用户信息，返回 email, name, age',
    inputSchema: z.object({ userId: z.string() }),
    execute: async ({ userId }) => ({ email: `${userId}@test.com`, name: 'Test', age: 30 }),
  }),
  sendEmail: tool({
    description: '发送邮件给用户',
    inputSchema: z.object({ to: z.string(), subject: z.string(), body: z.string() }),
    execute: async ({ to, subject, body }) => ({ sent: true }),
  }),
}

describe('generateWorkflow', () => {
  it('generates workflow from LLM response', async () => {
    const mockGenerate = async () => ({
      text: JSON.stringify({
        name: 'send_welcome_email',
        nodes: [
          { id: 'getUser', tool: 'call', input: { tool: 'queryUser', args: { userId: '123' } } },
          { id: 'send', tool: 'call', input: { tool: 'sendEmail', args: { to: '$nodes.getUser.output.email', subject: 'Welcome', body: 'Hello!' } } },
        ],
      }),
    })

    const workflow = await generateWorkflow('send welcome email to user 123', testTools, mockGenerate)

    assert.ok(workflow.nodes.length > 0)
    assert.equal(workflow.name, 'send_welcome_email')

    const callNodes = workflow.nodes.filter(n => n.tool === 'call')
    assert.equal(callNodes.length, 2)
  })

  it('throws on missing nodes array', async () => {
    const mockGenerate = async () => ({
      text: JSON.stringify({ name: 'bad' }),
    })

    await assert.rejects(
      () => generateWorkflow('do something', testTools, mockGenerate),
    )
  })

  it('handles LLM response with surrounding text', async () => {
    const mockGenerate = async () => ({
      text: `Here is the workflow:
{
  "name": "test",
  "nodes": [
    { "id": "s1", "tool": "set", "input": { "name": "x", "value": 1 } }
  ]
}
That should work!`,
    })

    const workflow = await generateWorkflow('test', testTools, mockGenerate)
    assert.equal(workflow.name, 'test')
    assert.equal(workflow.nodes.length, 1)
  })

  it('throws on invalid JSON from LLM', async () => {
    const mockGenerate = async () => ({
      text: 'not even close to JSON',
    })

    await assert.rejects(
      () => generateWorkflow('invalid', testTools, mockGenerate),
    )
  })
})
