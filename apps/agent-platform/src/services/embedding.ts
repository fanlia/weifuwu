/**
 * Embedding 服务 — 文档分块 + 向量化 + pgvector 检索
 */

import type { Context } from 'weifuwu'

export interface ChunkResult {
  chunks: string[]
  embeddings: number[][]
}

export interface SearchResult {
  id: string
  content: string
  documentId: string
  filename: string
  similarity: number
}

/**
 * 文档分块 + 向量化
 */
export async function chunkAndEmbed(
  ctx: Context,
  content: string,
  chunkSize = 500,
  chunkOverlap = 50,
): Promise<ChunkResult> {
  const { ai } = ctx
  const chunks = splitText(content, chunkSize, chunkOverlap)
  const embeddings = await ai.embedMany(chunks)

  return { chunks, embeddings }
}

/**
 * 语义检索知识库
 */
export async function searchKnowledgeBase(
  ctx: Context,
  agentId: string,
  query: string,
  topK = 5,
): Promise<SearchResult[]> {
  const { sql, ai } = ctx

  const queryEmbedding = await ai.embed(query)
  const vecStr = `[${queryEmbedding.join(',')}]`

  const results = await sql`
    SELECT
      kc.id, kc.content, kc.document_id, kd.filename,
      1 - (kc.embedding <=> ${vecStr}::vector) as similarity
    FROM kb_chunks kc
    JOIN kb_documents kd ON kd.id = kc.document_id
    WHERE kc.agent_id = ${agentId}
    ORDER BY kc.embedding <=> ${vecStr}::vector
    LIMIT ${topK}
  `

  return results.map((r: any) => ({
    id: r.id,
    content: r.content,
    documentId: r.document_id,
    filename: r.filename,
    similarity: r.similarity,
  }))
}

/**
 * 检索知识库并构建上下文提示
 */
export async function buildKnowledgeContext(
  ctx: Context,
  agentId: string,
  query: string,
  topK = 5,
): Promise<string> {
  const results = await searchKnowledgeBase(ctx, agentId, query, topK)

  if (results.length === 0) return ''

  const context = results
    .map((r, i) => `[${i + 1}] (${r.filename}) ${r.content}`)
    .join('\n\n')

  return `以下是与用户问题相关的知识库内容：\n\n${context}\n\n请基于以上内容回答用户问题。`
}

/**
 * 文本分块工具
 */
function splitText(text: string, chunkSize: number, overlap: number): string[] {
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
