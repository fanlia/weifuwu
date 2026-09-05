/**
 * 管理路由 — 商业化 G2 租户管理后台（平台管理员）
 *
 * 管理员身份（USERSYSTEM-V2 系统域定案）：**系统管理员 = `_builtin` 应用的
 * owner（超级管理员）/admin（系统管理员）**——ctx.session（token payload）
 * 判定——不再 env 白名单常驻鉴权。ADMIN_EMAILS 降级为**初始引导**（启动 seed
 * 任命 _builtin 成员——一次性——此后任命走 addMember）。
 * 能力：租户列表（成员/Agent/用量）/ 停用启用（app.status）。
 */

import type { Router } from 'weifuwu'
import { HttpError, BUILTIN_APP_ID, ops } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'

/** 系统域判定（token payload：appId=BUILTIN + owner/admin——双端同语义） */
export function isSystemAdmin(ctx: AppCtx): boolean {
  const s = (ctx as any).session
  return !!s && String(s.appId) === BUILTIN_APP_ID && (s.role === 'owner' || s.role === 'admin')
}

export function registerAdminRoutes(app: Router<AppCtx>): void {
  // 租户侧计划状态（非管理员也可看——Settings 显示试用/配额）
  app.get('/api/plan', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    const { getAppPlan, planStatusOf, PLANS } = await import('../services/plan.ts')
    const row = await getAppPlan(ctx.orm, ctx.appId)
    const [usedRow] = await ctx.orm.query.from('agent_logs')
      .sum('tokens_total', 'used')
      .where({ app_id: { eq: ctx.appId }, created_at: { gte: ops.monthStart() } })
      .run()
    return Response.json(planStatusOf(row, Number((usedRow as Record<string, unknown>)?.used ?? 0)))
  })

  // 管理员校验（403 非系统管理员）——系统域判定（token payload——零查库）
  const requireAdmin = async (ctx: AppCtx): Promise<void> => {
    if (!isSystemAdmin(ctx)) {
      // 2026-08（UI 角色测试）：throw 到 handler 层 = 500——权限错误应 403
      // 显式响应（permissions 模式——路由内 catch 转 Response）
      throw new HttpError('需要管理员权限', 403)
    }
  }

  // 当前用户是否管理员（前端导航显示用）
  app.get('/api/admin/me', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    return Response.json({ isAdmin: isSystemAdmin(ctx) })
  })

  // 平台使用概览（G11 使用分析——管理员看整体活跃/成本/转化）
  app.get('/api/admin/overview', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    await requireAdmin(ctx)
    const { sql, orm } = ctx
    const [total] = await orm.query.from('_weifuwu_apps').count('*', 'apps').run()
    const [active] = await orm.query.from('_weifuwu_apps').count('*', 'cnt').where({ status: { eq: 'active' } }).run()
    const [pros] = await orm.query.from('_weifuwu_apps').count('*', 'cnt').where({ plan: { eq: 'pro' } }).run()
    const [msgs] = await orm.query.from('messages m')
      .join('agents a', { 'a.id': { col: 'm.sender_id' } })
      .count('*', 'total')
      .count('*', 'ai_replies', { 'a.type': { eq: 'ai' }, 'm.ai_approved': { isNull: false } })
      .where({ 'm.created_at': { gte: ops.monthStart() } })
      .run()
    const [tokens] = await orm.query.from('agent_logs')
      .sum('tokens_total', 'total', { created_at: { gte: ops.monthStart() } }).run()
    const PRICE_IN = 2 / 1_000_000
    const PRICE_OUT = 8 / 1_000_000
    const [usage] = await orm.query.from('agent_logs')
      .sum('tokens_prompt', 'prompt', { created_at: { gte: ops.monthStart() } })
      .sum('tokens_completion', 'completion', { created_at: { gte: ops.monthStart() } }).run()
    const costYuan = Number(((Number((usage as Record<string, unknown>)?.prompt ?? 0) * PRICE_IN + Number((usage as Record<string, unknown>)?.completion ?? 0) * PRICE_OUT)).toFixed(2))
    const [activeApps] = await orm.query.from('agent_logs l')
      .count('DISTINCT l.app_id', 'cnt', { 'l.created_at': { gte: ops.nowAgo(7, 'day') } }).run()
    return Response.json({
      totalApps: Number((total as Record<string, unknown>)?.apps ?? 0),
      activeApps: Number((active as Record<string, unknown>)?.cnt ?? 0),
      proApps: Number((pros as Record<string, unknown>)?.cnt ?? 0),
      msgsMonth: Number((msgs as Record<string, unknown>)?.total ?? 0),
      aiRepliesMonth: Number((msgs as Record<string, unknown>)?.ai_replies ?? 0),
      tokensMonth: Number((tokens as Record<string, unknown>)?.total ?? 0),
      costYuanMonth: costYuan,
      activeApps7d: Number((activeApps as Record<string, unknown>)?.cnt ?? 0),
    })
  })

  // ── R5 企业-子租户（企业账户 + 子租户聚合结算） ──────────

  // 企业列表 + 子租户 + 聚合用量
  app.get('/api/admin/enterprises', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    await requireAdmin(ctx)
    const { orm } = ctx
    // 相关子查询 → 两查合并（懒正解：主查 + 分组聚合——内存挂接——见 orm-pg-subquery 判负更新）
    const enterprises = await orm.query.from('enterprises').select('id', 'name', 'created_at').orderBy('created_at', 'desc').run()
    const entIds = enterprises.map((e) => String(e.id))
    if (entIds.length) {
      const appCounts = await orm.query.from('_weifuwu_apps').select('enterprise_id').count('*', 'app_count', { enterprise_id: { in: entIds } }).groupBy('enterprise_id').run()
      const tokenSums = await orm.query.from('agent_logs l').join('_weifuwu_apps a', { 'a.id': { col: 'l.app_id' } })
        .select('a.enterprise_id').sum('l.tokens_total', 'tokens_month', { 'l.created_at': { gte: ops.monthStart() } })
        .groupBy('a.enterprise_id').run()
      const appMap = new Map(appCounts.map((x) => [String(x.enterprise_id), Number((x as any).app_count ?? 0)]))
      const tokMap = new Map(tokenSums.map((x) => [String(x.enterprise_id), Number((x as any).tokens_month ?? 0)]))
      for (const e of enterprises) {
        (e as any).app_count = appMap.get(String(e.id)) ?? 0
        ;(e as any).tokens_month = tokMap.get(String(e.id)) ?? 0
      }
    }
    return Response.json({ enterprises })
  })

  // 建企业（指定管理员邮箱——作为 owner_user_id 标记）
  app.post('/api/admin/enterprises', async (req: Request, ctx: AppCtx): Promise<Response> => {
    await requireAdmin(ctx)
    const body = await req.json() as { name?: string; ownerEmail?: string }
    if (!body.name?.trim()) throw new HttpError('name 必填', 400)
    let ownerId: string | null = null
    if (body.ownerEmail) {
      const [u] = await ctx.orm.query.from('_weifuwu_users').select('id').where({ email: { eq: body.ownerEmail.trim().toLowerCase() } }).limit(1).run()
      ownerId = u ? String((u as any).id) : null
    }
    const [row] = await ctx.orm.query.insert('enterprises')
      .values({ name: body.name.trim(), owner_user_id: ownerId })
      .returning('id', 'name')
      .run()
    return Response.json({ enterprise: row })
  })

  // 租户挂入企业（子租户归属）
  app.post('/api/admin/enterprises/:id/apps', async (req: Request, ctx: AppCtx): Promise<Response> => {
    await requireAdmin(ctx)
    const body = await req.json() as { appId?: string }
    if (!body.appId) throw new HttpError('appId 必填', 400)
    await ctx.orm.query.update('_weifuwu_apps').set({ enterprise_id: ctx.params.id }).where({ id: { eq: body.appId }}).run()
    return Response.json({ ok: true })
  })

  // 企业聚合用量（子租户汇总——结算视图）
  app.get('/api/admin/enterprises/:id/usage', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    await requireAdmin(ctx)
    const { orm } = ctx
    // 相关子查询 → 两查合并
    const apps = await orm.query.from('_weifuwu_apps').select('id', 'slug', 'name', 'plan', 'status', 'created_at')
      .where({ enterprise_id: { eq: ctx.params.id } }).orderBy('created_at', 'asc').run()
    const appIds = apps.map((a) => String(a.id))
    if (appIds.length) {
      const tokenSums = await orm.query.from('agent_logs').select('app_id').sum('tokens_total', 'tokens_month', { created_at: { gte: ops.monthStart() } })
        .where({ app_id: { in: appIds } }).groupBy('app_id').run()
      const memberCounts = await orm.query.from('_weifuwu_app_members').select('app_id').count('*', 'member_count').where({ app_id: { in: appIds } }).groupBy('app_id').run()
      const tokMap = new Map(tokenSums.map((x) => [String(x.app_id), Number((x as any).tokens_month ?? 0)]))
      const memMap = new Map(memberCounts.map((x) => [String(x.app_id), Number((x as any).member_count ?? 0)]))
      for (const a of apps) {
        (a as any).tokens_month = tokMap.get(String(a.id)) ?? 0
        ;(a as any).member_count = memMap.get(String(a.id)) ?? 0
      }
    }
    const totalTokens = apps.reduce((acc: number, a: any) => acc + Number(a.tokens_month ?? 0), 0)
    return Response.json({ apps, totalTokensMonth: totalTokens })
  })

  // 租户列表：app + 成员数 + Agent 数 + Token 用量 + 状态 + 计划
  app.get('/api/admin/apps', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    await requireAdmin(ctx)
    const { orm } = ctx
    // 相关子查询 → 2+2 组查合并（懒正解——见 orm-pg-subquery 判负更新）
    const apps = await orm.query.from('_weifuwu_apps').select('id', 'slug', 'name', 'status', 'plan', 'trial_ends_at', 'monthly_token_limit', 'created_at')
      .orderBy('created_at', 'desc').run()
    const appIds = apps.map((a) => String(a.id))
    if (appIds.length) {
      const memCounts = await orm.query.from('_weifuwu_app_members').select('app_id').count('*', 'member_count').where({ app_id: { in: appIds } }).groupBy('app_id').run()
      const agCounts = await orm.query.from('agents').select('app_id').count('*', 'agent_count').where({ app_id: { in: appIds } }).groupBy('app_id').run()
      const tokSums = await orm.query.from('agent_logs').select('app_id').sum('tokens_total', 'token_usage').where({ app_id: { in: appIds } }).groupBy('app_id').run()
      const tokMonth = await orm.query.from('agent_logs').select('app_id').sum('tokens_total', 'token_usage_month', { created_at: { gte: ops.monthStart() } }).where({ app_id: { in: appIds } }).groupBy('app_id').run()
      const memMap = new Map(memCounts.map((x) => [String(x.app_id), Number((x as any).member_count ?? 0)]))
      const agMap = new Map(agCounts.map((x) => [String(x.app_id), Number((x as any).agent_count ?? 0)]))
      const tokMap = new Map(tokSums.map((x) => [String(x.app_id), Number((x as any).token_usage ?? 0)]))
      const tokmMap = new Map(tokMonth.map((x) => [String(x.app_id), Number((x as any).token_usage_month ?? 0)]))
      for (const a of apps) {
        (a as any).member_count = memMap.get(String(a.id)) ?? 0
        ;(a as any).agent_count = agMap.get(String(a.id)) ?? 0
        ;(a as any).token_usage = tokMap.get(String(a.id)) ?? 0
        ;(a as any).token_usage_month = tokmMap.get(String(a.id)) ?? 0
      }
    }
    return Response.json({ apps })
  })

  // 开通 Pro / 调整月配额（G1 付费墙：线下付费后管理员开通）
  app.post('/api/admin/apps/:id/plan', async (req: Request, ctx: AppCtx): Promise<Response> => {
    await requireAdmin(ctx)
    const body = await req.json() as { plan?: string; monthlyTokenLimit?: number }
    const appId = ctx.params.id
    if (body.plan === 'pro') {
      // 开通 Pro：清试用期 + 大配额
      await ctx.orm.query.update('_weifuwu_apps')
        .set({ plan: 'pro', trial_ends_at: null, monthly_token_limit: body.monthlyTokenLimit ?? 1000000 })
        .where({ id: { eq: appId }})
        .run()
    } else if (body.plan === 'free') {
      // 降回免费：重置 14 天试用
      await ctx.orm.query.update('_weifuwu_apps')
        .set({ plan: 'free', trial_ends_at: ops.nowInterval(14, 'day'), monthly_token_limit: body.monthlyTokenLimit ?? 50000 })
        .where({ id: { eq: appId }})
        .run()
    } else {
      // 仅调整配额
      await ctx.orm.query.update('_weifuwu_apps')
        .set({ monthly_token_limit: Number(body.monthlyTokenLimit ?? 0) })
        .where({ id: { eq: appId }})
        .run()
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
    await ctx.orm.query.update('_weifuwu_apps').set({ status }).where({ id: { eq: appId }}).run()
    try {
      const { writeAudit } = await import('../services/audit.ts')
      await writeAudit(ctx as any, { action: 'admin_app_status', target_type: 'app', target_id: appId, detail: { status } })
    } catch { /* 尽力 */ }
    return Response.json({ ok: true, status })
  })
  // C1 沙盒容量视图（2026-08——平台管理员治理面：宿主容量 + 占用 + 驱逐审计）
  app.get('/api/admin/sandbox-capacity', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    await requireAdmin(ctx)
    const { sql, orm } = ctx
    const { hostCapacity, HOST_ID } = await import('../sandbox/host.ts')
    const [occupied] = await orm.query.from('sandboxes')
      .sum('memory_mb', 'mb')
      .count('*', 'running', { status: { ne: 'terminated' } })
      .count('*', 'terminated', { status: { eq: 'terminated' }})
      .run()
    const [weekly] = await orm.query.from('sandbox_events')
      .count('*', 'evicted')
      .where({ type: { like: 'evict%' }, created_at: { gte: new Date(Date.now() - 7 * 86_400_000).toISOString() } })
      .run()
    const recentEvictions = await orm.query.from('sandbox_events e')
      .join('sandboxes s', { 's.id': { col: 'e.sandbox_id' } }, { type: 'left' })
      .select('e.sandbox_id', 'e.type', 'e.detail', 'e.created_at',
        's.name', 's.app_id')
      .where({ 'e.type': { like: 'evict%' } })
      .orderBy('e.created_at', 'desc')
      .limit(20)
      .run()
    return Response.json({
      host: { ...hostCapacity(), id: HOST_ID },
      occupied: { mb: Number((occupied as Record<string, unknown>)?.mb ?? 0), running: Number((occupied as Record<string, unknown>)?.running ?? 0), terminated: Number((occupied as Record<string, unknown>)?.terminated ?? 0) },
      weeklyEvictions: Number(weekly?.evicted ?? 0),
      recentEvictions: recentEvictions.map((e: any) => ({
        sandboxId: String(e.sandbox_id), type: String(e.type), detail: String(e.detail ?? ''),
        at: e.created_at, name: e.name ?? '', appId: e.app_id ?? null,
      })),
    })
  })

}
