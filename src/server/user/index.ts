/**
 * weifuwu/userSystem — 用户系统中间件（平台 → 应用 → 应用用户 三层模型）
 *
 * 注入 ctx.user（从 Authorization: Bearer 解码 + 查库）+ ctx.auth（方法面）。
 * users.routes(app) 注册 /api/auth/* 路由；users.migrate() 幂等建表。
 *
 * 三层模型（用户决策 2026-12）：
 *   1. 平台注册（email 全局唯一）→ 平台账号（_weifuwu_users，无租户绑定）
 *   2. createApp 建应用 → 调用者成为 owner（_weifuwu_apps + _weifuwu_app_members）
 *   3. 应用内注册：自助（open_registration=true）或邀请（invite token）双模式
 *   登录入口：平台登录（/api/auth/login，token 无 appId + 我的应用列表）、
 *           应用内登录（/api/auth/apps/:appSlug/login，token 带 appId + role）
 *   鉴权：requireApp(appId) 应用级成员校验；token payload appId → ctx.appId 注入
 *
 * 安全基线：
 *   - scrypt 密码哈希（per-user salt + timing-safe compare，异步不阻塞）
 *   - access token：HMAC-SHA256 JWT（无状态，与 client auth() 兼容）
 *   - refresh token：不透明随机串，DB 只存哈希，logout/轮换即撤销
 *   - 登录失败统一 401（不泄露"邮箱是否存在"——防枚举）
 *   - 邀请 token：JWT 短效（7 天）+ email 绑定——非 owner 无法生成/消费
 *
 * 诚实裁剪：
 *   ✅ register/login/logout/me/refresh / setPassword / createToken / tenant claim /
 *      apps 三层（createApp / registerInApp / loginApp / createInvite / addMember /
 *      listMyApps / requireApp）
 *   ❌ OAuth、邮箱验证邮件（给 createToken + setPassword 底层 API 自接）、
 *      多因素、RBAC 权限引擎（只提供 role 字段：owner/admin/member）、
 *      订阅/计费/配额、应用业务数据（业务表挂 app_id 外键）、
 *      应用删除的级联业务清理（只提供 deleteApp 删 app+members，业务表由业务层处理）
 *
 * ```ts
 * const db = postgres()
 * await db.migrate()
 * const users = userSystem({ sql: db.sql, secret: process.env.AUTH_SECRET! })
 * await users.migrate()
 * app.use(db)
 * app.use(users)
 * users.routes(app)
 *
 * app.get('/me', (req, ctx) => ok(ctx.user))           // ctx.user 已注入
 * app.get('/secure', (req, ctx) => {
 *   ctx.auth.requireAuth()                              // 未登录抛 401
 *   ctx.auth.requireApp(ctx.appId)                      // 应用成员校验（async）
 * })
 * ```
 */

import type { Context, Handler, Middleware } from '../types.ts'
import { HttpError, type User } from '../types.ts'
import type { Router } from '../core/router.ts'
import type { Row } from '../db/postgres/connection.ts'
import type { SqlClient } from '../postgres/types.ts'
import { hashPassword, verifyPassword } from './password.ts'
import { signToken, verifyToken, generateRefreshToken, hashRefreshToken } from './token.ts'
import { ok, created, noContent, badRequest } from '../response.ts'

export interface UserSystemOptions {
  /** PostgreSQL SqlClient（postgres() 中间件的 .sql） */
  sql: SqlClient
  /** HMAC 签名密钥（至少 32 字符；默认读 AUTH_SECRET） */
  secret?: string
  /** access token 有效期（秒）。默认 3600（1h）。 */
  accessTtlSeconds?: number
  /** refresh token 有效期（天）。默认 30。 */
  refreshTtlDays?: number
  /** 路由前缀。默认 '/api/auth'。 */
  prefix?: string
}

export interface RegisterInput {
  email: string
  password: string
  name?: string
  role?: string
  /** 兼容旧单层模型：注册即绑定应用（新三层模型请用 createApp/registerInApp） */
  tenant?: string
}

