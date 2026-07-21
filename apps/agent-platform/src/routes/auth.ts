/**
 * 认证路由 — 登录/注册
 */

import type { Router, Context } from 'weifuwu'
import { signToken } from '../middleware/auth.ts'

export function registerAuthRoutes(app: Router): void {
  const secret = process.env.JWT_SECRET ?? 'default-secret'

  // ── 注册 ─────────────────────────────────────────────────

  app.post('/api/auth/register', async (req: Request, ctx: Context): Promise<Response> => {
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

    // 检查邮箱是否已注册
    const [existing] = await sql`
      SELECT id FROM users WHERE email = ${body.email} AND tenant_id = ${tenant.id}
    `
    if (existing) {
      return Response.json({ error: '该邮箱已注册' }, { status: 409 })
    }

    // 创建用户（明文密码 — 生产环境应 hash）
    const [user] = await sql`
      INSERT INTO users (tenant_id, email, name, password_hash, role)
      VALUES (${tenant.id}, ${body.email}, ${body.name}, ${body.password}, 'member')
      RETURNING id, email, name, role
    `

    // 自动创建绑定的 user 类型 Agent — 注册用户即可发消息
    await sql`
      INSERT INTO agents (tenant_id, type, name, user_id, is_active)
      VALUES (${tenant.id}, 'user', ${user.name}, ${user.id}, true)
      ON CONFLICT DO NOTHING
    `

    // 生成 token
    const token = signToken(
      { sub: user.id, tenantId: tenant.id, email: user.email, name: user.name, role: user.role },
      secret,
    )

    return Response.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    })
  })

  // ── 登录 ─────────────────────────────────────────────────

  app.post('/api/auth/login', async (req: Request, ctx: Context): Promise<Response> => {
    const body = await req.json() as { email: string; password: string }

    if (!body.email || !body.password) {
      return Response.json({ error: 'email 和 password 为必填' }, { status: 400 })
    }

    const { sql } = ctx

    const [user] = await sql`
      SELECT u.id, u.email, u.name, u.role, u.password_hash, u.tenant_id, t.slug as tenant_slug
      FROM users u
      JOIN tenants t ON t.id = u.tenant_id
      WHERE u.email = ${body.email}
    `

    if (!user) {
      return Response.json({ error: '用户不存在' }, { status: 401 })
    }

    // 验证密码（明文 — 生产环境用 bcrypt）
    if (user.password_hash !== body.password) {
      return Response.json({ error: '密码错误' }, { status: 401 })
    }

    const token = signToken(
      {
        sub: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      secret,
    )

    return Response.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenant_id,
        tenantSlug: user.tenant_slug,
      },
    })
  })

  // ── 获取当前用户 ─────────────────────────────────────────

  // 注：/api/auth/me 已被移至 server.ts 的 protectedRoutes 中
}

