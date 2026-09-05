/**
 * 知识库路由 — 文档上传/检索/管理
 *
 * 支持：
 * - 文本粘贴上传
 * - 文件上传（.txt / .md / .csv / .json）
 * - 批量上传
 * - 文档详情（含所有 chunks）
 * - 语义检索
 */

import type { Router, Context } from 'weifuwu'
import { HttpError } from 'weifuwu'
import { and, eq } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'
import { tables } from '../db/orm.ts'

/** 支持的文件类型 */
const SUPPORTED_MIME: Record<string, string> = {
  'text/plain': '.txt',
  'text/markdown': '.md',
  'text/csv': '.csv',
  'application/json': '.json',
}

export function registerKnowledgeRoutes(app: Router<AppCtx>): void {
  // ── 获取文档列表 ──────────────────────────────────────

  app.get('/api/agents/:id/knowledge', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx

    const T = tables(ctx.orm)
    const [agent] = await T.agents
      .select('id')
      .where(and(eq(T.agents.c.id, params.id), eq(T.agents.c.app_id, appId), eq(T.agents.c.type, 'knowledge_base')))
      .run()
    if (!agent) {
      throw new HttpError('知识库 Agent 不存在', 404)
    }

    const documents = await T.kb_documents
      .select('id', 'filename', 'chunk_count', 'created_at')
      .where(eq(T.kb_documents.c.agent_id, params.id))
      .orderBy('created_at', 'desc')
      .run()

    return Response.json({ documents })
  })

  // ── 获取文档详情（含内容预览 + chunks） ───────────────

  app.get('/api/knowledge/:id', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const url = new URL(req.url)
    const includeChunks = url.searchParams.get('chunks') === 'true'

    const [doc] = await ctx.orm.query.from('kb_documents d')
      .join('agents a', { 'a.id': { col: 'd.agent_id' } })
      .select('d.id', 'd.filename', 'd.content', 'd.chunk_count', 'd.created_at')
      .where(and({ 'd.id': { eq: params.id }}, { 'a.app_id': { eq: appId } }))
      .run()
    if (!doc) {
      throw new HttpError('文档不存在', 404)
    }

    let chunks: any[] = []
    if (includeChunks) {
      const T = tables(ctx.orm)
      chunks = await T.kb_chunks
        .select('id', 'content', 'chunk_index', 'created_at')
        .where(eq(T.kb_chunks.c.document_id, params.id))
        .orderBy('chunk_index', 'asc')
        .run()
    }

    return Response.json({ document: doc, chunks })
  })

  // ── 文本上传文档 ─────────────────────────────────────

  app.post('/api/agents/:id/knowledge', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params, ai } = ctx

    const T = tables(ctx.orm)
    const [agent] = await T.agents
      .select('id', 'chunk_size', 'chunk_overlap')
      .where(and(eq(T.agents.c.id, params.id), eq(T.agents.c.app_id, appId), eq(T.agents.c.type, 'knowledge_base')))
      .run()
    if (!agent) {
      throw new HttpError('知识库 Agent 不存在', 404)
    }

    const body = await req.json() as { filename: string; content: string }

    if (!body.filename || !body.content) {
      throw new HttpError('filename 和 content 为必填', 400)
    }
    // 文档内容上限（200KB——分块/嵌入成本控制）
    body.content = String(body.content).slice(0, 200_000)
    body.filename = String(body.filename).slice(0, 200)

    const result = await processDocument(ctx, params.id, agent as any, body.filename, body.content)
    return Response.json(result, { status: 201 })
  })

  // ── 文件上传 ─────────────────────────────────────────

  app.post('/api/agents/:id/knowledge/upload', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params, ai } = ctx

    const T = tables(ctx.orm)
    const [agent] = await T.agents
      .select('id', 'chunk_size', 'chunk_overlap')
      .where(and(eq(T.agents.c.id, params.id), eq(T.agents.c.app_id, appId), eq(T.agents.c.type, 'knowledge_base')))
      .run()
    if (!agent) {
      throw new HttpError('知识库 Agent 不存在', 404)
    }

    // 解析 multipart/form-data
    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      throw new HttpError('请求格式错误，需要 multipart/form-data', 400)
    }

    const uploaded: Array<{ filename: string; content: string }> = []
    const errors: Array<{ filename: string; error: string }> = []

    for (const [key, value] of formData.entries()) {
      if (!(value instanceof File)) continue
      const file = value as File

      // 检查文件类型
      const ext = file.name.split('.').pop()?.toLowerCase()
      const validExts = ['txt', 'md', 'csv', 'json', 'text', 'markdown']
      if (!ext || !validExts.includes(ext)) {
        errors.push({ filename: file.name, error: `不支持的文件类型 .${ext}，仅支持 .txt .md .csv .json` })
        continue
      }

      // 文件大小限制（5MB）
      if (file.size > 5 * 1024 * 1024) {
        errors.push({ filename: file.name, error: '文件超过 5MB 大小限制' })
        continue
      }

      try {
        const content = await file.text()
        uploaded.push({ filename: file.name, content })
      } catch (err) {
        errors.push({ filename: file.name, error: `读取失败: ${err instanceof Error ? err.message : String(err)}` })
      }
    }

    if (uploaded.length === 0 && errors.length > 0) {
      return Response.json({ error: `所有文件上传失败`, details: errors }, { status: 400 })
    }

    // 处理上传的文档
    const results = []
    for (const doc of uploaded) {
      try {
        const result = await processDocument(ctx, params.id, agent as any, doc.filename, doc.content)
        results.push(result)
      } catch (err) {
        errors.push({ filename: doc.filename, error: `处理失败: ${err instanceof Error ? err.message : String(err)}` })
      }
    }

    return Response.json({
      success: results.length,
      errors: errors.length > 0 ? errors : undefined,
      documents: results.map(r => r.document),
    }, { status: errors.length > 0 ? 207 : 201 })
  })

  // ── 批量上传（JSON body: { documents: [{ filename, content }] }） ──

  app.post('/api/agents/:id/knowledge/batch', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params, ai } = ctx

    const T = tables(ctx.orm)
    const [agent] = await T.agents
      .select('id', 'chunk_size', 'chunk_overlap')
      .where(and(eq(T.agents.c.id, params.id), eq(T.agents.c.app_id, appId), eq(T.agents.c.type, 'knowledge_base')))
      .run()
    if (!agent) {
      throw new HttpError('知识库 Agent 不存在', 404)
    }

    const body = await req.json() as { documents: Array<{ filename: string; content: string }> }

    if (!body.documents || !Array.isArray(body.documents) || body.documents.length === 0) {
      throw new HttpError('documents 为必填，需包含 filename 和 content 的数组', 400)
    }

    if (body.documents.length > 20) {
      throw new HttpError('单次最多上传 20 个文档', 400)
    }

    const results = []
    const errors = []

    for (const doc of body.documents) {
      if (!doc.filename || !doc.content) {
        errors.push({ filename: doc.filename ?? '未知', error: '缺少 filename 或 content' })
        continue
      }
      try {
        const result = await processDocument(ctx, params.id, agent as any, doc.filename, doc.content)
        results.push(result)
      } catch (err) {
        errors.push({ filename: doc.filename, error: `处理失败: ${err instanceof Error ? err.message : String(err)}` })
      }
    }

    return Response.json({
      success: results.length,
      errors: errors.length > 0 ? errors : undefined,
      documents: results.map(r => r.document),
    }, { status: errors.length > 0 ? 207 : 201 })
  })

  // ── 删除文档 ─────────────────────────────────────────

  app.delete('/api/knowledge/:id', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx

    // 租户隔离：先查 doc.agent_id 归属再删（USING JOIN 拆两步——同语义）
    const T = tables(ctx.orm)
    const [own] = await ctx.orm.query.from('kb_documents d')
      .join('agents a', { 'a.id': { col: 'd.agent_id' } })
      .select('d.id')
      .where(and({ 'd.id': { eq: params.id }}, { 'a.app_id': { eq: appId } }))
      .run()
    if (!own) throw new HttpError('文档不存在', 404)
    const result = await T.kb_documents
      .delete()
      .where(eq(T.kb_documents.c.id, params.id))
      .returning('id')
      .run()

    if (result.length === 0) {
      throw new HttpError('文档不存在', 404)
    }
    return Response.json({ success: true })
  })

  // ── 重新向量化（修复旧 chunk 的随机/失效 embedding；嵌入失败时回退随机向量的历史数据）──

  app.post('/api/agents/:id/knowledge/reindex', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx

    const T = tables(ctx.orm)
    const [agent] = await T.agents
      .select('id', 'chunk_size', 'chunk_overlap')
      .where(and(eq(T.agents.c.id, params.id), eq(T.agents.c.app_id, appId), eq(T.agents.c.type, 'knowledge_base')))
      .run()
    if (!agent) {
      throw new HttpError('知识库 Agent 不存在', 404)
    }

    const docs = await T.kb_documents
      .select('id', 'filename', 'content')
      .where(eq(T.kb_documents.c.agent_id, params.id))
      .run()

    let reindexed = 0
    for (const doc of docs as Array<Record<string, any>>) {
      const chunks = chunkText(String(doc.content), (agent as any).chunk_size ?? 500, (agent as any).chunk_overlap ?? 50)
      let embeddings: number[][]
      try {
        embeddings = await ctx.ai.embedMany(chunks)
        // B4（2026-08）：embed 质量验证——归一化向量 norm≈1——若异常（随机回退/
        // 维度不符）→ 报错（绝不悄悄写入垃圾向量——污染实证：库中 norm≈18.5）
        if (embeddings.length !== chunks.length || !Array.isArray(embeddings[0])) {
          throw new Error('embedMany 返回形态异常')
        }
        for (const e of embeddings) {
          const norm = Math.sqrt(e.reduce((s: number, x: number) => s + x * x, 0))
          if (norm > 5) throw new Error('embedding 向量未归一化（疑似随机回退）——拒绝写入')
        }
      } catch (err: any) {
        // B5（2026-08）：embed 失败不再回退随机向量（此前：失败→随机向量→
        // 检索全部失真——norm≈18.5 实证）——明确报错——管理员可见/可重试
        throw new Error(`知识库重新索引失败（Embedding 服务异常）——未写入任何数据: ${err?.message ?? 'unknown'}`)
      }
      // 删旧 chunk → 存新（向量字面量——直插；embedding 语义不进 builder——保持逐文直写）
      await T.kb_chunks.delete().where(eq(T.kb_chunks.c.document_id, doc.id)).run()
      const [docRow] = await T.kb_documents
        .update({ chunk_count: chunks.length })
        .where(eq(T.kb_documents.c.id, doc.id))
        .returning('id')
        .run()
      for (let i = 0; i < chunks.length; i++) {
        await T.kb_chunks
          .insert({ document_id: String(doc.id), agent_id: params.id, content: chunks[i], chunk_index: i, embedding: `[${embeddings[i].join(',')}]` })
          .run()
      }
      reindexed++
    }

    return Response.json({ success: true, reindexed, docs: docs.length })
  })

  // ── 语义检索 ─────────────────────────────────────────

  app.post('/api/agents/:id/knowledge/search', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params, ai } = ctx

    const T = tables(ctx.orm)
    const [agent] = await T.agents
      .select('id')
      .where(and(eq(T.agents.c.id, params.id), eq(T.agents.c.app_id, appId), eq(T.agents.c.type, 'knowledge_base')))
      .run()
    if (!agent) {
      throw new HttpError('知识库 Agent 不存在', 404)
    }

    const body = await req.json() as { query: string; top_k?: number }
    if (!body.query) {
      throw new HttpError('query 为必填', 400)
    }

    const topK = body.top_k ?? 5
    const queryEmbedding = await ai.embed(body.query)

    // orm-pg-vector 判负修订：`<=>` 算子 → vectorScore 特化（框架编译 `1-(col<=>vec) as as` + ORDER BY）
    const results = await ctx.orm.query.from('kb_chunks kc')
      .join('kb_documents kd', { 'kd.id': { col: 'kc.document_id' } })
      .select('kc.id', 'kc.content', 'kc.chunk_index', 'kc.document_id', 'kd.filename')
      .vectorScore('kc.embedding', queryEmbedding, 'similarity')
      .where({ 'kc.agent_id': { eq: params.id } })
      .limit(topK)
      .run()

    return Response.json({ results })
  })
}

