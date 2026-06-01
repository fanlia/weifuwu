import { streamText, generateText, embed } from 'ai'
import type { LanguageModel, EmbeddingModel, Tool } from 'ai'
import { z } from 'zod'
import type { Sql } from 'postgres'
import type { AgentConfig, RunParams, RunResult, KnowledgeDoc } from './types.ts'
import { formatSSE } from '../sse.ts'

interface RunnerDeps {
  sql: Sql<{}>
  getModel: () => LanguageModel
  getEmbeddingModel: () => EmbeddingModel
  userTools?: Record<string, Tool>
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

function hasKnowledgeDocs(sql: Sql<{}>, agentId: number): Promise<boolean> {
  return sql`SELECT 1 FROM "_knowledge_documents" WHERE agent_id = ${agentId} LIMIT 1`
    .then(r => (r as any[]).length > 0)
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

async function loadAgent(sql: Sql<{}>, agentId: number): Promise<AgentConfig | null> {
  const [row] = await sql`SELECT * FROM "_agents" WHERE id = ${agentId} LIMIT 1`
  return (row as AgentConfig) ?? null
}

export function createRunner(deps: RunnerDeps) {
  const { sql, getModel, getEmbeddingModel, userTools } = deps

  async function run(agentId: number, params: RunParams): Promise<RunResult> {
    const agent = await loadAgent(sql, agentId)
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

    if (agent.type === 'workflow' && userTools) {
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

      return { output: result.text, elapsed: Date.now() - start }
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
