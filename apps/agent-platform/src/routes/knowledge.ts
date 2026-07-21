/**
 * 知识库路由 — 文档上传/检索
 */

import type { Router, Context } from 'weifuwu'

export function registerKnowledgeRoutes(app: Router): void {
  // ── 获取知识库文档列表 ──────────────────────────────────

  app.get('/api/agents/:id/knowledge', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, tenantId, params } = ctx

    const [agent] = await sql`
      SELECT id FROM agents
      WHERE id = ${params.id} AND tenant_id = ${tenantId} AND type = 'knowledge_base'
    `
    if (!agent) {
      return Response.json({ error: '知识库 Agent 不存在' }, { status: 404 })
    }

    const documents = await sql`
      SELECT id, filename, chunk_count, created_at
      FROM kb_documents
      WHERE agent_id = ${params.id}
      ORDER BY created_at DESC
    `

    return Response.json({ documents })
  })

  // ── 上传文档 ─────────────────────────────────────────────

  app.post('/api/agents/:id/knowledge', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, tenantId, params, ai } = ctx

    const [agent] = await sql`
      SELECT id, chunk_size, chunk_overlap
      FROM agents
      WHERE id = ${params.id} AND tenant_id = ${tenantId} AND type = 'knowledge_base'
    `
    if (!agent) {
      return Response.json({ error: '知识库 Agent 不存在' }, { status: 404 })
    }

    const body = await req.json() as { filename: string; content: string }

    if (!body.filename || !body.content) {
      return Response.json({ error: 'filename 和 content 为必填' }, { status: 400 })
    }

    const chunkSize = agent.chunk_size ?? 500
    const chunkOverlap = agent.chunk_overlap ?? 50

    const chunks = chunkText(body.content, chunkSize, chunkOverlap)
    const embeddings = await ai.embedMany(chunks)

    const [doc] = await sql`
      INSERT INTO kb_documents (agent_id, filename, content, chunk_count)
      VALUES (${params.id}, ${body.filename}, ${body.content}, ${chunks.length})
      RETURNING id, filename, chunk_count, created_at
    `

    for (let i = 0; i < chunks.length; i++) {
      await sql`
        INSERT INTO kb_chunks (document_id, agent_id, content, chunk_index, embedding)
        VALUES (${doc.id}, ${params.id}, ${chunks[i]}, ${i}, ${embeddings.length > i ? `[${embeddings[i].join(',')}]` : '[]'}::vector)
      `
    }

    return Response.json({ document: doc, chunk_count: chunks.length }, { status: 201 })
  })

  // ── 删除文档 ─────────────────────────────────────────────

  app.delete('/api/knowledge/:id', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, tenantId, params } = ctx

    const result = await sql`
      DELETE FROM kb_documents d
      USING agents a
      WHERE d.id = ${params.id}
        AND d.agent_id = a.id
        AND a.tenant_id = ${tenantId}
    `

    if (result.count === 0) {
      return Response.json({ error: '文档不存在' }, { status: 404 })
    }
    return Response.json({ success: true })
  })

  // ── 语义检索 ─────────────────────────────────────────────

  app.post('/api/agents/:id/knowledge/search', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, tenantId, params, ai } = ctx

    const [agent] = await sql`
      SELECT id FROM agents
      WHERE id = ${params.id} AND tenant_id = ${tenantId} AND type = 'knowledge_base'
    `
    if (!agent) {
      return Response.json({ error: '知识库 Agent 不存在' }, { status: 404 })
    }

    const body = await req.json() as { query: string; top_k?: number }
    if (!body.query) {
      return Response.json({ error: 'query 为必填' }, { status: 400 })
    }

    const topK = body.top_k ?? 5
    const queryEmbedding = await ai.embed(body.query)

    const vecStr = `[${queryEmbedding.join(',')}]`
    const results = await sql`
      SELECT
        kc.id, kc.content, kc.chunk_index, kc.document_id,
        kd.filename,
        1 - (kc.embedding <=> ${vecStr}::vector) as similarity
      FROM kb_chunks kc
      JOIN kb_documents kd ON kd.id = kc.document_id
      WHERE kc.agent_id = ${params.id}
      ORDER BY kc.embedding <=> ${vecStr}::vector
      LIMIT ${topK}
    `

    return Response.json({ results })
  })
}

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  if (text.length <= chunkSize) return [text]
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end))
    start += chunkSize - overlap
  }
  return chunks
}