/** 应用（产品/tenant 隔离单元） */
export interface AppInfo {
  id: string
  slug: string
  name: string
  owner_user_id: string
  open_registration: boolean
  created_at?: Date
}

/** 我的应用摘要（平台登录/列表返回） */
export interface AppSummary {
  id: string
  slug: string
  name: string
  role: string
}

export interface CreateAppInput {
  slug: string
  name: string
  /** 允许自助注册（默认 false——邀请制） */
  openRegistration?: boolean
}

export interface RegisterInAppInput {
  /** 应用 slug（人类可读路由标识） */
  appSlug: string
  email: string
  password: string
  name?: string
  /** 邀请制（open_registration=false）必传 */
  inviteToken?: string
}

/** ctx.auth 方法面 */
export interface AuthApi {
  register(input: RegisterInput): Promise<{ token: string; refreshToken: string; user: User }>
  login(
    email: string,
    password: string,
  ): Promise<{ token: string; refreshToken: string; user: User; apps: AppSummary[] }>
  /** 撤销 refresh token（logout） */
  logout(refreshToken: string): Promise<void>
  /** 未登录抛 HttpError(401)，否则返回当前用户 */
  requireAuth(): User
  /** 修改密码（登录态；旧密码失效） */
  setPassword(userId: string, newPassword: string): Promise<void>
  /** 生成业务 token（邮箱验证/密码重置自接——应用层用它发邮件） */
  createToken(type: string, payload: Record<string, unknown>, opts: { ttlSeconds: number }): string
  // ── 应用三层模型 ──
  /** 建应用 → 调用者成为 owner（需登录） */
  createApp(input: CreateAppInput): Promise<AppInfo>
  /** 应用内注册：自助（open_registration=true）/ 邀请（inviteToken）——复用或创建平台账号 + 加成员 */
  registerInApp(input: RegisterInAppInput): Promise<{ token: string; refreshToken: string; user: User }>
  /** 应用内登录：验证密码 + 应用成员资格 → token 带 appId + role */
  loginApp(
    appSlug: string,
    email: string,
    password: string,
  ): Promise<{ token: string; refreshToken: string; user: User }>
  /** SSO 登录（无密码）：按 email 找或建平台账号；带 appId 时自动加成员并签发应用会话 */
  ssoLogin(email: string, opts?: { appId?: string; name?: string }): Promise<{ token: string; refreshToken: string; user: User }>
  /** owner 生成邀请 token（7 天有效，可选绑定 email/role） */
  createInvite(appId: string, opts: { email?: string; role?: string }): Promise<{ inviteToken: string }>
  /** owner 直接添加已有平台账号为成员 */
  addMember(appId: string, email: string, role?: string): Promise<void>
  /** 我的应用列表（平台登录后选应用） */
  listMyApps(): Promise<AppSummary[]>
  /** 应用级鉴权：未登录 401、非成员 403；返回成员信息 */
  requireApp(appId: string): Promise<{ userId: string; appId: string; role: string }>
}

export interface UserInjected {
  /** 当前用户（未登录 = null）。每次请求从 token 解码 + 查库（删号/角色变更即时生效） */
  user: User | null
  auth: AuthApi
}

declare module '../types.ts' {
  interface Context {
    auth?: AuthApi
  }
}

export interface UserSystemClient extends Middleware<Context, Context & UserInjected> {
  /** 幂等建表（users + sessions + apps + app_members） */
  migrate: () => Promise<void>
  /** 注册 /api/auth/* 路由；exclude 跳过个别路由（应用层自定义） */
  routes: (
    app: Router<any>,
    opts?: {
      prefix?: string
      exclude?: Array<'register' | 'login' | 'logout' | 'refresh' | 'me' | 'apps'>
    },
  ) => void
}

