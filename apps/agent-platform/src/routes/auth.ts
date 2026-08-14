/**
 * 认证路由 — 登录/注册
 *
 * 产品流程（框架 userSystem 三层模型）：
 *   平台注册（_weifuwu_users）→ createApp（_weifuwu_apps，调用者成 owner）→ 建默认 Agent
 *   登录：平台登录（/api/auth/login 返回 apps 列表）→ 应用内登录（/apps/:appSlug/login 拿应用 token）
 */

import type { Router } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'

/**
 * 自定义注册路由（其余认证路由 login/logout/refresh/me/apps 由框架 user() 提供）：
 * 注册 = 平台注册 + 建默认应用（owner）+ 建默认 Agent + 签发应用 token——前端一次提交完成 onboarding
 */
export function registerAuthRoutes(app: Router<AppCtx>): void {

  // ── 注册 ─────────────────────────────────────────────────

  app.post('/api/auth/register', async (req: Request, ctx: AppCtx): Promise<Response> => {
    // 限流：框架 ctx.limit（默认按 IP 维度）——每 IP 每分钟 5 次注册
    try {
      await ctx.limit?.('register', { max: 5, windowMs: 60_000 })
    } catch {
      return Response.json({ error: '请求过于频繁，请稍后重试' }, { status: 429 })
    }
    const body = await req.json() as {
      email: string
      password: string
      name: string
      appSlug?: string
    }

    if (!body.email || !body.password || !body.name) {
      return Response.json({ error: 'email, password, name 为必填' }, { status: 400 })
    }

    const { sql } = ctx

    // 1. 平台注册（框架 _weifuwu_users：email 全局唯一）——重复邮箱 409
    const registered = await ctx.auth.register({
      email: body.email,
      password: body.password,
      name: body.name,
    })

    // 2. 建默认应用（框架 _weifuwu_apps：调用者成为 owner）——slug = 邮箱域名或自定义
    const appSlug = (body.appSlug ?? body.email.split('@')[1] ?? 'default').trim().toLowerCase()
    const appInfo = await ctx.auth.createApp({
      slug: appSlug,
      name: `${body.name} 的应用`,
      openRegistration: false,
    })

    // 3. 自动创建绑定的 user 类型 Agent — 注册用户即可发消息
    await sql`
      INSERT INTO agents (app_id, type, name, user_id, is_active)
      VALUES (${appInfo.id}, 'user', ${registered.user.name ?? body.name}, ${registered.user.id}, true)
      ON CONFLICT DO NOTHING
    `

    // 4. 商业化 G1：新租户初始化免费版 14 天试用 + 月配额
    await sql`
      UPDATE _weifuwu_apps
      SET plan = 'free',
          trial_ends_at = NOW() + INTERVAL '14 days',
          monthly_token_limit = ${50000}
      WHERE id = ${appInfo.id}
    `

    // 4. 签发应用 token（owner 成员已建——应用内登录一步到位，前端直接进应用）
    const appLogin = await ctx.auth.loginApp(appSlug, body.email, body.password)

    // 审计：登录成功（Wave 9——安全/合规）
    try {
      const { writeAudit } = await import('../services/audit.ts')
      await writeAudit({ ...(ctx as any), appId: appInfo.id, user: { id: appLogin.user?.id ?? null } } as any, { action: 'login_success', target_type: 'app', target_id: appInfo.id, detail: { email: body.email } })
    } catch { /* 尽力 */ }

    return Response.json({
      token: appLogin.token,
      refreshToken: appLogin.refreshToken,
      user: appLogin.user,
      app: { id: appInfo.id, slug: appInfo.slug, name: appInfo.name, role: 'owner' },
    })
  })

  // ── 邀请成员（G3：owner 生成邀请链接——框架 createInvite 7 天有效） ──

  app.post('/api/auth/invite', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const body = await req.json() as { email?: string; role?: string }
    try {
      const inv = await ctx.auth.createInvite(ctx.appId, { email: body.email, role: body.role })
      // 查 slug 拼邀请链接（前端复制分发）
      const rows = await ctx.sql`SELECT slug FROM _weifuwu_apps WHERE id = ${ctx.appId}`
      const slug = rows[0]?.slug ?? ''
      try {
        const { writeAudit } = await import('../services/audit.ts')
        await writeAudit(ctx as any, { action: 'invite_create', target_type: 'app', target_id: ctx.appId, detail: { email: body.email ?? null } })
      } catch { /* 尽力 */ }
      return Response.json({ token: inv.inviteToken, url: `/register?app=${slug}&invite=${encodeURIComponent(inv.inviteToken)}`, expiresInDays: 7 })
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '生成邀请失败' }, { status: e?.status ?? 400 })
    }
  })

  // ── 邀请加入：inviteToken + 注册信息 → registerInApp（复用或建平台账号 + 加成员） ──

  app.post('/api/auth/join', async (req: Request, ctx: AppCtx): Promise<Response> => {
    try {
      await ctx.limit?.('join', { max: 5, windowMs: 60_000 })
    } catch {
      return Response.json({ error: '请求过于频繁，请稍后重试' }, { status: 429 })
    }
    const body = await req.json() as { appSlug: string; inviteToken: string; email: string; name: string; password: string }
    if (!body.appSlug || !body.inviteToken || !body.email || !body.password || !body.name) {
      return Response.json({ error: '邀请码、邮箱、姓名、密码为必填' }, { status: 400 })
    }
    try {
      const appRows = await ctx.sql`SELECT id FROM _weifuwu_apps WHERE slug = ${body.appSlug}`
      const appId = String(appRows[0]?.id ?? '')
      if (!appId) throw new Error('应用不存在')
      const appLogin = await ctx.auth.registerInApp({
        appSlug: body.appSlug,
        inviteToken: body.inviteToken,
        email: body.email,
        name: body.name,
        password: body.password,
      })
      // 自动创建绑定的 user 类型 Agent（同注册流程——加入即可发消息）
      await ctx.sql`
        INSERT INTO agents (app_id, type, name, user_id, is_active)
        VALUES (${appId}, 'user', ${body.name}, ${appLogin.user.id}, true)
        ON CONFLICT DO NOTHING
      `
      try {
        const { writeAudit } = await import('../services/audit.ts')
        await writeAudit(ctx as any, { action: 'invite_join', target_type: 'app', target_id: appId, detail: { email: body.email } })
      } catch { /* 尽力 */ }
      return Response.json({
        token: appLogin.token,
        refreshToken: appLogin.refreshToken,
        user: appLogin.user,
        app: { id: appId, slug: body.appSlug, role: 'member' },
      })
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '邀请无效或已过期' }, { status: e?.status ?? 403 })
    }
  })

  // 登录失败审计（认证中间件 401 时由 auth-payload 记录——此处覆盖应用登录成功路径）
}
