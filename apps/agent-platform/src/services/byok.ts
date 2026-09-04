/**
 * BYOK 服务 — 商业化 G4：租户自带模型 Key（OpenAI 兼容端点）
 *
 * app_ai_configs 表（app_id 主键）：base_url/api_key/model。
 * 未配置 → 返回 null（走全局 DEEPSEEK_API_KEY）。
 */

import type { AppCtx } from '../middleware/ctx.ts'

export interface ByokConfig {
  base_url: string | null
  api_key: string | null
  model: string | null
}

/** 读租户 BYOK 配置（未配置返回 null） */
export async function getByokConfig(orm: any, appId: string): Promise<ByokConfig | null> {
  const rows = await orm.query.from('app_ai_configs').select('base_url', 'api_key', 'model').where({ app_id: appId }).limit(1).run()
  const row = rows[0] as unknown as ByokConfig | undefined
  if (!row || (!row.base_url && !row.api_key)) return null
  return row
}

/** BYOK 生效时透传给 ai 调用的参数（apiKey/baseUrl/model——框架 per-call 覆盖） */
export async function byokParamsOf(orm: any, appId: string): Promise<{ apiKey?: string; baseUrl?: string; model?: string }> {
  const cfg = await getByokConfig(orm, appId)
  if (!cfg) return {}
  return {
    ...(cfg.api_key ? { apiKey: cfg.api_key } : {}),
    ...(cfg.base_url ? { baseUrl: cfg.base_url } : {}),
    ...(cfg.model ? { model: cfg.model } : {}),
  }
}