const USERS_TABLE = '_weifuwu_users'
const SESSIONS_TABLE = '_weifuwu_sessions'
const APP_TABLE = '_weifuwu_apps'
const MEMBER_TABLE = '_weifuwu_app_members'

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function userSystem(options: UserSystemOptions): UserSystemClient {
  const sql = options.sql
  const secretRaw = options.secret ?? process.env.AUTH_SECRET
  if (!secretRaw) {
    throw new Error(
      'userSystem: secret is required — pass options.secret or set AUTH_SECRET (at least 32 chars)',
    )
  }
  if (secretRaw.length < 16) {
    throw new Error('userSystem: secret must be at least 16 characters')
  }
  const secret: string = secretRaw
  const accessTtlSeconds = options.accessTtlSeconds ?? 3600
  const refreshTtlDays = options.refreshTtlDays ?? 30
  const prefix = options.prefix ?? '/api/auth'
  const INVITE_TTL_SECONDS = 7 * 24 * 3600

  // ── 内部状态（每次请求刷新） ──
  let currentUser: User | null = null

  async function findUserById(id: string): Promise<User | null> {
    const rows = await sql.query.from(USERS_TABLE)
      .select('id', 'email', 'name', 'role', 'tenant')
      .where({ id })
      .run()
    return rows.length ? (rows[0] as unknown as User) : null
  }

  async function findMemberRole(appId: string, userId: string): Promise<string | null> {
    const rows = await sql.query.from(MEMBER_TABLE)
      .select('role')
      .where({ app_id: appId, user_id: userId })
      .run()
    return rows.length ? String(rows[0].role) : null
  }

  async function findAppIdBySlug(slug: string): Promise<string | null> {
    const rows = await sql.query.from(APP_TABLE).select('id').where({ slug }).run()
    return rows.length ? String(rows[0].id) : null
  }

  /** 我的应用列表（members join apps——两步查，memory/真库通用） */
  async function listAppsFor(userId: string): Promise<AppSummary[]> {
    const rows = await sql.query.from(MEMBER_TABLE)
      .select('app_id', 'role')
      .where({ user_id: userId })
      .run()
    if (!rows.length) return []
    const out: AppSummary[] = []
    for (const r of rows) {
      const apps = await sql.query.from(APP_TABLE)
        .select('id', 'slug', 'name')
        .where({ id: String(r.app_id) })
        .run()
      if (apps.length) {
        out.push({ id: String(apps[0].id), slug: String(apps[0].slug), name: String(apps[0].name), role: String(r.role) })
      }
    }
    return out
  }

  async function issueSession(
    user: User,
    session?: { appId?: string; role?: string },
  ): Promise<{ token: string; refreshToken: string }> {
    // token 携带 appId（应用态）+ role；兼容旧模型 user.tenant → tenantId
    const token = signToken(
      {
        sub: user.id,
        ...(session?.appId ? { appId: session.appId, role: session.role } : {}),
        ...(!session?.appId && user.tenant ? { tenantId: user.tenant } : {}),
      },
      secret,
      accessTtlSeconds,
    )
    const refreshToken = generateRefreshToken()
    const expiresAt = new Date(Date.now() + refreshTtlDays * 24 * 3600 * 1000)
    await sql.query.insert(SESSIONS_TABLE)
      .values({
        token_hash: hashRefreshToken(refreshToken),
        user_id: user.id,
        expires_at: expiresAt,
        ...(session?.appId ? { app_id: session.appId } : {}),
      })
      .run()
    return { token, refreshToken }
  }

  async function consumeRefreshToken(
    refreshToken: string,
  ): Promise<{ user: User; appId?: string }> {
    const rows = await sql.query.from(`${SESSIONS_TABLE} s`)
      .select('s.user_id', 's.expires_at', 's.app_id')
      .where({ 's.token_hash': hashRefreshToken(refreshToken), 's.revoked_at': { isNull: true } })
      .run()
    if (!rows.length) throw new HttpError('Invalid refresh token', 401)
    const row = rows[0]
    if (new Date(row.expires_at as Date) < new Date()) {
      throw new HttpError('Refresh token expired', 401)
    }
    const user = await findUserById(row.user_id as string)
    if (!user) throw new HttpError('User not found', 401)
    return { user, appId: row.app_id ? String(row.app_id) : undefined }
  }

  // ── 中间件 ──
  const mw = (async (req: Request, ctx: Context, next: Handler) => {
    // **请求局部鉴权快照（B-401 竞态根治——2026-08）**：module 级 currentUser
    // 被所有请求共享——并发窗口（await findUserById 挂起）被其他请求的
    // currentUser=null 覆盖 → requireAuth 读到 null → 401（reports 6 API
    // 并发实证——100 并发 1×401——token 明明有效）。修复：请求解析的 user
    // 存**请求局部**——requireAuth 闭包捕获局部——不再实时读模块变量。
    // （模块 currentUser 保留——register/login 方法内使用——互不干扰。）
    let reqUser: User | null = null
    // 解析 Authorization: Bearer <token>（或 ?token= 直链——下载/打开——2026-08）
    currentUser = null
    // payload 合并：token 携带的会话字段（appId/tenantId/email/name/role 等）透传到 ctx.auth，
    // 让 `ctx.auth.userId` / `ctx.auth.appId` 这类"当前会话数据"直接可用，不必另写解码。
    const sessionPayload: Record<string, unknown> = {}
    let payloadTenantId: unknown
    let payloadAppId: unknown
    const authHeader = req.headers.get('authorization')
    // 直链鉴权（2026-08——下载/打开导航面——前端无法带 Authorization header）：
    // - ?token=（access token 直链——旧兼容）
    // - ?ticket=（下载短时绑定票——type=download——30s + path 绑定——安全升级）
    // 两者仅限 GET 读端点——验证通过即注入 reqUser（path 绑定留端点）
    let rawToken: string | null = null
    if (authHeader?.startsWith('Bearer ')) {
      rawToken = authHeader.slice(7)
    } else if (req.method === 'GET') {
      const u = new URL(req.url ?? '', 'http://localhost')
      const ticket = u.searchParams.get('ticket')
      if (ticket) {
        // ticket 特判：type=download——身份解析（path 绑定端点点内验证）
        const ticketPayload = verifyToken(ticket, secret)
        if (ticketPayload?.type === 'download' && ticketPayload?.sub) {
          reqUser = await findUserById(String(ticketPayload.sub))
          currentUser = reqUser
          sessionPayload.userId = String(ticketPayload.sub)
          if (ticketPayload.appId != null) {
            payloadAppId = ticketPayload.appId
            sessionPayload.appId = String(ticketPayload.appId)
          }
        }
      } else {
        rawToken = u.searchParams.get('token')
      }
    }
    if (rawToken && !reqUser) {
      const payload = verifyToken(rawToken, secret)
      if (payload?.sub) {
        reqUser = await findUserById(String(payload.sub))
        currentUser = reqUser
        for (const [k, v] of Object.entries(payload)) {
          if (k === 'sub' || k === 'iat' || k === 'exp' || k === 'type') continue
          sessionPayload[k] = v
        }
        // sub 即当前用户 id——作为 userId 暴露（兼容 ctx.auth.userId 用法）
        sessionPayload.userId = String(payload.sub)
        payloadTenantId = payload.tenantId
        payloadAppId = payload.appId
      }
    }

    ctx.user = reqUser
    // 应用/租户注入：token payload 携带 appId（新）/tenantId（旧兼容）时直接可用
    if (payloadAppId != null) (ctx as any).appId = String(payloadAppId)
    if (payloadTenantId != null) (ctx as any).tenantId = String(payloadTenantId)
    ctx.auth = {
      // ── 会话 payload 字段（来自 token，应用层签发时决定带什么） ──
      ...sessionPayload,
      async register(input: RegisterInput) {
        if (!input.email || !input.password) throw new HttpError('email and password are required', 400)
        if (input.password.length < 8) throw new HttpError('password must be at least 8 characters', 400)
        const email = normalizeEmail(input.email)
        const passwordHash = await hashPassword(input.password)
        const rows = await sql.query.insert(USERS_TABLE)
          .values({
            email, password_hash: passwordHash,
            name: input.name ?? null, role: input.role ?? null, tenant: input.tenant ?? null,
          })
          .returning('id', 'email', 'name', 'role', 'tenant')
          .run()
        const user = rows[0] as unknown as User
        const session = await issueSession(user)
        currentUser = user // 注册后同请求内 createApp/requireApp 可感知当前用户
        return { ...session, user }
      },

      async login(email: string, password: string) {
        const rows = await sql.query.from(USERS_TABLE)
          .select('id', 'email', 'password_hash', 'name', 'role', 'tenant')
          .where({ email: normalizeEmail(email) })
          .run()
        const row = rows[0]
        // 统一 401（不泄露邮箱是否存在——防枚举）
        if (!row) throw new HttpError('Invalid email or password', 401)
        const valid = await verifyPassword(password, String(row.password_hash))
        if (!valid) throw new HttpError('Invalid email or password', 401)
        const user = {
          id: String(row.id),
          email: String(row.email),
          name: row.name as string | undefined,
          role: row.role as string | undefined,
          tenant: row.tenant as string | undefined,
        }
        const session = await issueSession(user)
        const apps = await listAppsFor(user.id)
        currentUser = user
        return { ...session, user, apps }
      },

      async logout(refreshToken: string) {
        await sql.query.update(SESSIONS_TABLE)
          .set({ revoked_at: sql.raw`now()` })
          .where({ token_hash: hashRefreshToken(refreshToken) })
          .run()
      },

      requireAuth() {
        // B-401 竞态修复（2026-08）：用**请求局部** reqUser（mw 闭包快照）——
        // 不再实时读模块级 currentUser（并发窗口被覆盖 → 有效 token 也 401）
        if (!reqUser) throw new HttpError('Unauthorized', 401)
        return reqUser
      },

      async setPassword(userId: string, newPassword: string) {
        if (newPassword.length < 8) throw new HttpError('password must be at least 8 characters', 400)
        const passwordHash = await hashPassword(newPassword)
        await sql.query.update(USERS_TABLE)
          .set({ password_hash: passwordHash })
          .where({ id: userId })
          .run()
      },

      createToken(type: string, payload: Record<string, unknown>, opts: { ttlSeconds: number }) {
        return signToken({ type, ...payload }, secret, opts.ttlSeconds)
      },

      // ── 应用三层模型 ──
      async createApp(input: CreateAppInput) {
        if (!currentUser) throw new HttpError('Unauthorized', 401)
        if (!input.slug || !input.name) throw new HttpError('slug and name are required', 400)
        const slug = input.slug.trim().toLowerCase()
        const rows = await sql.query.insert(APP_TABLE)
          .values({
            slug, name: input.name,
            owner_user_id: currentUser.id,
            open_registration: input.openRegistration ?? false,
          })
          .returning('id', 'slug', 'name', 'owner_user_id', 'open_registration')
          .run()
        const appInfo = rows[0] as unknown as AppInfo
        // owner 自动成为成员（role=owner）
        await sql.query.insert(MEMBER_TABLE)
          .values({ app_id: appInfo.id, user_id: currentUser.id, role: 'owner', invited_by: currentUser.id })
          .run()
        return appInfo
      },

      async registerInApp(input: RegisterInAppInput) {
        if (!input.email || !input.password) throw new HttpError('email and password are required', 400)
        if (input.password.length < 8) throw new HttpError('password must be at least 8 characters', 400)
        const appRows = await sql.query.from(APP_TABLE)
          .select('id', 'open_registration')
          .where({ slug: input.appSlug })
          .run()
        if (!appRows.length) throw new HttpError('Application not found', 404)
        const appRow = appRows[0] as Row
        const appId = String(appRow.id)
        const email = normalizeEmail(input.email)

        // 邀请校验：open_registration=false 必须有匹配邀请
        let role = 'member'
        if (!appRow.open_registration) {
          if (!input.inviteToken) throw new HttpError('Registration closed for this application', 403)
          const inv = verifyToken(input.inviteToken, secret)
          if (!inv || inv.type !== 'app-invite' || inv.appId !== appId) {
            throw new HttpError('Invalid invite', 403)
          }
          if (inv.email && String(inv.email) !== email) throw new HttpError('Invite email mismatch', 403)
          if (typeof inv.role === 'string' && inv.role !== 'owner') role = inv.role
        }

        // 平台账号：按 email 查找或创建（跨应用复用同一身份）
        let user: User
        const existing = await sql.query.from(USERS_TABLE)
          .select('id', 'email', 'name', 'role', 'tenant')
          .where({ email })
          .run()
        if (existing.length) {
          user = existing[0] as unknown as User
        } else {
          const passwordHash = await hashPassword(input.password)
          const rows = await sql.query.insert(USERS_TABLE)
            .values({
              email, password_hash: passwordHash,
              name: input.name ?? null, role: null, tenant: null,
            })
            .returning('id', 'email', 'name', 'role', 'tenant')
            .run()
          user = rows[0] as unknown as User
        }

        // 加成员（已存在则跳过——幂等）
        const member = await findMemberRole(appId, user.id)
        if (!member) {
          await sql.query.insert(MEMBER_TABLE)
            .values({ app_id: appId, user_id: user.id, role, invited_by: currentUser?.id ?? null })
            .run()
        }

        const session = await issueSession(user, { appId, role })
        currentUser = user
        return { ...session, user }
      },

      async loginApp(appSlug: string, email: string, password: string) {
        const appRows = await sql.query.from(APP_TABLE).select('id').where({ slug: appSlug }).run()
        if (!appRows.length) throw new HttpError('Application not found', 404)
        const appId = String(appRows[0].id)

        const rows = await sql.query.from(USERS_TABLE)
          .select('id', 'email', 'password_hash', 'name', 'role', 'tenant')
          .where({ email: normalizeEmail(email) })
          .run()
        const row = rows[0]
        if (!row) throw new HttpError('Invalid email or password', 401)
        const valid = await verifyPassword(password, String(row.password_hash))
        if (!valid) throw new HttpError('Invalid email or password', 401)

        // 应用成员校验——非成员登录应用 → 401（不泄露成员状态）
        const role = await findMemberRole(appId, String(row.id))
        if (!role) throw new HttpError('Not a member of this application', 401)

        const user = {
          id: String(row.id),
          email: String(row.email),
          name: row.name as string | undefined,
          role: row.role as string | undefined,
          tenant: row.tenant as string | undefined,
        }
        const session = await issueSession(user, { appId, role })
        currentUser = user
        // app 附带角色（2026-08——前端写操作防线需要 role——loginApp 此前
        // 无 app/role 字段——viewer 前端不禁用写按钮——「点击才 403」体验缺口）
        const appLoginRole = role
        return { ...session, user, role: appLoginRole }
      },

      async ssoLogin(email: string, opts?: { appId?: string; name?: string }) {
        const normalized = normalizeEmail(email)
        // 找或建平台账号（无密码——SSO 身份提供方已认证）
        let user: User
        const existing = await sql.query.from(USERS_TABLE)
          .select('id', 'email', 'name', 'role', 'tenant')
          .where({ email: normalized })
          .run()
        if (existing.length) {
          user = existing[0] as unknown as User
        } else {
          const rows = await sql.query.insert(USERS_TABLE)
            .values({ email: normalized, password_hash: null, name: opts?.name ?? null, role: null, tenant: null })
            .returning('id', 'email', 'name', 'role', 'tenant')
            .run()
          user = rows[0] as unknown as User
        }
        // 带 appId：自动加成员（member）+ 应用会话
        let appId: string | undefined
        if (opts?.appId) {
          const member = await findMemberRole(opts.appId, user.id)
          if (!member) {
            await sql.query.insert(MEMBER_TABLE)
              .values({ app_id: opts.appId, user_id: user.id, role: 'member', invited_by: null })
              .run()
          }
          appId = opts.appId
        }
        const session = await issueSession(user, appId ? { appId, role: 'member' } : undefined)
        currentUser = user
        return { ...session, user }
      },

      async createInvite(appId: string, opts: { email?: string; role?: string }) {
        if (!currentUser) throw new HttpError('Unauthorized', 401)
        const role = await findMemberRole(appId, currentUser.id)
        if (role !== 'owner') throw new HttpError('Owner only', 403)
        const inviteRole = opts.role && opts.role !== 'owner' ? opts.role : 'member'
        const inviteToken = signToken(
          { type: 'app-invite', appId, ...(opts.email ? { email: normalizeEmail(opts.email) } : {}), role: inviteRole },
          secret,
          INVITE_TTL_SECONDS,
        )
        return { inviteToken }
      },

      async addMember(appId: string, email: string, role?: string) {
        if (!currentUser) throw new HttpError('Unauthorized', 401)
        const callerRole = await findMemberRole(appId, currentUser.id)
        if (callerRole !== 'owner') throw new HttpError('Owner only', 403)
        const target = await sql.query.from(USERS_TABLE)
          .select('id')
          .where({ email: normalizeEmail(email) })
          .run()
        if (!target.length) throw new HttpError('User not found — invite them to register first', 400)
        const memberRole = role && role !== 'owner' ? role : 'member'
        await sql.query.insert(MEMBER_TABLE)
          .values({ app_id: appId, user_id: String(target[0].id), role: memberRole, invited_by: currentUser.id })
          .run()
      },

      async listMyApps() {
        if (!currentUser) throw new HttpError('Unauthorized', 401)
        return listAppsFor(currentUser.id)
      },

      async requireApp(appId: string) {
        if (!currentUser) throw new HttpError('Unauthorized', 401)
        const role = await findMemberRole(appId, currentUser.id)
        if (!role) throw new HttpError('Not a member of this application', 403)
        return { userId: currentUser.id, appId, role }
      },
    }

    return next(req, ctx)
  }) as unknown as UserSystemClient

  mw.__meta = { injects: ['user', 'auth'], depends: [] } // sql 构造注入（options.sql），非 ctx.sql

  // ── 幂等建表 ──
  mw.migrate = async () => {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${USERS_TABLE} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        name TEXT,
        role TEXT,
        tenant TEXT,
        email_verified BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    // SSO 用户无密码——已有表放宽 NOT NULL（幂等）
    await sql.unsafe(`ALTER TABLE ${USERS_TABLE} ALTER COLUMN password_hash DROP NOT NULL`)
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${SESSIONS_TABLE} (
        token_hash TEXT PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE,
        app_id TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    // 旧库补列（幂等；memory no-op）
    await sql.unsafe(`ALTER TABLE ${SESSIONS_TABLE} ADD COLUMN IF NOT EXISTS app_id TEXT`)
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${APP_TABLE} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        owner_user_id UUID NOT NULL REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE,
        open_registration BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${MEMBER_TABLE} (
        app_id UUID NOT NULL REFERENCES ${APP_TABLE}(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member',
        invited_by UUID,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (app_id, user_id)
      )
    `)
  }

  // ── 路由 ──
  mw.routes = (
    app: Router<any>,
    routeOpts?: { prefix?: string; exclude?: Array<'register' | 'login' | 'logout' | 'refresh' | 'me' | 'apps'> },
  ) => {
    const p = routeOpts?.prefix ?? prefix
    const excluded = new Set(routeOpts?.exclude ?? [])

    if (!excluded.has('register')) app.post(`${p}/register`, async (req, ctx) => {
      const body = (await req.json().catch(() => ({}))) as RegisterInput
      const result = await ctx.auth!.register(body)
      return created(result)
    })

    if (!excluded.has('login')) app.post(`${p}/login`, async (req, ctx) => {
      const body = (await req.json().catch(() => ({}))) as { email: string; password: string }
      if (!body.email || !body.password) return badRequest('email and password are required')
      const result = await ctx.auth!.login(body.email, body.password)
      return ok(result)
    })

    if (!excluded.has('logout')) app.post(`${p}/logout`, async (req, ctx) => {
      const body = (await req.json().catch(() => ({}))) as { refreshToken?: string }
      if (!body.refreshToken) return badRequest('refreshToken is required')
      await ctx.auth!.logout(body.refreshToken)
      return noContent()
    })

    if (!excluded.has('refresh')) app.post(`${p}/refresh`, async (req, ctx) => {
      const body = (await req.json().catch(() => ({}))) as { refreshToken?: string }
      if (!body.refreshToken) throw new HttpError('refreshToken is required', 400)
      const { user, appId } = await consumeRefreshToken(body.refreshToken)
      // 轮换：撤销旧 refresh，签发新对（恢复应用态 appId——session 绑定应用）
      await ctx.auth!.logout(body.refreshToken)
      const session = await issueSession(user, appId ? { appId } : undefined)
      return ok({ ...session, user })
    })

    if (!excluded.has('me')) app.get(`${p}/me`, async (_req, ctx) => {
      if (!ctx.user) throw new HttpError('Unauthorized', 401)
      return ok(ctx.user)
    })

    if (!excluded.has('apps')) {
      // 建应用（owner）
      app.post(`${p}/apps`, async (req, ctx) => {
        const body = (await req.json().catch(() => ({}))) as CreateAppInput
        const appInfo = await ctx.auth!.createApp(body)
        return created({ app: appInfo })
      })
      // 我的应用列表
      app.get(`${p}/apps`, async (_req, ctx) => {
        const apps = await ctx.auth!.listMyApps()
        return ok({ apps })
      })
      // owner 直接添加成员（已有平台账号）
      app.post(`${p}/apps/:appSlug/members`, async (req, ctx) => {
        const body = (await req.json().catch(() => ({}))) as { email?: string; role?: string }
        const appId = await findAppIdBySlug(ctx.params.appSlug)
        if (!appId) throw new HttpError('Application not found', 404)
        await ctx.auth!.addMember(appId, body.email ?? '', body.role)
        return created({ ok: true })
      })
      // owner 生成邀请 token
      app.post(`${p}/apps/:appSlug/invites`, async (req, ctx) => {
        const body = (await req.json().catch(() => ({}))) as { email?: string; role?: string }
        const appId = await findAppIdBySlug(ctx.params.appSlug)
        if (!appId) throw new HttpError('Application not found', 404)
        const result = await ctx.auth!.createInvite(appId, { email: body.email, role: body.role })
        return created(result)
      })
      // 应用内登录（slug 人类可读）
      app.post(`${p}/apps/:appSlug/login`, async (req, ctx) => {
        const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string }
        if (!body.email || !body.password) return badRequest('email and password are required')
        const result = await ctx.auth!.loginApp(ctx.params.appSlug, body.email, body.password)
        return ok(result)
      })
      // 应用内注册（自助/邀请）
      app.post(`${p}/apps/:appSlug/register`, async (req, ctx) => {
        const body = (await req.json().catch(() => ({}))) as {
          email?: string; password?: string; name?: string; inviteToken?: string
        }
        const result = await ctx.auth!.registerInApp({
          appSlug: ctx.params.appSlug,
          email: body.email ?? '',
          password: body.password ?? '',
          name: body.name,
          inviteToken: body.inviteToken,
        })
        return created(result)
      })
    }
  }

  return mw
}
