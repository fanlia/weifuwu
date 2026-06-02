# AI Agent

> [Home](../README.md) → AI Agent

## AI Agent

Server-side AI agents with OpenAI-compatible API. Built-in chat, tool-use (tool-calling), and knowledge (RAG) types. Works out of the box with Ollama or any OpenAI-compatible provider.

```ts
import { agent } from 'weifuwu'

const agents = agent({ pg })

await agents.migrate()
app.use('/api', agents.router())
```

| Type | Description | Execution |
|------|-------------|-----------|
| `chat` | Pure conversation | `streamText()` / `generateText()` |
| `tool-use` | Tool-calling agent | `streamText({ tools })` |

### Knowledge (RAG)

Add documents to any agent — `searchKnowledge` tool auto-injected:

```ts
await agents.addKnowledge(agentId, 'Title', 'Document content...')
// The agent automatically calls searchKnowledge when answering
```

### Streaming

```http
POST /agents/:id/run  { input: "hello", stream: true }
→ event-stream (fullStream SSE: text-delta, tool-call, tool-result, finish)
```

### Programmatic API

```ts
const result = await agents.run(agentId, { input: 'hello', stream: false })
// { output: "Hello!", elapsed: 1234 }
```
