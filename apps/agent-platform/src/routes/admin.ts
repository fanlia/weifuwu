/**
 * 管理路由 — 商业化 G2 租户管理后台（平台管理员）
 *
 * 管理员身份：env ADMIN_EMAILS（逗号分隔邮箱白名单）——简单安全，不引入角色表。
 * 能力：租户列表（成员/Agent/用量）/ 停用启用（app.status）。
 */

import type { Router } from 'weifuwu'
import { HttpError } from 'weifuwu'
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
  // 租户侧计划状态（非管理员也可看——Settings 显示试用/配额）
  app.get('/api/plan', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    const { getAppPlan, planStatusOf, PLANS } = await import('../services/plan.ts')
    const row = await getAppPlan(ctx.sql, ctx.appId)
    const [usedRow] = await ctx.sql`
      SELECT COALESCE(SUM(tokens_total), 0)::int AS used
      FROM agent_logs WHERE app_id = ${ctx.appId} AND created_at >= DATE_TRUNC('month', NOW())
    `
    return Response.json(planStatusOf(row, Number((usedRow as any)?.used ?? 0)))
  })

  // 管理员校验（403 非管理员）——token 无 email 字段，从 userId 查库
  const adminEmailOf = async (ctx: AppCtx): Promise<string> => {
    const rows = await ctx.sql`SELECT email FROM _weifuwu_users WHERE id = ${ctx.auth.userId}`
    return String(rows[0]?.email ?? '')
  }
  const requireAdmin = async (ctx: AppCtx): Promise<void> => {
    const email = await adminEmailOf(ctx)
    if (!isAdminEmail(email)) {
      // 2026-08（UI 角色测试）：throw 到 handler 层 = 500——权限错误应 403
      // 显式响应（permissions 模式——路由内 catch 转 Response）
      throw new HttpError('需要管理员权限', 403)
    }
  }

  // 当前用户是否管理员（前端导航显示用）
  app.get('/api/admin/me', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    return Response.json({ isAdmin: isAdminEmail(await adminEmailOf(ctx)) })
  })

  // 平台使用概览（G11 使用分析——管理员看整体活跃/成本/转化）
  app.get('/api/admin/overview', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    await requireAdmin(ctx)
    const { sql } = ctx
    const [total] = await sql`SELECT COUNT(*)::int AS apps FROM _weifuwu_apps`
    const [active] = await sql`SELECT COUNT(*)::int AS cnt FROM _weifuwu_apps WHERE status = 'active'`
    const [pros] = await sql`SELECT COUNT(*)::int AS cnt FROM _weifuwu_apps WHERE plan = 'pro'`
    const [msgs] = await sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE a.type = 'ai' AND m.ai_approved IS NOT NULL)::int AS ai_replies
      FROM messages m JOIN agents a ON a.id = m.sender_id
      WHERE m.created_at >= DATE_TRUNC('month', NOW())
    `
    const [tokens] = await sql`
      SELECT COALESCE(SUM(tokens_total), 0)::int AS total FROM agent_logs
      WHERE created_at >= DATE_TRUNC('month', NOW())
    `
    const PRICE_IN = 2 / 1_000_000
    const PRICE_OUT = 8 / 1_000_000
    const [usage] = await sql`
      SELECT COALESCE(SUM(tokens_prompt), 0)::int AS prompt, COALESCE(SUM(tokens_completion), 0)::int AS completion
      FROM agent_logs WHERE created_at >= DATE_TRUNC('month', NOW())
    `
    const costYuan = Number(((Number((usage as any)?.prompt ?? 0) * PRICE_IN + Number((usage as any)?.completion ?? 0) * PRICE_OUT)).toFixed(2))
    const [activeApps] = await sql`
      SELECT COUNT(DISTINCT l.app_id)::int AS cnt FROM agent_logs l
      WHERE l.created_at >= NOW() - INTERVAL '7 days'
    `
    return Response.json({
      totalApps: Number((total as any)?.apps ?? 0),
      activeApps: Number((active as any)?.cnt ?? 0),
      proApps: Number((pros as any)?.cnt ?? 0),
      msgsMonth: Number((msgs as any)?.total ?? 0),
      aiRepliesMonth: Number((msgs as any)?.ai_replies ?? 0),
      tokensMonth: Number((tokens as any)?.total ?? 0),
      costYuanMonth: costYuan,
      activeApps7d: Number((activeApps as any)?.cnt ?? 0),
    })
  })

  // ── R5 企业-子租户（企业账户 + 子租户聚合结算） ──────────

  // 企业列表 + 子租户 + 聚合用量
  app.get('/api/admin/enterprises', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    await requireAdmin(ctx)
    const { sql } = ctx
    const enterprises = await sql`
      SELECT e.id, e.name, e.created_at,
        (SELECT COUNT(*)::int FROM _weifuwu_apps a WHERE a.enterprise_id = e.id) AS app_count,
        (SELECT COALESCE(SUM(l.tokens_total), 0)::int FROM agent_logs l
          JOIN _weifuwu_apps a ON a.id = l.app_id WHERE a.enterprise_id = e.id
          AND l.created_at >= date_trunc('month', now())) AS tokens_month
      FROM enterprises e ORDER BY e.created_at DESC
    `
    return Response.json({ enterprises })
  })

  // 建企业（指定管理员邮箱——作为 owner_user_id 标记）
  app.post('/api/admin/enterprises', async (req: Request, ctx: AppCtx): Promise<Response> => {
    await requireAdmin(ctx)
    const body = await req.json() as { name?: string; ownerEmail?: string }
    if (!body.name?.trim()) return Response.json({ error: 'name 必填' }, { status: 400 })
    let ownerId: string | null = null
    if (body.ownerEmail) {
      const [u] = await ctx.sql`SELECT id FROM _weifuwu_users WHERE email = ${String(body.ownerEmail).trim().toLowerCase()}`
      ownerId = u ? String(u.id) : null
    }
    const [row] = await ctx.sql`
      INSERT INTO enterprises (name, owner_user_id) VALUES (${body.name.trim()}, ${ownerId})
      RETURNING id, name
    `
    return Response.json({ enterprise: row })
  })

  // 租户挂入企业（子租户归属）
  app.post('/api/admin/enterprises/:id/apps', async (req: Request, ctx: AppCtx): Promise<Response> => {
    await requireAdmin(ctx)
    const body = await req.json() as { appId?: string }
    if (!body.appId) return Response.json({ error: 'appId 必填' }, { status: 400 })
    await ctx.sql`UPDATE _weifuwu_apps SET enterprise_id = ${ctx.params.id} WHERE id = ${body.appId}`
    return Response.json({ ok: true })
  })

  // 企业聚合用量（子租户汇总——结算视图）
  app.get('/api/admin/enterprises/:id/usage', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    await requireAdmin(ctx)
    const { sql } = ctx
    const apps = await sql`
      SELECT a.slug, a.name, a.plan, a.status,
        (SELECT COALESCE(SUM(l.tokens_total), 0)::int FROM agent_logs l
          WHERE l.app_id = a.id AND l.created_at >= date_trunc('month', now())) AS tokens_month,
        (SELECT COUNT(*)::int FROM _weifuwu_app_members m WHERE m.app_id = a.id) AS member_count
      FROM _weifuwu_apps a WHERE a.enterprise_id = ${ctx.params.id} ORDER BY a.created_at
    `
    const totalTokens = apps.reduce((s: number, a: any) => s + Number(a.tokens_month ?? 0), 0)
    return Response.json({ apps, totalTokensMonth: totalTokens })
  })

  // 租户列表：app + 成员数 + Agent 数 + Token 用量 + 状态 + 计划
  app.get('/api/admin/apps', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    await requireAdmin(ctx)
    const { sql } = ctx
    const apps = await sql`
      SELECT a.id, a.slug, a.name, a.status, a.plan, a.trial_ends_at, a.monthly_token_limit, a.created_at,
        (SELECT COUNT(*)::int FROM _weifuwu_app_members m WHERE m.app_id = a.id) AS member_count,
        (SELECT COUNT(*)::int FROM agents ag WHERE ag.app_id = a.id) AS agent_count,
        COALESCE((SELECT SUM(l.tokens_total)::int FROM agent_logs l WHERE l.app_id = a.id), 0) AS token_usage,
        COALESCE((SELECT SUM(l.tokens_total)::int FROM agent_logs l WHERE l.app_id = a.id AND l.created_at >= date_trunc('month', now())), 0) AS token_usage_month
      FROM _weifuwu_apps a
      ORDER BY a.created_at DESC
    `
    return Response.json({ apps })
  })

  // 开通 Pro / 调整月配额（G1 付费墙：线下付费后管理员开通）
  app.post('/api/admin/apps/:id/plan', async (req: Request, ctx: AppCtx): Promise<Response> => {
    await requireAdmin(ctx)
    const body = await req.json() as { plan?: string; monthlyTokenLimit?: number }
    const appId = ctx.params.id
    if (body.plan === 'pro') {
      // 开通 Pro：清试用期 + 大配额
      await ctx.sql`UPDATE _weifuwu_apps SET plan = 'pro', trial_ends_at = NULL, monthly_token_limit = ${body.monthlyTokenLimit ?? 1000000} WHERE id = ${appId}`
    } else if (body.plan === 'free') {
      // 降回免费：重置 14 天试用
      await ctx.sql`UPDATE _weifuwu_apps SET plan = 'free', trial_ends_at = NOW() + INTERVAL '14 days', monthly_token_limit = ${body.monthlyTokenLimit ?? 50000} WHERE id = ${appId}`
    } else {
      // 仅调整配额
      await ctx.sql`UPDATE _weifuwu_apps SET monthly_token_limit = ${Number(body.monthlyTokenLimit ?? 0)} WHERE id = ${appId}`
    }
    try {
      const { writeAudit } = await import('../services/audit.ts')
      await writeAudit(ctx as any, { action: 'admin_app_plan', target_type: 'app', target_id: appId, detail: { plan: body.plan ?? 'quota', monthlyTokenLimit: body.monthlyTokenLimit } })
    } catch { /* 尽力 */ }
    return Response.json({ ok: true })
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
  // C1 沙盒容量视图（2026-08——平台管理员治理面：宿主容量 + 占用 + 驱逐审计）
  app.get('/api/admin/sandbox-capacity', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    await requireAdmin(ctx)
    const { sql } = ctx
    const { hostCapacity, HOST_ID } = await import('../sandbox/host.ts')
    const [occupied] = await sql`
      SELECT COALESCE(SUM(memory_mb), 0)::int as mb,
        COUNT(*) FILTER (WHERE status != 'terminated')::int as running,
        COUNT(*) FILTER (WHERE status = 'terminated')::int as terminated
      FROM sandboxes
    `
    const [weekly] = await sql`
      SELECT COUNT(*)::int as evicted
      FROM sandbox_events
      WHERE type LIKE 'evict%' AND created_at >= NOW() - interval '7 days'
    `
    const recentEvictions = await sql`
      SELECT e.sandbox_id, e.type, e.detail, e.created_at,
        s.name, s.app_id
      FROM sandbox_events e LEFT JOIN sandboxes s ON s.id = e.sandbox_id
      WHERE e.type LIKE 'evict%'
      ORDER BY e.created_at DESC
      LIMIT 20
    `
    return Response.json({
      host: { ...hostCapacity(), id: HOST_ID },
      occupied: { mb: Number(occupied?.mb ?? 0), running: Number(occupied?.running ?? 0), terminated: Number(occupied?.terminated ?? 0) },
      weeklyEvictions: Number(weekly?.evicted ?? 0),
      recentEvictions: recentEvictions.map((e: any) => ({
        sandboxId: String(e.sandbox_id), type: String(e.type), detail: String(e.detail ?? ''),
        at: e.created_at, name: e.name ?? '', appId: e.app_id ?? null,
      })),
    })
  })

}
