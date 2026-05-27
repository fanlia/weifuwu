import type { Tool, Workflow } from './types.ts'

function buildToolsDescription(tools: Record<string, Tool>): string {
  return Object.entries(tools).map(([key, t]) => {
    const name = t.name || key
    const schema = t.inputSchema
    return `- ${name}: ${t.description}\n  Input schema: describe as JSON object fields`
  }).join('\n')
}

const SYSTEM_PROMPT_TEMPLATE = `You are a workflow generator. Given a user goal and available tools, output a workflow JSON.

Available tools:
{{TOOLS}}

Workflow format:
{
  "name": "workflow name",
  "nodes": [
    {
      "id": "step1",
      "tool": "set",
      "input": { "name": "varName", "value": "initialValue" }
    },
    {
      "id": "step2",
      "tool": "call",
      "input": { "tool": "toolName", "args": { "param1": "$var.varName" } }
    },
    {
      "id": "step3",
      "tool": "if",
      "input": {},
      "conditions": [
        { "test": "$nodes.step2.output.someField", "body": [
          { "id": "step4", "tool": "call", "input": { "tool": "toolName", "args": {} } }
        ]}
      ]
    }
  ]
}

Node types:
- eval: evaluate an expression. input: { expression: "..." }
- set: assign a variable. input: { name, value }
- get: read a variable. input: { name }
- if: conditional branch. input: {}, conditions: [{ test, body }]
- while: loop. input: { condition }, body: [nodes]
- call: call a registered tool. input: { tool, args }
- http: HTTP request. input: { url, method?, headers?, body? }

Reference syntax:
- $var.name - read a variable
- $nodes.id.output - output of a previous node
- $nodes.id.output.field - specific field of a node's output
- $input.field - workflow input parameter

Output ONLY valid JSON. No explanation, no markdown.`

export async function generateWorkflow(
  goal: string,
  tools: Record<string, Tool>,
  generateFn: (prompt: { system: string; messages: { role: string; content: string }[] }) => Promise<{ text: string }>,
): Promise<Workflow> {
  const toolsDesc = buildToolsDescription(tools)
  const system = SYSTEM_PROMPT_TEMPLATE.replace('{{TOOLS}}', toolsDesc)

  const result = await generateFn({
    system,
    messages: [{ role: 'user', content: goal }],
  })

  const text = result.text.trim()
  const jsonStart = text.indexOf('{')
  const jsonEnd = text.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error(`LLM output is not valid JSON: ${text.slice(0, 200)}`)
  }

  const jsonStr = text.slice(jsonStart, jsonEnd + 1)

  try {
    const workflow = JSON.parse(jsonStr) as Workflow
    if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
      throw new Error('Generated workflow has no nodes array')
    }
    return workflow
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`Failed to parse LLM output as JSON: ${err.message}`)
    }
    throw err
  }
}
