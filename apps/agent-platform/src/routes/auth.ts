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

  // 注册/加入限流阈值（可调——生产默认 20/分钟/IP；测试套件注册多租户
  // 共享 Redis 同 IP 窗口计数——REGISTER_LIMIT_MAX 拉高隔离；01-auth
  // 429 测试显式设小值锁定语义——默认调整不影响）
  const registerMax = Number(process.env.REGISTER_LIMIT_MAX ?? 20)
  const joinMax = Number(process.env.REGISTER_LIMIT_MAX ?? 20)

  app.post('/api/auth/register', async (req: Request, ctx: AppCtx): Promise<Response> => {
    // 限流：框架 ctx.limit（默认按 IP 维度）——每 IP 每分钟注册超限拦截
    try {
      await ctx.limit?.('register', { max: registerMax, windowMs: 60_000 })
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

    // slug 生成（应用层 slug 去重——BUG-2 修复 2026-XX）：
    // 默认 slug = 邮箱域名——同域名第二个注册用户（bob@acme.com 在
    // alice@acme.com 之后）必撞 slug 唯一键 → 409 → 前端误报「邮箱已注册」
    // （walkerdemo 走查实证）。修复：冲突自动后缀化（acme.com → acme.com-2）
    // ——注册模型不变（每注册 = 新独立租户；加入公司租户走邀请链接）。
    // 保留显式 appSlug 优先（邀请链接场景）。
    const baseSlug = (body.appSlug ?? body.email.split('@')[1] ?? 'default').trim().toLowerCase()
    let appSlug = baseSlug
    // 上限 200（2026-09——e2e.test 域测试租户超 20 变体即 409 实证——同域名大量注册场景）
    for (let n = 1; n <= 200; n++) {
      const rows = await sql`SELECT 1 FROM _weifuwu_apps WHERE slug = ${appSlug}`
      if (!rows.length) break
      appSlug = `${baseSlug}-${n}`
    }

    // 1. 平台注册（框架 _weifuwu_users：email 全局唯一）——重复邮箱 409
    const registered = await ctx.auth.register({
      email: body.email,
      password: body.password,
      name: body.name,
    })

    // 2. 建默认应用（框架 _weifuwu_apps：调用者成为 owner）——slug 去重后唯一
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

    // 4. 商业化 G1：新租户初始化免费版 14 天试用 + 月配额（内存库/未 migration 环境容错跳过）
    try {
      await sql`
        UPDATE _weifuwu_apps
        SET plan = 'free',
            trial_ends_at = NOW() + INTERVAL '14 days',
            monthly_token_limit = ${50000}
        WHERE id = ${appInfo.id}
      `
    } catch { /* migration 由 server.ts 负责——旧库/内存库无列时跳过 */ }

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
    // ROLES-OPTIMIZATION 波次 1：邀请角色白名单——仅 member/viewer（app 级 admin
    // 幽灵角色裁剪：此前 createInvite 放行任意 role 串——可铸造无入口的 admin；
    // 现在前置拦截，非法 role 显式 403 而非静默降级）
    if (body.role && body.role !== 'member' && body.role !== 'viewer') {
      return Response.json({ error: '邀请角色仅支持 member/viewer' }, { status: 403 })
    }
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
      await ctx.limit?.('join', { max: joinMax, windowMs: 60_000 })
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
      // 响应 role 用真实成员角色（曾被硬编码 'member'——invite role=viewer
      // 时响应误导——DB 存 viewer 但响应报 member——前端/测试按响应造数据
      // 会错——2026-08 角色种子链路挖出）
      let joinRole = 'member'
      try {
        const [m] = await ctx.sql`SELECT role FROM _weifuwu_app_members WHERE app_id = ${appId} AND user_id = ${appLogin.user.id}`
        if (m?.role) joinRole = String(m.role)
      } catch { /* 查询失败——用默认 */ }
      return Response.json({
        token: appLogin.token,
        refreshToken: appLogin.refreshToken,
        user: appLogin.user,
        app: { id: appId, slug: body.appSlug, role: joinRole },
      })
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '邀请无效或已过期' }, { status: e?.status ?? 403 })
    }
  })

  // ── SSO 登录（商业化 G14：OIDC 授权码——企业身份接入） ──
  // 配置：OIDC_ISSUER + OIDC_CLIENT_ID + OIDC_CLIENT_SECRET + OIDC_REDIRECT_URI +
  //       OIDC_APP_SLUG（SSO 用户自动加入的应用）；未配置 = 不启用

  function ssoEnabled(): boolean {
    return !!(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET)
  }

  // 0) SSO 启用探测（登录页显示按钮用）
  app.get('/api/auth/sso/enabled', async (): Promise<Response> => {
    return Response.json({ enabled: ssoEnabled(), appSlug: process.env.OIDC_APP_SLUG ?? null })
  })

  // 1) 跳转身份提供方授权页
  app.get('/api/auth/sso/login', async (): Promise<Response> => {
    if (!ssoEnabled()) return Response.json({ error: 'SSO 未启用（配置 OIDC_* 环境变量）' }, { status: 400 })
    const issuer = String(process.env.OIDC_ISSUER).replace(/\/$/, '')
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.OIDC_CLIENT_ID!,
      redirect_uri: process.env.OIDC_REDIRECT_URI ?? `${process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/auth/sso/callback`,
      scope: 'openid email profile',
      state: process.env.OIDC_APP_SLUG ?? 'sso',
    })
    // 自建 302（Response.redirect 的 headers 不可变——框架 mw 追加头会抛 immutable）
    return new Response(null, { status: 302, headers: { Location: `${issuer}/authorize?${params}` } })
  })

  // 2) 回调：code → token → userinfo → 建号/登录
  app.get('/api/auth/sso/callback', async (req: Request, ctx: AppCtx): Promise<Response> => {
    if (!ssoEnabled()) return Response.json({ error: 'SSO 未启用' }, { status: 400 })
    const url = new URL(req.url ?? '', 'http://localhost')
    const code = url.searchParams.get('code')
    if (!code) return Response.json({ error: 'SSO 回调缺少 code' }, { status: 400 })
    const issuer = String(process.env.OIDC_ISSUER).replace(/\/$/, '')
    const redirectUri = process.env.OIDC_REDIRECT_URI ?? `${process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/auth/sso/callback`
    try {
      // code → token（信任身份提供方 token 端点——完整 JWT 验签留待生产强化）
      const tokenRes = await fetch(`${issuer}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: process.env.OIDC_CLIENT_ID!,
          client_secret: process.env.OIDC_CLIENT_SECRET!,
        }),
      })
      if (!tokenRes.ok) return Response.json({ error: 'SSO token 交换失败' }, { status: 401 })
      const tokenData = await tokenRes.json() as { access_token?: string }
      // userinfo → email
      const infoRes = await fetch(`${issuer}/userinfo`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })
      if (!infoRes.ok) return Response.json({ error: 'SSO 用户信息获取失败' }, { status: 401 })
      const info = await infoRes.json() as { email?: string; name?: string; sub?: string }
      const email = (info.email ?? '').trim().toLowerCase()
      if (!email) return Response.json({ error: 'SSO 未返回邮箱（需要 email scope）' }, { status: 401 })

      // 建号/登录 + 自动加入目标应用（OIDC_APP_SLUG）
      let appId: string | undefined
      const slug = url.searchParams.get('state') ?? process.env.OIDC_APP_SLUG
      if (slug && slug !== 'sso') {
        const [app] = await ctx.sql`SELECT id FROM _weifuwu_apps WHERE slug = ${slug}`
        if (app) appId = String(app.id)
      }
      const session = await ctx.auth.ssoLogin(email, { appId, name: info.name })
      try {
        const { writeAudit } = await import('../services/audit.ts')
        await writeAudit(ctx as any, { action: 'sso_login', target_type: 'app', target_id: appId, detail: { email } })
      } catch { /* 尽力 */ }

      // 前端收 token：SPA 页面脚本存 localStorage 后跳首页
      return new Response(`<!DOCTYPE html><html><body><script>
        localStorage.setItem('agent_platform_token', ${JSON.stringify(session.token)});
        localStorage.setItem('agent_platform_refresh', ${JSON.stringify(session.refreshToken)});
        localStorage.setItem('agent_platform_user', ${JSON.stringify(JSON.stringify(session.user))});
        location.href = '/';
      </script></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    } catch (e: any) {
      return Response.json({ error: `SSO 登录失败: ${e?.message ?? '未知错误'}` }, { status: 500 })
    }
  })

  // 登录失败审计（认证中间件 401 时由 auth-payload 记录——此处覆盖应用登录成功路径）
}
