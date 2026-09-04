/**
 * C5 配额 80% 告警——用量达阈值邮件提醒租户 owner（每日一次防刷）
 */

import { ops } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'

export async function maybeAlertQuota(ctx: AppCtx, appId: string): Promise<void> {
  try {
    const orm = ctx.orm
    const [app] = await orm.query.from('_weifuwu_apps').select('monthly_token_limit', 'last_quota_alert_at').where({ id: { eq: appId }}).limit(1).run()
    const limit = Number((app as any)?.monthly_token_limit ?? 0)
    if (limit <= 0) return
    // 每日一次：上次提醒在 24h 内则跳过
    const last = (app as any)?.last_quota_alert_at ? new Date(String((app as any).last_quota_alert_at)) : null
    if (last && Date.now() - last.getTime() < 24 * 3600 * 1000) return
    const [usedRow] = await orm.query.from('agent_logs')
      .sum('tokens_total', 'used')
      .whereRaw("app_id = $1 AND created_at >= DATE_TRUNC('month', NOW())", [appId])
      .run()
    const used = Number((usedRow as any)?.used ?? 0)
    if (used < limit * 0.8) return
    // 邮件 owner
    const owners = await orm.query.from('_weifuwu_app_members m')
      .join('_weifuwu_users u', { 'u.id': { col: 'm.user_id' } })
      .select('u.email')
      .where({ 'm.app_id': { eq: appId }, 'm.role': { eq: 'owner' } })
      .run()
    for (const o of owners as Array<{ email?: string }>) {
      if (!o.email) continue
      await (ctx as any).email?.send?.({
        to: o.email,
        subject: `[Agent Platform] 本月配额已用 ${Math.round(used / limit * 100)}%`,
        text: `本月 token 用量 ${used.toLocaleString()} / ${limit.toLocaleString()}（${Math.round(used / limit * 100)}%）。超过 100% 后 AI 回复将暂停，请联系管理员调整配额。`,
        html: `<p>本月 token 用量 <b>${used.toLocaleString()} / ${limit.toLocaleString()}</b>（${Math.round(used / limit * 100)}%）。</p><p>超过 100% 后 AI 回复将暂停，请联系管理员调整配额。</p>`,
      })
    }
    await orm.query.update('_weifuwu_apps').set({ last_quota_alert_at: ops.now() }).where({ id: { eq: appId }}).run()
  } catch { /* 告警失败不阻断 */ }
}
