/**
 * 意图路由（ORCHESTRATION-PLAN Wave 2——O7）
 *
 * 语义路由（无 @ 时）：消息 embedding → 与 AI Agent 能力文本 embedding
 * 余弦相似度 top1 ≥ 阈值 0.55 → 路由单一 Agent（省 token——不全员广播）；
 * 低于阈值/无 AI 成员/embed 失败 → 回退广播（现有全触发——不退化）。
 *
 * 效率：Agent 数量少（每部门个位数）——能力向量每次实时 embed（不需要
 * 持久化缓存——成本低——诚实裁剪）；若后续 Agent 数增长再上缓存。
 */
import type { AppCtx } from '../middleware/ctx.ts'

export const ROUTE_THRESHOLD = 0.55

export interface RouteTarget {
  id: string
  name: string
  role_label?: string | null
  expertise?: string | null
}

export type RouteResult =
  | { kind: 'routed'; agent: RouteTarget; similarity: number }
  | { kind: 'fallback'; similarity?: number }

/** Agent 能力文本（名称 + 角色标签 + 专长——人格化字段已有——路由输入） */
export function abilityTextOf(agent: RouteTarget): string {
  return [agent.name, agent.role_label ?? '', agent.expertise ?? ''].filter(Boolean).join(' ')
}

/** 余弦相似度（内存——向量小——mock 可测——确定性） */
export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/**
 * 意图路由（无 @ 时——chat.ts 触发模型插桩）：
 * @returns routed（top1 ≥ 阈值——只触发该 Agent）/ fallback（回退广播）
 */
export async function routeIntent(
  ctx: Pick<AppCtx, 'ai'>,
  _departmentId: string,
  message: string,
  aiAgents: RouteTarget[],
): Promise<RouteResult> {
  if (aiAgents.length === 0) return { kind: 'fallback' }
  try {
    const qVec = await ctx.ai.embed(String(message).slice(0, 500))
    // 各 Agent 能力向量（实时——Agent 少——成本低）
    const scored: Array<{ agent: RouteTarget; similarity: number }> = []
    for (const agent of aiAgents) {
      const aVec = await ctx.ai.embed(abilityTextOf(agent).slice(0, 300))
      scored.push({ agent, similarity: cosine(qVec, aVec) })
    }
    scored.sort((a, b) => b.similarity - a.similarity)
    const top = scored[0]
    if (top && top.similarity >= ROUTE_THRESHOLD) {
      return { kind: 'routed', agent: top.agent, similarity: top.similarity }
    }
    return { kind: 'fallback', similarity: top?.similarity }
  } catch {
    // embed 服务不可用 → 回退广播（路由尽力——不阻断消息链）
    return { kind: 'fallback' }
  }
}
