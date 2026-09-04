import { ops } from 'weifuwu'

/**
 * 订阅计划服务 — 商业化 G1 付费墙状态机
 *
 * 分层：free（14 天试用 + 月配额 5 万 token）/ pro（月配额 100 万，管理员开通）。
 * 状态机：注册 → free+试用 → 试用到期（AI 拒绝回复，提示升级）→ 管理员开通 pro。
 * 无支付网关：线下付费 + 管理员手动开通（G2 管理后台）。
 */

export const PLANS = {
  free: { trialDays: 14, monthlyTokenLimit: 50_000, label: '免费版' },
  pro: { monthlyTokenLimit: 1_000_000, label: 'Pro' },
} as const

export type PlanName = keyof typeof PLANS

export interface AppPlanRow {
  plan: string
  trial_ends_at: string | null
  monthly_token_limit: number
}

/** 租户计划状态（管理/租户侧展示用） */
export interface PlanStatus {
  plan: PlanName
  label: string
  trialEndsAt: string | null
  trialExpired: boolean
  monthlyTokenLimit: number
  /** 本月已用 token（调用方聚合传入；null = 未查） */
  usedThisMonth?: number
}

/** 读租户计划行（幂等：老数据补默认 free） */
export async function getAppPlan(
  orm: any,
  appId: string,
): Promise<AppPlanRow> {
  const rows = await orm.query.from('_weifuwu_apps').select('plan', 'trial_ends_at', 'monthly_token_limit').where({ id: { eq: appId } }).limit(1).run()
  const row = rows[0] as unknown as AppPlanRow | undefined
  if (!row) return { plan: 'free', trial_ends_at: null, monthly_token_limit: PLANS.free.monthlyTokenLimit }
  return {
    plan: row.plan === 'pro' ? 'pro' : 'free',
    trial_ends_at: row.trial_ends_at,
    monthly_token_limit: Number(row.monthly_token_limit ?? (row.plan === 'pro' ? PLANS.pro.monthlyTokenLimit : PLANS.free.monthlyTokenLimit)),
  }
}

/** 计划状态视图（trialExpired 判定） */
export function planStatusOf(row: AppPlanRow, usedThisMonth?: number): PlanStatus {
  const trialEndsAt = row.trial_ends_at
  const trialExpired = row.plan === 'free' && !!trialEndsAt && new Date(trialEndsAt).getTime() < Date.now()
  return {
    plan: row.plan as PlanName,
    label: row.plan === 'pro' ? PLANS.pro.label : PLANS.free.label,
    trialEndsAt,
    trialExpired,
    monthlyTokenLimit: row.monthly_token_limit,
    usedThisMonth,
  }
}

/** 计划拦截判定：返回拒绝原因（null = 放行） */
export async function planBlockReason(
  orm: any,
  appId: string,
): Promise<string | null> {
  const row = await getAppPlan(orm, appId)
  // 1) 免费版试用到期 → 拒绝
  const st = planStatusOf(row)
  if (st.trialExpired) {
    return `⚠️ 免费版试用已到期，AI 回复已暂停。请联系管理员开通 Pro 继续使用。`
  }
  // 2) 月配额超限（免费版 5 万 / Pro 100 万）→ 拒绝
  if (row.monthly_token_limit > 0) {
    const [usedRow] = await orm.query.from('agent_logs')
      .sum('tokens_total', 'used')
      .where({ app_id: { eq: appId }, created_at: { gte: ops.monthStart() } })
      .run()
    const used = Number((usedRow as any)?.used ?? 0)
    if (used >= row.monthly_token_limit) {
      return `⚠️ 本月 token 配额（${row.monthly_token_limit.toLocaleString()}）已用尽，AI 回复已暂停。请联系管理员调整配额或下月恢复。`
    }
  }
  return null
}

import type { AppCtx } from '../middleware/ctx.ts'