/**
 * 处理文档：分块 → 向量化 → 入库
 */
async function processDocument(
  ctx: AppCtx,
  agentId: string,
  agent: { chunk_size: number; chunk_overlap: number },
  filename: string,
  content: string,
): Promise<{ document: any; chunk_count: number }> {
  const { sql, ai } = ctx
  const chunkSize = agent.chunk_size ?? 500
  const chunkOverlap = agent.chunk_overlap ?? 50

  const chunks = chunkText(content, chunkSize, chunkOverlap)
  // B4/B5（2026-08）：Embedding 失败→**报错**（此前回退随机向量——库中
  // norm≈18.5 随机向量实证——检索全部失真——相似度 4.7% 也让 AI 当“相关”
  // ——上传失败必须显式——宁可不存不可错存）
  let embeddings: number[][]
  try {
    embeddings = await ai.embedMany(chunks)
    if (embeddings.length !== chunks.length || !Array.isArray(embeddings[0])) {
      throw new Error('embedMany 返回形态异常')
    }
    for (const e of embeddings) {
      const norm = Math.sqrt(e.reduce((s: number, x: number) => s + x * x, 0))
      if (norm > 5) throw new Error('embedding 向量未归一化（疑似随机回退）——拒绝写入')
    }
  } catch (err: any) {
    throw new Error(`文档向量化失败（Embedding 服务异常）——未上传: ${err?.message ?? 'unknown'}`)
  }

  const T = tables(ctx.orm)
  const [doc] = await T.kb_documents
    .insert({ agent_id: agentId, filename, content, chunk_count: chunks.length })
    .returning('id', 'filename', 'chunk_count', 'created_at')
    .run()

  return storeChunks(ctx.orm, agentId, doc, chunks, embeddings)
}

/** 存储文档分块 */
async function storeChunks(orm: any, agentId: string, doc: any, chunks: string[], embeddings: number[][]) {
  const T = tables(orm)
  for (let i = 0; i < chunks.length; i++) {
    await T.kb_chunks
      .insert({ document_id: String(doc.id), agent_id: agentId, content: chunks[i], chunk_index: i, embedding: embeddings.length > i ? `[${embeddings[i].join(',')}]` : '[]' })
      .run()
  }
  return { document: doc, chunk_count: chunks.length }
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
