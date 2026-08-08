/**
 * 认证路由 — 登录/注册
 */

import type { Router, Context } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'
import { checkRateLimit, rateLimitKey } from '../services/rate-limit.ts'

/**
 * 自定义注册路由（其余认证路由 login/logout/refresh/me 由框架 user() 提供）：
 * 产品流程 = 建租户 → 框架 ctx.auth.register（_weifuwu_users + 签发）→ 建默认 Agent
 */
export function registerAuthRoutes(app: Router<AppCtx>): void {

  // ── 注册 ─────────────────────────────────────────────────

  app.post('/api/auth/register', async (req: Request, ctx: AppCtx): Promise<Response> => {
    // 限流：每 IP 每分钟 5 次注册请求
    if (!checkRateLimit(rateLimitKey(req), { windowMs: 60_000, max: 5 })) {
      return Response.json({ error: '请求过于频繁，请稍后重试' }, { status: 429 })
    }
    const body = await req.json() as {
      email: string
      password: string
      name: string
      tenantSlug?: string
    }

    if (!body.email || !body.password || !body.name) {
      return Response.json({ error: 'email, password, name 为必填' }, { status: 400 })
    }

    const { sql } = ctx

    // 查找或创建租户
    const tenantSlug = body.tenantSlug ?? body.email.split('@')[1] ?? 'default'
    let [tenant] = await sql`
      SELECT id FROM tenants WHERE slug = ${tenantSlug}
    `
    if (!tenant) {
      [tenant] = await sql`
        INSERT INTO tenants (name, slug)
        VALUES (${tenantSlug}, ${tenantSlug})
        RETURNING id
      `
    }

    // 检查邮箱是否已注册（框架 _weifuwu_users：email 全局唯一，登录/改密/会话都走它）
    const [existing] = await sql`
      SELECT id FROM _weifuwu_users WHERE email = ${body.email}
    `
    if (existing) {
      return Response.json({ error: '该邮箱已注册' }, { status: 409 })
    }

    // 框架 ctx.auth.register：建用户（_weifuwu_users）+ 签发 token（payload 携带 tenantId）
    const registered = await ctx.auth.register({
      email: body.email,
      password: body.password,
      name: body.name,
      role: 'member',
      tenant: String(tenant.id),   // 多租户感知：token 携带 → ctx.tenantId 注入
    })

    // 自动创建绑定的 user 类型 Agent — 注册用户即可发消息
    await sql`
      INSERT INTO agents (tenant_id, type, name, user_id, is_active)
      VALUES (${tenant.id}, 'user', ${registered.user.name ?? body.name}, ${registered.user.id}, true)
      ON CONFLICT DO NOTHING
    `

    return Response.json({
      token: registered.token,
      refreshToken: registered.refreshToken,
      user: registered.user,
    })
  })


  // ── 获取当前用户 ─────────────────────────────────────────

  // 注：/api/auth/me 已被移至 server.ts 的 protectedRoutes 中
}

