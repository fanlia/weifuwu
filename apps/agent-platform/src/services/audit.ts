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
    const { sql } = ctx
    await sql`
      INSERT INTO audit_logs (app_id, user_id, action, target_type, target_id, detail)
      VALUES (${ctx.appId}, ${ctx.user?.id ?? null}, ${entry.action},
        ${entry.target_type ?? null}, ${entry.target_id ?? null},
        ${entry.detail ? JSON.stringify(entry.detail) : null})
    `
  } catch {
    /* 审计失败不影响主流程 */
  }
}

/** 查询审计日志（本租户，分页——action/时间范围筛选（C3）） */
export async function listAudit(ctx: AppCtx, opts: { limit?: number; offset?: number; action?: string; from?: string; to?: string }): Promise<{ entries: any[]; total: number }> {
  const { sql } = ctx
  const limit = Math.min(opts.limit ?? 50, 100)
  const offset = opts.offset ?? 0
  const whereAction = opts.action ? sql`AND action = ${opts.action}` : sql``
  const whereFrom = opts.from ? sql`AND created_at >= ${opts.from}::timestamptz` : sql``
  const whereTo = opts.to ? sql`AND created_at <= ${opts.to}::timestamptz` : sql``
  const rows = await sql`
    SELECT action, target_type, target_id, detail, created_at,
      COALESCE((SELECT name FROM _weifuwu_users u WHERE u.id = a.user_id), 'system') AS user_name
    FROM audit_logs a
    WHERE app_id = ${ctx.appId} ${whereAction} ${whereFrom} ${whereTo}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `
  const [countRow] = await sql`SELECT COUNT(*)::int AS total FROM audit_logs WHERE app_id = ${ctx.appId} ${whereAction} ${whereFrom} ${whereTo}`
  return { entries: rows ?? [], total: Number((countRow as any)?.total ?? 0) }
}
