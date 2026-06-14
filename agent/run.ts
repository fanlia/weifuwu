/* eslint-disable no-console */
import { type Tool } from 'ai'
import { z } from 'zod'
import type { SqlClient } from '../vendor.ts'
import type { BoundTable } from '../postgres/schema/index.ts'
import type { AIProvider } from '../ai/provider.ts'
import type { AgentConfig, RunParams, RunResult, KnowledgeDoc } from './types.ts'
import { formatSSE } from '../sse.ts'
import { currentTraceId } from '../trace.ts'
import { chunkContent } from '../ai/utils.ts'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface RunnerDeps {
  sql: SqlClient
  agents: BoundTable<any>
  runs: BoundTable<any>
  knowledge: BoundTable<any>
  provider: AIProvider
  modelName?: string
  userTools?: Record<string, Tool>
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
function hasKnowledgeDocs(sql: SqlClient, agentId: number): Promise<boolean> {
  return sql`SELECT 1 FROM "_knowledge_documents" WHERE agent_id = ${agentId} LIMIT 1`.then(
    (r) => (r as any[]).length > 0,
  )
}

async function searchKnowledge(
  sql: SqlClient,
  provider: AIProvider,
  agentId: number,
  query: string,
  limit = 5,
) {
  const embedding = await provider.embed(query)
  const vec = `[${embedding.join(',')}]`
  const docs = (await sql.unsafe(
    `SELECT id, title, content, metadata, embedding <=> $1::vector AS _score FROM "_knowledge_documents" WHERE agent_id = $2 ORDER BY embedding <=> $1::vector LIMIT $3`,
    [vec, agentId, limit],
  )) as any[]
  return docs.map((d) => ({ id: d.id, title: d.title, content: d.content, score: d._score }))
}

async function loadAgent(agents: BoundTable<any>, agentId: number): Promise<AgentConfig | null> {
  const row = await agents.read(agentId)
  return (row as AgentConfig) ?? null
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
export function createRunner(deps: RunnerDeps) {
  const { sql, agents, runs, provider, userTools } = deps

  function truncate(s: string, max = 200): string {
    return s.length > max ? s.slice(0, max) + '...' : s
  }

  async function logRun(
    agentId: number,
    params: RunParams,
    result: Partial<{
      output: string
      elapsed: number
      tokensIn: number
      tokensOut: number
      status: string
      errorMsg: string | null
      model: string
    }>,
  ) {
    try {
      await runs.insert({
        agent_id: agentId,
        input: truncate(params.input),
        output: result.output ? truncate(result.output) : null,
        model: result.model || '',
        tokens_in: result.tokensIn || 0,
        tokens_out: result.tokensOut || 0,
        elapsed_ms: result.elapsed || 0,
        status: result.status || 'success',
        error_msg: result.errorMsg || null,
        trace_id: currentTraceId() || null,
      })
    } catch (e) {
      console.error('[agent] failed to log run:', (e as Error).message)
    }
  }

  async function run(agentId: number, params: RunParams): Promise<RunResult> {
    const agent = await loadAgent(agents, agentId)
    if (!agent || !agent.active) throw new Error('Agent not found or inactive')

    const start = Date.now()
    const hasKB = await hasKnowledgeDocs(sql, agentId)

    const messages: Array<{ role: string; content: string }> = params.messages ?? []
    if (messages.length === 0) {
      messages.push({ role: 'user', content: params.input })
    }

    const tools: Record<string, Tool> = {}

    if (hasKB) {
      tools.searchKnowledge = {
        description:
          '搜索知识库文档获取与查询相关的信息。回答用户问题前必须先搜索知识库。如果搜索结果不足以回答，告诉用户你不知道。',
        parameters: z.object({
          query: z.string().describe('搜索关键词，应该用中文提问'),
          limit: z.number().default(5).describe('返回结果数量'),
        }),
        execute: async ({ query, limit }: { query: string; limit?: number }) => {
          return searchKnowledge(sql, provider, agentId, query, limit)
        },
      } as unknown as Tool
    }

    if (agent.type === 'tool-use' && userTools) {
      for (const [key, tool] of Object.entries(userTools)) {
        tools[key] = tool
      }
    }

    const system = agent.system_prompt || undefined

    if (params.stream) {
      const result = provider.streamText({
        system,
        messages: messages as any,
        tools: Object.keys(tools).length > 0 ? (tools as any) : undefined,
      })

      // Log streaming runs with partial data (tokens not known upfront)
      const elapsed = Date.now() - start
      logRun(agentId, params, { model: agent.model, status: 'stream', elapsed }).catch(() => {})

      const fullStream = result.fullStream
      const encoder = new TextEncoder()

      const sseStream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for await (const event of fullStream) {
              controller.enqueue(encoder.encode(formatSSE(event.type, event)))
            }
          } catch (err: any) {
            controller.enqueue(encoder.encode(formatSSE('error', { error: err.message })))
          } finally {
            controller.close()
          }
        },
      })

      return { stream: sseStream }
    } else {
      const result = await provider.generateText({
        system,
        messages: messages as any,
        tools: Object.keys(tools).length > 0 ? (tools as any) : undefined,
      })

      const elapsed = Date.now() - start
      logRun(agentId, params, {
        output: result.text,
        elapsed,
        tokensIn: result.usage?.inputTokens,
        tokensOut: result.usage?.outputTokens,
        model: agent.model,
        status: 'success',
      }).catch(() => {})

      return { output: result.text, elapsed }
    }
  }

  async function addKnowledge(
    agentId: number,
    title: string,
    content: string,
  ): Promise<KnowledgeDoc> {
    const chunks = chunkContent(content, 1024, 128)

    const [first] = chunks
    const embedding = await provider.embed(first)
    const vec = `[${embedding.join(',')}]`

    const [doc] = (await sql.unsafe(
      `INSERT INTO "_knowledge_documents" ("agent_id", "title", "content", "embedding") VALUES ($1, $2, $3, $4::vector) RETURNING *`,
      [agentId, title, first, vec],
    )) as any[]

    for (let i = 1; i < chunks.length; i++) {
      const emb = await provider.embed(chunks[i])
      const vec = `[${emb.join(',')}]`
      await sql.unsafe(
        `INSERT INTO "_knowledge_documents" ("agent_id", "title", "content", "embedding") VALUES ($1, $2, $3, $4::vector)`,
        [agentId, `${title} (${i + 1})`, chunks[i], vec],
      )
    }

    return doc as KnowledgeDoc
  }

  return { run, addKnowledge }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
