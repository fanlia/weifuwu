# AI: Streaming & Workflow

> [Home](../README.md) → AI

## AI streaming

Server-sent event streaming via the Vercel AI SDK:

```ts
import { serve, Router, aiStream } from 'weifuwu'
import { openai } from '@ai-sdk/openai'

const app = new Router()
const chat = await aiStream(async (req, ctx) => {
  const { messages } = await req.json()
  return { model: openai('gpt-4o'), messages }
})
app.use('/chat', chat.router())

serve(app.handler(), { port: 3000 })
```

## runWorkflow

Multi-step DAG execution engine — packaged as a single AI SDK `Tool`. Use it with `streamText()` or `generateText()` when the LLM needs conditional logic, loops, or multi-step tool orchestration.

```ts
import { tool, streamText } from 'ai'
import { runWorkflow } from 'weifuwu'
import { z } from 'zod'

const tools = {
  queryUser: tool({
    description: 'Query user info',
    inputSchema: z.object({ userId: z.string() }),
    execute: async ({ userId }) => ({ id: userId, email: 'user@test.com', name: 'Test' }),
  }),
  sendEmail: tool({
    description: 'Send an email',
    inputSchema: z.object({ to: z.string(), subject: z.string() }),
    execute: async ({ to, subject }) => ({ sent: true }),
  }),
  runWF: runWorkflow({ tools: { queryUser, sendEmail } }),
}

// Use in any streamText call — the LLM can decide when to trigger a workflow
const result = await streamText({
  model,
  tools,
  messages: [{ role: 'user', content: 'Query user 123, send welcome email if exists' }],
})
```

### Node types

7 built-in node types for defining the execution graph:

| Node | Purpose | Input |
|------|---------|-------|
| `call` | Call a registered AI SDK Tool | `{ tool: "name", args: {...} }` |
| `set` | Assign a variable | `{ name: "x", value: 42 }` |
| `get` | Read a variable | `{ name: "x" }` |
| `eval` | Evaluate an expression | `{ expression: "$var.x + 1" }` |
| `if` | Conditional branch | `{ conditions: [{ test: ..., body: [nodes] }] }` |
| `while` | Loop | `{ condition: "$var.i < 5" }, body: [nodes]` |
| `http` | HTTP request | `{ url: "https://...", method: "GET" }` |

### Reference syntax

| Pattern | Meaning | Example |
|---------|---------|---------|
| `$var.x` | Variable `x` | `$var.counter` |
| `$nodes.u.output` | Full output of node `u` | `$nodes.u.output` |
| `$nodes.u.output.field` | Specific field | `$nodes.u.output.email` |
| `$input.userId` | Input param | `$input.userId` |

### LLM generation

Pass a `model` to `runWorkflow` — the LLM generates the workflow JSON from a goal:

```ts
const runWF = runWorkflow({
  tools: { queryUser, sendEmail },
  model: openai('gpt-4o'),
})

const result = await streamText({
  model,
  tools: { runWF },
})
```

The LLM calls `runWF` with a goal, and `runWorkflow` internally calls `generateText` to produce the workflow nodes, then executes them.
