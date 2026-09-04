/**
 * KB 语义检索——单一实现源（B6——2026-08）
 *
 * 背景：search_knowledge_base 曾有两份实现（builtin.ts + skills/builtin/
 * search-knowledge-base/tools.ts）——双实现漂移实证（skill 版用旧列
 * tenant_id——工具报错——AI 检索全失败）。本模块为唯一检索逻辑——
 * builtin/skill 都调它。
 *
 * 健壮性（B4/B5）：
 * - embed 失败重试 1 次（瞬态）→ 仍失败返回明确降级文案（不抛工具错误）
 * - 向量质量防线：库中 embedding 若为「随机向量」（embed 失败时回退
 *   Math.random()*2-1——norm≈18.4——与归一化真实向量 norm≈1.0 可区分）
 *   → 检索结果不可信——返回「知识库向量未初始化」明确提示（绝不返回
 *   垃圾相似度结果）
 * - 相似度下限：明显负相关/近零的「结果」不当作知识（用户实证：4.7%
 *   也被当「相关结果」返回——误导 AI）
 */

import type { Context } from 'weifuwu'

/** 随机向量特征：1024 维 × U(-1,1) → norm ≈ sqrt(1024/3) ≈ 18.48——归一化向量 norm ≈ 1 */
function looksRandomVector(v: unknown): boolean {
  if (!Array.isArray(v) || v.length === 0) return true
  const norm = Math.sqrt(v.reduce((s: number, x: number) => s + (x as number) * (x as number), 0))
  // 随机向量 norm 通常 > 5（1024 维）——归一化单位向量 norm ≈ 1——区分度大
  return norm > 5
}

/** embed 失败重试（B5——瞬态重试 1 次——仍失败返回 null——调用方降级） */
async function embedWithRetry(ai: Context['ai'] | undefined, text: string | string[]): Promise<number[] | null> {
  if (!ai) return null
  try {
    const r = Array.isArray(text) ? await ai.embedMany(text) : await ai.embed(text)
    return Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as number[])
  } catch {
    // 瞬态重试 1 次（网络抖动/限流）
    try {
      const r2 = Array.isArray(text) ? await ai.embedMany(text) : await ai.embed(text)
      return Array.isArray(r2) && Array.isArray(r2[0]) ? r2[0] : (r2 as number[])
    } catch {
      return null
    }
  }
}

export interface KbSearchResult {
  filename: string
  content: string
  similarity: number
}

/**
 * 语义检索（单实现源——builtin + skill 共用）
 * @returns 状态 + 结果/提示——调用方直接返回字符串给 AI
 */
export async function searchKnowledgeBase(
  ctx: (Context & { appId: string }) & { orm?: any },
  query: string,
  topK = 5,
  agentId?: string | null,
): Promise<string> {
  const orm = ctx.orm
  if (!query) return '请提供搜索关键词'

  // 绑定知识库优先（agent.kb_id → 只检索绑定 KB；未绑定 → 检索租户全部）
  agentId = agentId ?? null
  let kbs: Array<{ id: string; name: string }> = []
  if (agentId) {
    try {
      const [agent] = await orm.query.from('agents a')
        .join('agents kb', { 'kb.id': { col: 'a.kb_id' } }, { type: 'left' })
        .select('a.kb_id', 'kb.name as kb_name')
        .where({ 'a.id': agentId, 'a.app_id': String(ctx.appId) })
        .limit(1)
        .run()
      if ((agent as any)?.kb_id && (agent as any).kb_name) {
        kbs = [{ id: (agent as any).kb_id, name: (agent as any).kb_name }]
      }
    } catch { /* kb_id 查询失败——按全租户 */ }
  }
  if (kbs.length === 0) {
    try {
      const rows = await orm.query.from('agents')
        .select('id', 'name')
        .where({ app_id: String(ctx.appId), type: 'knowledge_base', is_active: true })
        .limit(5)
        .run()
      kbs = rows as unknown as Array<{ id: string; name: string }>
    } catch { /* 查询失败——无 KB */ }
  }
  if (kbs.length === 0) {
    return '没有找到已激活的知识库。请先创建 knowledge_base 类型的 Agent 并上传文档。'
  }

  // 查询向量（B5：失败重试 + 降级——不抛工具错误）
  const queryVec = await embedWithRetry(ctx.ai as any, query)
  if (!queryVec) {
    return '知识库检索暂不可用（Embedding 服务异常，已重试仍失败）。请稍后重试，或直接描述你的需求。'
  }

  const results: KbSearchResult[] = []
  let randomVectorHit = false
  for (const kb of kbs) {
    let chunks: Array<Record<string, any>>
    try {
      // orm-pg-vector 判负修订：vectorScore 特化（同 embedding.service）
      chunks = await orm.query.from('kb_chunks kc')
        .join('kb_documents kd', { 'kd.id': { col: 'kc.document_id' } })
        .select('kc.content', 'kd.filename', 'kc.embedding')
        .vectorScore('kc.embedding', queryVec, 'similarity')
        .where({ 'kc.agent_id': { eq: String(kb.id) } })
        .limit(3)
        .run()
    } catch {
      continue // 单 KB 查询失败——跳过（其他 KB 可继续）
    }
    for (const c of chunks) {
      // B4 向量质量防线：库中向量若是随机回退 → 结果不可信（明确提示）
      try {
        const stored = JSON.parse(c.embedding)
        if (looksRandomVector(stored)) randomVectorHit = true
      } catch { /* 解析失败——按不可信处理 */ }
      results.push({ filename: c.filename, content: c.content, similarity: Number(c.similarity) })
    }
  }

  // B4：随机回退检测——不返回垃圾结果（用户实证：4.7% 也被当「相关」）
  if (randomVectorHit) {
    return '知识库向量索引异常（检测到未初始化的向量数据——可能是上传时 Embedding 服务不可用）。请对知识库执行「重新索引」后再检索，或用其他方式回答。'
  }

  results.sort((a, b) => b.similarity - a.similarity)
  const top = results.slice(0, topK)

  // 相似度下限：近零/负相似 = 内容无关——不返回（误导 AI 引用无关 chunk）
  const relevant = top.filter((r) => r.similarity > 0.05)
  if (relevant.length === 0) {
    return '知识库中没有找到与问题相关的信息（语义相似度低于可用阈值）。'
  }

  return relevant
    .map((r, i) =>
      `[${i + 1}] 来自 "${r.filename}" (相似度: ${(r.similarity * 100).toFixed(1)}%)\n${r.content}`
    )
    .join('\n\n')
}
