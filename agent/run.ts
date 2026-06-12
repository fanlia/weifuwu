import { streamText, generateText, embed, type LanguageModel, type EmbeddingModel, type Tool } from 'ai'
import { z } from 'zod'
import type { Sql } from '../vendor.ts'
import type { BoundTable } from '../postgres/schema/index.ts'
import type { AgentConfig, RunParams, RunResult, KnowledgeDoc } from './types.ts'
import { formatSSE } from '../sse.ts'
import { currentTraceId } from '../trace.ts'

interface RunnerDeps {
  sql: Sql<{}>
  agents: BoundTable<any>
  runs: BoundTable<any>
  knowledge: BoundTable<any>
  getModel: () => LanguageModel
  getEmbeddingModel: () => EmbeddingModel
  userTools?: Record<string, Tool>
}

function hasKnowledgeDocs(sql: Sql<{}>, agentId: number): Promise<boolean> {
  return sql`SELECT 1 FROM "_knowledge_documents" WHERE agent_id = ${agentId} LIMIT 1`
    .then(r => (r as any[]).length > 0)
}

function chunkContent(content: string, chunkSize = 512, overlap = 64): string[] {
  const paragraphs = content.split(/\n\n+/)
  const chunks: string[] = []
  let current = ''
  for (const p of paragraphs) {
    if (current.length + p.length > chunkSize && current.length > 0) {
      chunks.push(current)
      current = current.slice(-overlap)
    }
    current += (current ? '\n\n' : '') + p
  }
  if (current) chunks.push(current)
  return chunks
}

async function searchKnowledge(sql: Sql<{}>, embedModel: EmbeddingModel, agentId: number, query: string, limit = 5) {
  const { embedding } = await embed({ model: embedModel, value: query })
  const vec = `[${embedding.join(',')}]`
  const docs = await sql.unsafe(
    `SELECT id, title, content, metadata, embedding <=> $1::vector AS _score FROM "_knowledge_documents" WHERE agent_id = $2 ORDER BY embedding <=> $1::vector LIMIT $3`,
    [vec, agentId, limit],
  ) as any[]
  return docs.map(d => ({ id: d.id, title: d.title, content: d.content, score: d._score }))
}

async function loadAgent(agents: BoundTable<any>, agentId: number): Promise<AgentConfig | null> {
  const row = await agents.read(agentId)
  return (row as AgentConfig) ?? null
}

export function createRunner(deps: RunnerDeps) {
  const { sql, agents, runs, getModel, getEmbeddingModel, userTools } = deps

  function truncate(s: string, max = 200): string {
    return s.length > max ? s.slice(0, max) + '...' : s
  }

  async function logRun(agentId: number, params: RunParams, result: Partial<{
    output: string; elapsed: number; tokensIn: number; tokensOut: number;
    status: string; errorMsg: string | null; model: string
  }>) {
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

    const model = getModel()
    const embedModel = getEmbeddingModel()
    const start = Date.now()
    const hasKB = await hasKnowledgeDocs(sql, agentId)

    const messages: Array<{ role: string; content: string }> = params.messages ?? []
    if (messages.length === 0) {
      messages.push({ role: 'user', content: params.input })
    }

    const tools: Record<string, Tool> = {}

    if (hasKB) {
      tools.searchKnowledge = {
        description: '搜索知识库文档获取与查询相关的信息。回答用户问题前必须先搜索知识库。如果搜索结果不足以回答，告诉用户你不知道。',
        parameters: z.object({
          query: z.string().describe('搜索关键词，应该用中文提问'),
          limit: z.number().default(5).describe('返回结果数量'),
        }),
        execute: async ({ query, limit }: { query: string; limit?: number }) => {
          return searchKnowledge(sql, embedModel, agentId, query, limit)
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
      const result = streamText({
        model,
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
      const result = await generateText({
        model,
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

  async function addKnowledge(agentId: number, title: string, content: string): Promise<KnowledgeDoc> {
    const embedModel = getEmbeddingModel()
    const chunks = chunkContent(content)

    const [first] = chunks
    const { embedding } = await embed({ model: embedModel, value: first })
    const vec = `[${embedding.join(',')}]`

    const [doc] = await sql.unsafe(
      `INSERT INTO "_knowledge_documents" ("agent_id", "title", "content", "embedding") VALUES ($1, $2, $3, $4::vector) RETURNING *`,
      [agentId, title, first, vec],
    ) as any[]

    for (let i = 1; i < chunks.length; i++) {
      const { embedding: emb } = await embed({ model: embedModel, value: chunks[i] })
      await sql.unsafe(
        `INSERT INTO "_knowledge_documents" ("agent_id", "title", "content", "embedding") VALUES ($1, $2, $3, $4::vector)`,
        [agentId, `${title} (${i + 1})`, chunks[i], `[${emb.join(',')}]`],
      )
    }

    return doc as KnowledgeDoc
  }

  return { run, addKnowledge }
}
