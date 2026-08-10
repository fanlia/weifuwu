/**
 * weifuwu/userSystem — 用户系统中间件
 *
 * 注入 ctx.user（从 Authorization: Bearer 解码 + 查库）+ ctx.auth（方法面）。
 * users.routes(app) 注册 /api/auth/* 路由；users.migrate() 幂等建表。
 *
 * 安全基线：
 *   - scrypt 密码哈希（per-user salt + timing-safe compare，异步不阻塞）
 *   - access token：HMAC-SHA256 JWT（无状态，与 client auth() 兼容）
 *   - refresh token：不透明随机串，DB 只存哈希，logout/轮换即撤销
 *   - 登录失败统一 401（不泄露"邮箱是否存在"——防枚举）
 *
 * 诚实裁剪：
 *   ✅ register/login/logout/me/refresh / setPassword / createToken / tenant claim
 *   ❌ OAuth、邮箱验证邮件（给 createToken + setPassword 底层 API 自接）、
 *      多因素、RBAC 权限引擎（只提供 role 字段）、多租户语义（tenant-ready）
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
 * app.post('/secure', (req, ctx) => {
 *   ctx.auth.requireAuth()                              // 未登录抛 401
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
  tenant?: string
}

/** ctx.auth 方法面 */
export interface AuthApi {
  register(input: RegisterInput): Promise<{ token: string; refreshToken: string; user: User }>
  login(email: string, password: string): Promise<{ token: string; refreshToken: string; user: User }>
  /** 撤销 refresh token（logout） */
  logout(refreshToken: string): Promise<void>
  /** 未登录抛 HttpError(401)，否则返回当前用户 */
  requireAuth(): User
  /** 修改密码（登录态；旧密码失效） */
  setPassword(userId: string, newPassword: string): Promise<void>
  /** 生成业务 token（邮箱验证/密码重置自接——应用层用它发邮件） */
  createToken(type: string, payload: Record<string, unknown>, opts: { ttlSeconds: number }): string
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
  /** 幂等建表（users + sessions） */
  migrate: () => Promise<void>
  /** 注册 /api/auth/* 路由（register/login/logout/me/refresh）；exclude 跳过个别路由（应用层自定义） */
  routes: (app: Router<any>, opts?: { prefix?: string; exclude?: Array<'register' | 'login' | 'logout' | 'refresh' | 'me'> }) => void
}

const USERS_TABLE = '_weifuwu_users'
const SESSIONS_TABLE = '_weifuwu_sessions'

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

  // ── 内部状态（每次请求刷新） ──
  let currentUser: User | null = null

  async function findUserById(id: string): Promise<User | null> {
    const rows = await sql.query.from(USERS_TABLE)
      .select('id', 'email', 'name', 'role', 'tenant')
      .where({ id })
      .run()
    return rows.length ? (rows[0] as unknown as User) : null
  }

  async function issueSession(user: User): Promise<{ token: string; refreshToken: string }> {
    // token 携带租户（user.tenant）——中间件据此注入 ctx.tenantId + 合并到 ctx.auth（多租户感知）
    const token = signToken(
      { sub: user.id, ...(user.tenant ? { tenantId: user.tenant } : {}) },
      secret,
      accessTtlSeconds,
    )
    const refreshToken = generateRefreshToken()
    const expiresAt = new Date(Date.now() + refreshTtlDays * 24 * 3600 * 1000)
    await sql.query.insert(SESSIONS_TABLE)
      .values({ token_hash: hashRefreshToken(refreshToken), user_id: user.id, expires_at: expiresAt })
      .run()
    return { token, refreshToken }
  }

  async function consumeRefreshToken(refreshToken: string): Promise<User> {
    const rows = await sql.query.from(`${SESSIONS_TABLE} s`)
      .select('s.user_id', 's.expires_at')
      .where({ 's.token_hash': hashRefreshToken(refreshToken), 's.revoked_at': { isNull: true } })
      .run()
    if (!rows.length) throw new HttpError('Invalid refresh token', 401)
    const row = rows[0]
    if (new Date(row.expires_at as Date) < new Date()) {
      throw new HttpError('Refresh token expired', 401)
    }
    const user = await findUserById(row.user_id as string)
    if (!user) throw new HttpError('User not found', 401)
    return user
  }

  // ── 中间件 ──
  const mw = (async (req: Request, ctx: Context, next: Handler) => {
    // 解析 Authorization: Bearer <token>
    currentUser = null
    // payload 合并：token 携带的会话字段（tenantId/email/name/role 等）透传到 ctx.auth，
    // 让 `ctx.auth.userId` / `ctx.auth.tenantId` 这类"当前会话数据"直接可用，不必另写解码。
    const sessionPayload: Record<string, unknown> = {}
    let payloadTenantId: unknown
    const authHeader = req.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const payload = verifyToken(authHeader.slice(7), secret)
      if (payload?.sub) {
        currentUser = await findUserById(String(payload.sub))
        for (const [k, v] of Object.entries(payload)) {
          if (k === 'sub' || k === 'iat' || k === 'exp' || k === 'type') continue
          sessionPayload[k] = v
        }
        // sub 即当前用户 id——作为 userId 暴露（兼容 ctx.auth.userId 用法）
        sessionPayload.userId = String(payload.sub)
        payloadTenantId = payload.tenantId
      }
    }

    ctx.user = currentUser
    // 多租户注入：token payload 携带 tenantId 时直接可用（应用层不必再写 tenant 中间件）
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
        return { ...session, user }
      },

      async logout(refreshToken: string) {
        await sql.query.update(SESSIONS_TABLE)
          .set({ revoked_at: sql.raw`now()` })
          .where({ token_hash: hashRefreshToken(refreshToken) })
          .run()
      },

      requireAuth() {
        if (!currentUser) throw new HttpError('Unauthorized', 401)
        return currentUser
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
        password_hash TEXT NOT NULL,
        name TEXT,
        role TEXT,
        tenant TEXT,
        email_verified BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${SESSIONS_TABLE} (
        token_hash TEXT PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
  }

  // ── 路由 ──
  mw.routes = (app: Router<any>, routeOpts?: { prefix?: string; exclude?: Array<'register' | 'login' | 'logout' | 'refresh' | 'me'> }) => {
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
      const user = await consumeRefreshToken(body.refreshToken)
      // 轮换：撤销旧 refresh，签发新对
      await ctx.auth!.logout(body.refreshToken)
      const session = await issueSession(user)
      return ok({ ...session, user })
    })

    if (!excluded.has('me')) app.get(`${p}/me`, async (_req, ctx) => {
      if (!ctx.user) throw new HttpError('Unauthorized', 401)
      return ok(ctx.user)
    })
  }

  return mw
}
