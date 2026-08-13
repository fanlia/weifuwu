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

  // 登录失败审计（认证中间件 401 时由 auth-payload 记录——此处覆盖应用登录成功路径）
}
