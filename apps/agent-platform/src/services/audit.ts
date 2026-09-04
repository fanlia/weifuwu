/**
 * 审计日志服务（Wave 9——安全/合规：登录/Agent 变更/审批操作）
 *
 * 记录点：登录成功/失败、Agent 创建/更新/删除、审批操作。
 * 查询：GET /api/audit（本租户，分页）——只读审计，不可修改。
 */

import type { AppCtx } from '../middleware/ctx.ts'

export interface AuditEntry {
  action: string
  target_type?: string
  target_id?: string
  detail?: Record<string, unknown>
}

/** 写入审计日志（尽力——失败不影响主流程） */
export async function writeAudit(ctx: AppCtx, entry: AuditEntry): Promise<void> {
  try {
    await ctx.orm.query.insert('audit_logs')
      .values({
        app_id: String(ctx.appId), user_id: ctx.user?.id ?? null,
        action: entry.action, target_type: entry.target_type ?? null,
        target_id: entry.target_id ?? null, detail: entry.detail ?? null,
      })
      .run()
  } catch {
    /* 审计失败不影响主流程 */
  }
}

/** 查询审计日志（本租户，分页——action/时间范围筛选（C3）） */
export async function listAudit(ctx: AppCtx, opts: { limit?: number; offset?: number; action?: string; from?: string; to?: string }): Promise<{ entries: any[]; total: number }> {
  const orm = ctx.orm
  const limit = Math.min(opts.limit ?? 50, 100)
  const offset = opts.offset ?? 0
  // orm-pg-subquery 判负修订（2027-xx）：user_name 标量子查询 → 主查+用户组查 Map 合并
  // 同列双条件必须对象内合并（spread 同键覆盖——gte/lte 丢一——G4f 实证）
  const created_at: { gte?: string; lte?: string } = {}
  if (opts.from) created_at.gte = opts.from
  if (opts.to) created_at.lte = opts.to
  const baseWhere: import('weifuwu').WhereExpr = {
    app_id: { eq: String(ctx.appId) },
    ...(opts.action ? { action: { eq: opts.action } } : {}),
    ...(Object.keys(created_at).length ? { created_at } : {}),
  }
  const rows = await orm.query.from('audit_logs').select('user_id', 'action', 'target_type', 'target_id', 'detail', 'created_at')
    .where(baseWhere).orderBy('created_at', 'desc').limit(limit).offset(offset).run()
  const userIds = [...new Set(rows.map((r) => r.user_id ? String(r.user_id) : '').filter(Boolean))]
  const urows = userIds.length ? await orm.query.from('_weifuwu_users').select('id', 'name').where({ id: { in: userIds } }).run() : []
  const uMap = new Map(urows.map((u) => [String(u.id), String(u.name ?? '')]))
  const entries = (rows ?? []).map((r) => ({ ...r, user_name: r.user_id ? (uMap.get(String(r.user_id)) ?? 'system') : 'system' }))
  const [countRow] = await orm.query.from('audit_logs').count('*', 'total').where(baseWhere).run()
  return { entries: entries as any[], total: Number((countRow as any)?.total ?? 0) }
}
