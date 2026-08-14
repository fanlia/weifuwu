/**
 * 管理路由 — 商业化 G2 租户管理后台（平台管理员）
 *
 * 管理员身份：env ADMIN_EMAILS（逗号分隔邮箱白名单）——简单安全，不引入角色表。
 * 能力：租户列表（成员/Agent/用量）/ 停用启用（app.status）。
 */

import type { Router } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'

/** 管理员白名单（env ADMIN_EMAILS）——空 = 无管理员 */
function adminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? ''
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false
  return adminEmails().has(email.trim().toLowerCase())
}

export function registerAdminRoutes(app: Router<AppCtx>): void {
  // 管理员校验（403 非管理员）——token 无 email 字段，从 userId 查库
  const adminEmailOf = async (ctx: AppCtx): Promise<string> => {
    const rows = await ctx.sql`SELECT email FROM _weifuwu_users WHERE id = ${ctx.auth.userId}`
    return String(rows[0]?.email ?? '')
  }
  const requireAdmin = async (ctx: AppCtx): Promise<void> => {
    const email = await adminEmailOf(ctx)
    if (!isAdminEmail(email)) throw new Error('需要管理员权限') as any
  }

  // 当前用户是否管理员（前端导航显示用）
  app.get('/api/admin/me', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    return Response.json({ isAdmin: isAdminEmail(await adminEmailOf(ctx)) })
  })

  // 租户列表：app + 成员数 + Agent 数 + Token 用量 + 状态
  app.get('/api/admin/apps', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    await requireAdmin(ctx)
    const { sql } = ctx
    const apps = await sql`
      SELECT a.id, a.slug, a.name, a.status, a.created_at,
        (SELECT COUNT(*)::int FROM _weifuwu_app_members m WHERE m.app_id = a.id) AS member_count,
        (SELECT COUNT(*)::int FROM agents ag WHERE ag.app_id = a.id) AS agent_count,
        COALESCE((SELECT SUM(l.tokens_total)::int FROM agent_logs l WHERE l.app_id = a.id), 0) AS token_usage,
        COALESCE((SELECT SUM(l.tokens_total)::int FROM agent_logs l WHERE l.app_id = a.id AND l.created_at >= date_trunc('month', now())), 0) AS token_usage_month
      FROM _weifuwu_apps a
      ORDER BY a.created_at DESC
    `
    return Response.json({ apps })
  })

  // 停用/启用租户（app.status）
  app.post('/api/admin/apps/:id/status', async (req: Request, ctx: AppCtx): Promise<Response> => {
    await requireAdmin(ctx)
    const body = await req.json() as { status?: string }
    const status = body.status === 'disabled' ? 'disabled' : 'active'
    const appId = ctx.params.id
    await ctx.sql`UPDATE _weifuwu_apps SET status = ${status} WHERE id = ${appId}`
    try {
      const { writeAudit } = await import('../services/audit.ts')
      await writeAudit(ctx as any, { action: 'admin_app_status', target_type: 'app', target_id: appId, detail: { status } })
    } catch { /* 尽力 */ }
    return Response.json({ ok: true, status })
  })
}
