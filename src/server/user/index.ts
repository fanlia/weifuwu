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
import { randomBytes } from 'node:crypto'

export interface SsoOptions {
  /** IdP issuer（https://idp.example.com——authorize/token/userinfo 派生） */
  issuer: string
  clientId: string
  clientSecret: string
  /** 回调地址（默认 {redirectBase}{prefix}/sso/callback——redirectBase 缺省用 request origin） */
  redirectBase?: string
  /** state 默认绑定应用 slug（跳转时 ?app={slug} 可覆盖——回调定向成员归属） */
  defaultAppSlug?: string
  scope?: string
  /** 回调页渲染（默认 JSON——前端自行接 token；平台可注入 localStorage 脚本页） */
  renderCallback?: (session: { token: string; refreshToken: string; user: User }) => string | Response
}
export interface UserSystemOptions {
  /** PostgreSQL SqlClient（postgres() 中间件的 .sql） */
  sql: SqlClient
  /** HMAC 签名密钥（至少 32 字符；默认读 AUTH_SECRET） */
  secret?: string
/** 生命周期钩子（平台业务注入——默认 Agent/部门/审计等；框架不内置业务） */
  hooks?: UserHooks
  /** 角色白名单（createInvite/registerInApp 幽灵角色拦截——默认 owner/admin/member/viewer） */
  allowedRoles?: string[]
  /** SSO（OIDC 授权码——系统级单 IdP——未配置 = 密码模式优雅降级）
   *  issuer 派生 authorize/token/userinfo 端点（无 discovery——简单兼容） */
  sso?: SsoOptions
  /** 邀请角色白名单（createInvite 专用——默认 allowedRoles；平台可收紧 member/viewer） */
  inviteRoles?: string[]
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
  /**
   * @deprecated B5.2（2027-XX）：自助注册忽略自赋 role（入库恒 null）——
   * 授权一律走应用成员表 role（防假 admin）；平台 profile role 由应用层管理。
   */
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

/** SSO 配置（OIDC 授权码——系统级单 IdP——所有应用共用） */


/** 生命周期钩子（平台业务注入——默认 Agent/部门/审计等；框架不内置业务） */
export interface UserHooks {
  /** 注册建默认应用后（userId + app 信息——平台 onboarding：默认 Agent/部门） */
  onRegisterApp?(userId: string, app: AppInfo): Promise<void> | void
  /** SSO 登录成功建号/加成员后（userId + appId——审计/档案补全） */
  onSsoLogin?(userId: string, appId?: string): Promise<void> | void
  /** 邀请加入既有应用（registerInApp 成功——userId + appId + role——业务：默认 Agent） */
  onJoinApp?(userId: string, appId: string, role: string): Promise<void> | void
}

/** 产品级注册：平台账号 + 默认应用一步完成（owner 成员 + 应用 token 签发） */
export interface RegisterWithAppInput {
  email: string
  password: string
  name?: string
  /** 应用 slug（默认邮箱域名——冲突自动后缀 -N——上限 200） */
  appSlug?: string
  /** 应用显示名（默认 `${name} 的应用`——可空走 name） */
  appName?: string
}

export interface RegisterWithAppResult {
  token: string
  refreshToken: string
  user: User
  app: AppInfo & { role: string }
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
  /** 产品级注册：账号 + 默认应用（owner）+ 应用 token——slug 冲突自动后缀 */
  registerWithApp(input: RegisterWithAppInput): Promise<RegisterWithAppResult>
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
  /** 注册开关（owner only——每个应用可配置开放注册；_builtin 恒 false 不可开） */
  setOpenRegistration(appId: string, open: boolean): Promise<void>
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

/** 当前会话（token 解出的应用态——{ userId, appId, role }·平台账号 token = null） */
export interface Session {
  userId: string
  appId: string
  role: string
}

declare module '../types.ts' {
  interface Context {
    auth?: AuthApi
    session?: Session | null
  }
}

export interface UserSystemClient extends Middleware<Context, Context & UserInjected> {
  /** 幂等建表（users + sessions + apps + app_members） */
  migrate: () => Promise<void>
  /** **系统域种子（幂等）**：ADMIN_EMAILS 类初始配置 → _builtin 成员任命——
   *  第一个邮箱 = owner（超级管理员——唯一·已有则保持）；其余 = admin（系统管理员）。
   *  账号不存在时自动建（password_hash=null——同 SSO 建号语义——登录走企业 IdP/平台流程）。
   *  仅 migrate 后调用（一次引导——此后任命走 addMember） */
  seedBuiltinOwners: (emails: string[]) => Promise<{ owner: string | null; admins: string[] }>
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
/** _builtin 系统应用固定 id（系统域容器：owner=超级管理员·admin=系统管理员——
 *  普通用户不落此域——registerWithApp 不再自动挂） */
export const BUILTIN_APP_ID = '00000000-0000-4000-8000-0000000000b1'
const MEMBER_TABLE = '_weifuwu_app_members'

// B5（2027-XX）：密码长度上下限——下限防弱口令（既有），上限防 MB 级 password
// scrypt DoS（JSON body 可带任意大字符串）
const MIN_PASSWORD_LEN = 8
const MAX_PASSWORD_LEN = 1024

function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LEN) {
    throw new HttpError(`password must be at least ${MIN_PASSWORD_LEN} characters`, 400)
  }
  if (password.length > MAX_PASSWORD_LEN) {
    throw new HttpError('password is too long', 400)
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// B3 延迟拉平（时序防枚举——2027-XX）：不存在邮箱/SSO 无密码账号也执行一次
// 同参数 scrypt verify（dummy 哈希——模块级惰性生成一次）。原缺陷：消息统一
// 但耗时未统一——不存在邮箱 ~1ms vs 错误密码 ~45ms（scrypt）——时序攻击可按
// 响应时间枚举邮箱（响应时间即签名）。dummy 拉平后两条路径同耗时。
let dummyPasswordHash: string | null = null
async function timingEqualize(password: string): Promise<void> {
  dummyPasswordHash ??= await hashPassword('dummy-timing-equalize-password')
  await verifyPassword(password, dummyPasswordHash)
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
  const hooks = options.hooks
  const allowedRoles = options.allowedRoles ?? ['owner', 'admin', 'member', 'viewer']
  const sso = options.sso ?? null
  const inviteRoles = options.inviteRoles ?? allowedRoles
  /** 幽灵角色拦截（B5.2 教训：createInvite 曾放行任意 role 串——可铸造无入口的 admin） */
  function assertRole(role: string | undefined): void {
    if (role !== undefined && !allowedRoles.includes(role)) {
      throw new HttpError(`invalid role: ${role}（allowed: ${allowedRoles.join('/')}）`, 403)
    }
  }
  const accessTtlSeconds = options.accessTtlSeconds ?? 3600
  const refreshTtlDays = options.refreshTtlDays ?? 30
  const prefix = options.prefix ?? '/api/auth'
  const INVITE_TTL_SECONDS = 7 * 24 * 3600


  async function findUserById(id: string): Promise<User | null> {
    const rows = await sql.query.from(USERS_TABLE)
      .select('id', 'email', 'name', 'role', 'tenant')
      .where({ id })
      .run()
    return rows.length ? (rows[0] as unknown as User) : null
  }

  /** 应用管理面入册（幂等）：用户成为 _builtin 成员——身份即资格（注册必经 _builtin）
   *   source: 'register' | 'sso' | 'migrate' */
  async function ensureBuiltinMember(userId: string, source: 'register' | 'sso' | 'migrate'): Promise<void> {
    const existing = await sql.query.from(MEMBER_TABLE).select('role').where({ app_id: BUILTIN_APP_ID, user_id: userId }).run()
    if (existing.length) return
    await sql.query.insert(MEMBER_TABLE).values({
      app_id: BUILTIN_APP_ID, user_id: userId, role: 'member', invited_by: null, source,
    }).onConflict().run()
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

  async function findUserByEmail(email: string): Promise<User | null> {
    const rows = await sql.query.from(USERS_TABLE)
      .select('id', 'email', 'name', 'role', 'tenant')
      .where({ email })
      .run()
    return rows.length ? (rows[0] as unknown as User) : null
  }

  /** 我的应用列表（members JOIN apps——单查询——B4 消除 N+1） */
  async function listAppsFor(userId: string): Promise<AppSummary[]> {
    // B4（2027-XX）：原 members 循环内每 app 一次查询（N 应用 = N+1 往返）——
    // JOIN 单查询（memory/真库双后端已验证：对象式 on 列-列比较 + 输出键无前缀）
    const rows = await sql.query.from(`${MEMBER_TABLE} m`)
      .select('m.app_id', 'm.role', 'a.id', 'a.slug', 'a.name')
      .join(`${APP_TABLE} a`, { 'a.id': { col: 'm.app_id' } })
      .where({ 'm.user_id': userId })
      .run()
    // 保留名（_builtin/_default——系统应用）不进"我的应用"列表——
    //  管理面/平台面有专属入口（_builtin 登录 / _default 直进），业务列表不外露
    return rows.filter((r) => !String(r.slug).startsWith('_')).map((r) => ({
      id: String(r.id),
      slug: String(r.slug),
      name: String(r.name),
      role: String(r.role),
    }))
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
    // B2 原子消费（重放竞态根治）：单条 UPDATE ... RETURNING——
    //  预检（revoked_at IS NULL）与 revoke 写入合并为一个原子语句（行锁互斥）——
    //  并发同 token 恰好一个成功、后到者 0 行 → 401（原 SELECT→revoke 两语句
    //  窗口双放行——实证 200+200）
    const rows = await sql.query.update(SESSIONS_TABLE)
      .set({ revoked_at: sql.raw`now()` })
      .where({ token_hash: hashRefreshToken(refreshToken), revoked_at: { isNull: true } })
      .returning('user_id', 'expires_at', 'app_id')
      .run()
    if (!rows.length) throw new HttpError('Invalid refresh token', 401)
    const row = rows[0]
    if (new Date(row.expires_at as Date) < new Date()) {
      // 过期：消费时已原子吊销——不可重放延长
      throw new HttpError('Refresh token expired', 401)
    }
    const user = await findUserById(row.user_id as string)
    if (!user) throw new HttpError('User not found', 401)
    return { user, appId: row.app_id ? String(row.app_id) : undefined }
  }

  // ── 中间件 ──
  const mw = (async (req: Request, ctx: Context, next: Handler) => {
    // **请求局部鉴权快照（B-401 竞态根治——2026-08）**：并发窗口（await
    // findUserById 挂起）被其他请求覆盖 → 有效 token 也 401（reports 6 API
    // 并发实证——100 并发 1×401）。修复：请求解析的 user 存**请求局部**。
    // **G12（2026-XX 注册竞态根治）**：currentUser 同步请求局部化——原先
    // 模块级可变变量被所有请求共享：并发注册时请求 A 的 register 写入
    // currentUser 后挂起，请求 B 的 register 覆盖 → A 随后的 createApp
    // 把 owner 记到 B 头上 → loginApp 查 A 的 membership 落空 → 401
    // "Not a member of this application"（roles.test 偶发实证）。
    // createInvite/addMember/requireApp/listMyApps 同读该变量——同风险。
    // 修复：声明移入请求闭包——ctx.auth 方法体全在闭包内——读写自动隔离。
    let currentUser: User | null = null
    let reqUser: User | null = null
    // 解析 Authorization: Bearer <token>（或 ?token= 直链——下载/打开——2026-08）
    // payload 合并：token 携带的会话字段（appId/tenantId/email/name/role 等）透传到 ctx.auth，
    // 让 `ctx.auth.userId` / `ctx.auth.appId` 这类"当前会话数据"直接可用，不必另写解码。
    const sessionPayload: Record<string, unknown> = {}
    let payloadTenantId: unknown
    let payloadAppId: unknown
    let payloadRole: unknown
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
        payloadRole = payload.role
      }
    }

    ctx.user = reqUser
    // 应用/租户注入：token payload 携带 appId（新）/tenantId（旧兼容）时直接可用
    if (payloadAppId != null) (ctx as any).appId = String(payloadAppId)
    // USERSYSTEM-V2 会话单源：token 解出的应用态（userId/appId/role——业务一行读身份）
    ctx.session = payloadAppId != null
      ? { userId: String(reqUser!.id), appId: String(payloadAppId), role: String(payloadRole ?? '') }
      : null
    if (payloadTenantId != null) (ctx as any).tenantId = String(payloadTenantId)
    ctx.auth = {
      // ── 会话 payload 字段（来自 token，应用层签发时决定带什么） ──
      ...sessionPayload,
      async register(input: RegisterInput) {
        if (!input.email || !input.password) throw new HttpError('email and password are required', 400)
        validatePassword(input.password)
        const email = normalizeEmail(input.email)
        const passwordHash = await hashPassword(input.password)
        const rows = await sql.query.insert(USERS_TABLE)
          .values({
            email, password_hash: passwordHash,
            // B5.2（2027-XX）：自助注册忽略自赋 role（防假 admin——授权一律
            // 走应用成员表 role；平台 profile role 由应用层管理）
            name: input.name ?? null, role: null, tenant: input.tenant ?? null,
          })
          .returning('id', 'email', 'name', 'role', 'tenant')
          .run()
        const user = rows[0] as unknown as User
        const session = await issueSession(user)
        // 应用管理面入册（定案：一切注册必经 _builtin——身份即资格——纯账号 register 同规则）
        await ensureBuiltinMember(user.id, 'register')
        currentUser = user // 注册后同请求内 createApp/requireApp 可感知当前用户
        return { ...session, user }
      },

      async registerWithApp(input: RegisterWithAppInput): Promise<RegisterWithAppResult> {
        // 1. 平台账号（复用 register 语义——含密码校验/哈希/唯一约束）
        const reg = await this.register({
          email: input.email,
          password: input.password,
          name: input.name,
        })
        // 1.5 应用管理面入册（定案：注册必经 _builtin——身份即资格——
        //     _builtin member=应用管理面成员——后续 createApp 资格校验依赖）
        await ensureBuiltinMember(reg.user.id, 'register')
        // 2. slug 唯一化（冲突自动后缀——收编平台 200 次查找循环——同域名多租户）
        const baseSlug = (input.appSlug ?? input.email.split('@')[1] ?? 'default').trim().toLowerCase()
        let slug = baseSlug
        for (let n = 1; n <= 200; n++) {
          const rows = await findAppIdBySlug(slug)
          if (!rows) break
          slug = `${baseSlug}-${n}`
        }
        // 3. 建应用（owner 成员——createApp 内部自动）
        const appInfo = await this.createApp({
          slug,
          name: input.appName ?? `${input.name ?? '用户'} 的应用`,
          openRegistration: false,
        })
        // 4. 应用 token（role=owner）
        const session = await issueSession(reg.user, { appId: appInfo.id, role: 'owner' })
        // hook：平台 onboarding（默认 Agent/部门等）
        await hooks?.onRegisterApp?.(reg.user.id, appInfo)
        return { ...session, user: reg.user, app: { ...appInfo, role: 'owner' } }
      },

      async login(email: string, password: string) {
        const rows = await sql.query.from(USERS_TABLE)
          .select('id', 'email', 'password_hash', 'name', 'role', 'tenant')
          .where({ email: normalizeEmail(email) })
          .run()
        const row = rows[0]
        // 统一 401（不泄露邮箱是否存在——防枚举）
        // B3：不存在/无密码（SSO）账号也 dummy verify 拉平耗时（时序侧信道）
        if (!row || row.password_hash == null) {
          await timingEqualize(password)
          throw new HttpError('Invalid email or password', 401)
        }
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
        validatePassword(newPassword)
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
        // 保留命名空间（_builtin/_default 系统应用——createApp 拒绝 '_' 前缀）
        if (slug.startsWith('_')) throw new HttpError('slug 以 _ 开头为系统保留名', 400)
        // 身份即资格：只有应用管理面（_builtin）成员能创建应用
        const builtinRole = await findMemberRole(BUILTIN_APP_ID, currentUser.id)
        if (!builtinRole) {
          throw new HttpError('仅应用管理面（_builtin）成员可创建应用', 403)
        }
        // appKey：随机 64 hex（应用级机器凭据——appId 即应用 id——分离沟通面）
        const appKey = randomBytes(32).toString('hex')
        const rows = await sql.query.insert(APP_TABLE)
          .values({
            slug, name: input.name,
            owner_user_id: currentUser.id,
            open_registration: input.openRegistration ?? false,
            app_key: appKey,
          })
          .returning('id', 'slug', 'name', 'owner_user_id', 'open_registration', 'app_key')
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
        validatePassword(input.password)
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
          if (typeof inv.role === 'string' && inv.role !== 'owner') {
            assertRole(inv.role)
            role = inv.role
          }
        }

        // 平台账号：按 email 查找或创建（跨应用复用同一身份）
        let user = await findUserByEmail(email)
        if (!user) {
          const passwordHash = await hashPassword(input.password)
          const rows = await sql.query.insert(USERS_TABLE)
            .values({
              email, password_hash: passwordHash,
              name: input.name ?? null, role: null, tenant: null,
            })
            // B6（2027-XX）：并发同 email 建号竞态——唯一冲突 DO NOTHING + 再查
            // （幂等——非 409；先到者数据为准）
            .onConflict('email')
            .returning('id', 'email', 'name', 'role', 'tenant')
            .run()
          user = rows.length ? (rows[0] as unknown as User) : await findUserByEmail(email)
          if (!user) throw new HttpError('User creation failed', 500)
        }

        // 应用管理面入册（注册必经 _builtin——若尚未入册）
        await ensureBuiltinMember(user.id, 'register')
        // 加成员（已存在则跳过——幂等）+ 并发 PK 冲突 DO NOTHING（B6）
        const member = await findMemberRole(appId, user.id)
        if (!member) {
          await sql.query.insert(MEMBER_TABLE)
            .values({ app_id: appId, user_id: user.id, role, invited_by: currentUser?.id ?? null, source: 'invite' })
            .onConflict()
            .run()
        }

        const session = await issueSession(user, { appId, role })
        await sql.query.update(MEMBER_TABLE).set({ last_login_at: new Date() }).where({ app_id: appId, user_id: user.id }).run()
        currentUser = user
        await hooks?.onJoinApp?.(user.id, appId, role)
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
        if (!row || row.password_hash == null) {
          await timingEqualize(password)
          throw new HttpError('Invalid email or password', 401)
        }
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
        await sql.query.update(MEMBER_TABLE).set({ last_login_at: new Date() }).where({ app_id: appId, user_id: user.id }).run()
        currentUser = user
        // app 附带角色（2026-08——前端写操作防线需要 role——loginApp 此前
        // 无 app/role 字段——viewer 前端不禁用写按钮——「点击才 403」体验缺口）
        const appLoginRole = role
        return { ...session, user, role: appLoginRole }
      },

      async ssoLogin(email: string, opts?: { appId?: string; name?: string }) {
        const normalized = normalizeEmail(email)
        // 找或建平台账号（无密码——SSO 身份提供方已认证）
        let user = await findUserByEmail(normalized)
        if (!user) {
          const rows = await sql.query.insert(USERS_TABLE)
            .values({ email: normalized, password_hash: null, name: opts?.name ?? null, role: null, tenant: null })
            // B6（2027-XX）：并发同 email 建号竞态——唯一冲突 DO NOTHING + 再查
            .onConflict('email')
            .returning('id', 'email', 'name', 'role', 'tenant')
            .run()
          user = rows.length ? (rows[0] as unknown as User) : await findUserByEmail(normalized)
          if (!user) throw new HttpError('User creation failed', 500)
        }
        // 应用管理面入册（SSO 建号同一规则）
        await ensureBuiltinMember(user.id, 'sso')
        // 带 appId：自动加成员（member）+ 应用会话
        let appId: string | undefined
        if (opts?.appId) {
          const member = await findMemberRole(opts.appId, user.id)
          if (!member) {
            await sql.query.insert(MEMBER_TABLE)
              .values({ app_id: opts.appId, user_id: user.id, role: 'member', invited_by: null, source: 'sso' })
              .onConflict()
              .run()
          }
          appId = opts.appId
          await sql.query.update(MEMBER_TABLE).set({ last_login_at: new Date() }).where({ app_id: opts.appId, user_id: user.id }).run()
        }
        const session = await issueSession(user, appId ? { appId, role: 'member' } : undefined)
        currentUser = user
        return { ...session, user }
      },

      async createInvite(appId: string, opts: { email?: string; role?: string }) {
        // 系统域不开放邀请：超级/系统管理员是任命制（seed/addMember）——邀请链接属业务应用
        if (appId === BUILTIN_APP_ID) throw new HttpError('_builtin 不走邀请流（任命制）', 403)
        // 邀请角色白名单（平台红线：邀请链接流向普通成员——仅 member/viewer）
        if (opts.role !== undefined && !inviteRoles.includes(opts.role)) {
          throw new HttpError(`invite role not allowed: ${opts.role}（allowed: ${inviteRoles.join('/')}）`, 403)
        }
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
        assertRole(role)
        // 应用管理面（_builtin）：member 合法（管理面身份）· viewer 禁（无只读概念）
        if (appId === BUILTIN_APP_ID && role !== undefined && role === 'viewer') {
          throw new HttpError('_builtin 无只读（viewer 禁——管理面身份）', 403)
        }
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

      async setOpenRegistration(appId: string, open: boolean) {
        if (!currentUser) throw new HttpError('Unauthorized', 401)
        // 应用管理面（_builtin）注册开关恒 false（管理面无自助注册——成员走入册流程）
        if (appId === BUILTIN_APP_ID) throw new HttpError('_builtin 注册开关恒 false', 403)
        const callerRole = await findMemberRole(appId, currentUser.id)
        if (callerRole !== 'owner') throw new HttpError('Owner only', 403)
        await sql.query.update(APP_TABLE).set({ open_registration: open }).where({ id: appId }).run()
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
  mw.seedBuiltinOwners = async (emails: string[]) => {
    const result: { owner: string | null; admins: string[] } = { owner: null, admins: [] }
    for (const raw of emails) {
      const email = normalizeEmail(raw)
      if (!email) continue
      let user = await findUserByEmail(email)
      if (!user) {
        // 账号不存在 → 自动建（无密码——同 SSO 建号语义；登录由 IdP/平台流程承接）
        const rows = await sql.query.insert(USERS_TABLE)
          .values({ email, password_hash: null, name: null, role: null, tenant: null })
          .onConflict('email')
          .returning('id', 'email', 'name', 'role', 'tenant')
          .run()
        user = rows.length ? (rows[0] as unknown as User) : await findUserByEmail(email)
      }
      if (!user) continue
      // 已有成员：保持现状（owner 唯一性——后续邮箱不覆盖）
      const existing = await sql.query.from(MEMBER_TABLE).select('role').where({ app_id: BUILTIN_APP_ID, user_id: user.id }).run()
      if (existing.length) {
        const r = String(existing[0].role ?? '')
        if (r === 'owner') result.owner = String(user.id)
        else result.admins.push(String(user.id))
        continue
      }
      if (!result.owner) {
        await sql.query.insert(MEMBER_TABLE).values({
          app_id: BUILTIN_APP_ID, user_id: String(user.id), role: 'owner', invited_by: null, source: 'seed',
        }).run()
        result.owner = String(user.id)
        // 定案：首 owner（超级管理员）关联 _default（平台业务应用 owner 成员）——
        //   开发者直接用 _default 开发（agent-platform 即此实例化）
        const defId = await findAppIdBySlug('_default')
        if (defId) {
          const defMember = await findMemberRole(defId, String(user.id))
          if (!defMember) {
            await sql.query.insert(MEMBER_TABLE).values({
              app_id: defId, user_id: String(user.id), role: 'owner', invited_by: null, source: 'seed',
            }).run()
          }
        }
      } else {
        await sql.query.insert(MEMBER_TABLE).values({
          app_id: BUILTIN_APP_ID, user_id: String(user.id), role: 'admin', invited_by: result.owner, source: 'seed',
        }).run()
        result.admins.push(String(user.id))
      }
    }
    return result
  }

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
    // _builtin 系统应用：系统应用本身（migrate 幂等建——slug 固定）
    //   owner 可空（系统应用无自然人 owner——管理面另行授权）
    await sql.unsafe(`ALTER TABLE ${APP_TABLE} ALTER COLUMN owner_user_id DROP NOT NULL`)
    // 固定 id（`00000000-0000-4000-8000-0000000000b1` 可读形态）——migrate 幂等唯一
    // （先查后插——query builder 双后端兼容——memory 不支持 ON CONFLICT）
    const builtinRows = await sql.query.from(APP_TABLE).select('id').where({ slug: '_builtin' }).run()
    if (!builtinRows.length) {
      await sql.query.insert(APP_TABLE).values({
        id: BUILTIN_APP_ID,
        slug: '_builtin',
        name: 'System',
        owner_user_id: null,
        open_registration: false,
      }).run()
    }
    // 应用凭据（分离沟通面——业务应用 ↔ _builtin 机器认证）：
    //   appId（应用 id）+ appKey（随机 64 hex——createApp 生成/存量回填）
    await sql.unsafe(`ALTER TABLE ${APP_TABLE} ADD COLUMN IF NOT EXISTS app_key TEXT`)
    const keyless = await sql.query.from(APP_TABLE).select('id').where({ app_key: null }).run()
    for (const a of keyless) {
      await sql.query.update(APP_TABLE).set({ app_key: randomBytes(32).toString('hex') }).where({ id: String(a.id) }).run()
    }
    // _default 平台业务应用（系统初始化三件套：_builtin + owner 用户 + _default 关联——
    //   migrate 先建（owner 空）· seedBuiltinOwners 首 owner 关联——普通应用属性
    //   （可配置开放注册——与 _builtin 恒 false 不同））
    const defRows = await sql.query.from(APP_TABLE).select('id').where({ slug: '_default' }).run()
    if (!defRows.length) {
      await sql.query.insert(APP_TABLE).values({
        slug: '_default',
        name: 'Default',
        owner_user_id: null,
        open_registration: false,
      }).run()
    }
    // members 元数据（USERSYSTEM-V2：注册来源 + 最后登录——幂等补列）
    await sql.unsafe(`ALTER TABLE ${MEMBER_TABLE} ADD COLUMN IF NOT EXISTS source TEXT`)
    await sql.unsafe(`ALTER TABLE ${MEMBER_TABLE} ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`)
    // 存量补挂（定案：全员应用管理面入册——旧库 users 无 _builtin 成员行者补——
    //   query builder 循环——memory/真库双后端一致——迁移期一次性 O(N) 可接受）
    const leftover = await sql.query.from(USERS_TABLE).select('id').run()
    for (const u of leftover) {
      await ensureBuiltinMember(String(u.id), 'migrate')
    }
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

    // 产品级注册（USERSYSTEM-V2）：账号 + _builtin 成员 + 默认应用（owner）+ 应用 token
    if (!excluded.has('register')) app.post(`${p}/register-app`, async (req, ctx) => {
      const body = (await req.json().catch(() => ({}))) as RegisterWithAppInput
      const result = await ctx.auth!.registerWithApp(body)
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
      // 轮换：consume 已原子撤销旧 refresh（无独立 logout 双写）——签发新对
      // B1（role 恢复——2027-XX）：app 会话据成员表恢复 role（权威源——角色
      // 变更即时生效；原缺陷 refresh 丢 role 字段——前端角色 UI 失效）；
      // 成员被移除 → 降级平台会话（无 appId——零残留应用访问）
      let appSession: { appId: string; role: string } | undefined
      if (appId) {
        const role = await findMemberRole(appId, user.id)
        if (role) appSession = { appId, role }
      }
      const session = await issueSession(user, appSession)
      return ok({ ...session, user })
    })

    if (!excluded.has('me')) app.get(`${p}/me`, async (_req, ctx) => {
      if (!ctx.user) throw new HttpError('Unauthorized', 401)
      // USERSYSTEM-V2：user + 会话面（应用 token → session；平台账号 → null）——前端角色单源
      return ok({ user: ctx.user, session: ctx.session ?? null })
    })

    // ── SSO（OIDC 授权码——USERSYSTEM-V2：应用面登录全 SSO——未配置=优雅降级） ──
    if (sso) {
      app.get(`${p}/sso/enabled`, async () => ok({ enabled: true, appSlug: sso.defaultAppSlug ?? null }))

      // 1) 302 跳 IdP authorize（state = 目标应用 slug——回调定向成员归属）
      app.get(`${p}/sso/login`, async (req) => {
        const url = new URL(req.url ?? '', 'http://localhost')
        const targetApp = url.searchParams.get('app') ?? sso.defaultAppSlug
        const params = new URLSearchParams({
          response_type: 'code',
          client_id: sso.clientId,
          redirect_uri: sso.redirectBase
            ? `${sso.redirectBase.replace(/\/$/, '')}${p}/sso/callback`
            : `${new URL(req.url, 'http://localhost').origin}${p}/sso/callback`,
          scope: sso.scope ?? 'openid email profile',
          state: targetApp ?? 'sso',
        })
        return new Response(null, { status: 302, headers: { Location: `${sso.issuer.replace(/\/$/, '')}/authorize?${params}` } })
      })

      // 2) 回调：code → token → userinfo → ssoLogin（建号/加成员）→ 回调页
      app.get(`${p}/sso/callback`, async (req, ctx) => {
        const url = new URL(req.url ?? '', 'http://localhost')
        const code = url.searchParams.get('code')
        if (!code) throw new HttpError('SSO 回调缺少 code', 400)
        const redirectUri = sso.redirectBase
          ? `${sso.redirectBase.replace(/\/$/, '')}${p}/sso/callback`
          : `${url.origin}${p}/sso/callback`
        // code → token（信任 IdP token 端点——完整 JWT 验签留待生产强化——边界登记）
        const tokenRes = await fetch(`${sso.issuer.replace(/\/$/, '')}/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: sso.clientId,
            client_secret: sso.clientSecret,
          }),
        })
        if (!tokenRes.ok) throw new HttpError('SSO token 交换失败', 401)
        const tokenData = (await tokenRes.json()) as { access_token?: string }
        // userinfo → email
        const infoRes = await fetch(`${sso.issuer.replace(/\/$/, '')}/userinfo`, {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        })
        if (!infoRes.ok) throw new HttpError('SSO 用户信息获取失败', 401)
        const info = (await infoRes.json()) as { email?: string; name?: string }
        const email = (info.email ?? '').trim().toLowerCase()
        if (!email) throw new HttpError('SSO 未返回邮箱（需要 email scope）', 401)

        // state 定向：?app={slug}（或 defaultAppSlug）→ 自动加入目标应用
        const slug = url.searchParams.get('state')
        let appId: string | undefined
        if (slug && slug !== 'sso') {
          const found = await findAppIdBySlug(slug)
          if (found) appId = found
        }
        const session = await ctx.auth!.ssoLogin(email, { appId, name: info.name })
        await hooks?.onSsoLogin?.(session.user.id, appId)
        const payload = { token: session.token, refreshToken: session.refreshToken, user: session.user }
        if (sso.renderCallback) {
          const html = sso.renderCallback(payload)
          return typeof html === 'string'
            ? new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
            : html
        }
        return ok(payload)
      })
    }

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
      // 注册开关（owner only——_builtin 恒 false·403）
      app.patch(`${p}/apps/:appSlug/registration`, async (req, ctx) => {
        const body = (await req.json().catch(() => ({}))) as { open?: boolean }
        if (typeof body.open !== 'boolean') return badRequest('open is required (boolean)')
        const appId = await findAppIdBySlug(ctx.params.appSlug)
        if (!appId) throw new HttpError('Application not found', 404)
        await ctx.auth!.setOpenRegistration(appId, body.open)
        return ok({ open: body.open })
      })
      // 机器认证（业务应用 ↔ 控制平面沟通面——未来分离的服务间认证）：
      //   X-Wf-App-Id（应用 id）+ X-Wf-App-Key（随机密钥）→ 应用信息
      app.post(`${p}/system/verify`, async (req) => {
        const appId = req.headers.get('x-wf-app-id')
        const appKey = req.headers.get('x-wf-app-key')
        if (!appId || !appKey) return badRequest('X-Wf-App-Id / X-Wf-App-Key required')
        const rows = await sql.query.from(APP_TABLE).select('id', 'slug', 'name').where({ id: appId, app_key: appKey }).run()
        if (!rows.length) throw new HttpError('Invalid app credentials', 403)
        const a = rows[0] as Row
        return ok({ app: { id: String(a.id), slug: String(a.slug), name: String(a.name) } })
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
