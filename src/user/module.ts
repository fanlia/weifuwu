/**
 * User module — authentication, registration, and user CRUD.
 *
 * Depends on `postgres()` middleware registered first (provides `ctx.sql`).
 *
 * ```ts
 * import { serve, Router, postgres, user } from 'weifuwu'
 *
 * const app = new Router()
 * app.use(postgres())
 * app.use(user({ secret: process.env.JWT_SECRET }))
 *
 * app.post('/api/register', async (req, ctx) => {
 *   const result = await ctx.userModule.register(await req.json())
 *   return Response.json(result)
 * })
 *
 * app.post('/api/login', async (req, ctx) => {
 *   const { email, password } = await req.json()
 *   const result = await ctx.userModule.login(email, password)
 *   if (!result) return new Response('Unauthorized', { status: 401 })
 *   return Response.json(result)
 * })
 *
 * app.get('/api/me', async (req, ctx) => {
 *   if (!ctx.user) return new Response('Unauthorized', { status: 401 })
 *   return Response.json(ctx.user)
 * })
 * ```
 */

import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto'
import type { Context, Handler, SqlClient } from '../types.ts'
import type {
  UserModuleAPI,
  UserModuleOptions,
  UserRecord,
  CreateUserInput,
  UpdateUserInput,
  TokenPayload,
} from './types.ts'

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const DEFAULT_TABLE = 'users'
const DEFAULT_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000 // 7 days
const SALT_LENGTH = 32
const KEY_LENGTH = 64
const HASH_ALGORITHM = 'sha256'

// ═══════════════════════════════════════════════════════════════
// Password hashing (scrypt + random salt)
// ═══════════════════════════════════════════════════════════════

function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString('hex')
  const key = scryptSync(password, salt, KEY_LENGTH).toString('hex')
  return `scrypt:${salt}:${key}`
}

async function verifyScrypt(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, salt, key] = parts
  const expected = scryptSync(password, salt, KEY_LENGTH).toString('hex')
  const a = Buffer.from(key, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ═══════════════════════════════════════════════════════════════
// Token signing (HMAC HS256, JWT-like format)
// ═══════════════════════════════════════════════════════════════

function base64url(data: string): string {
  return Buffer.from(data).toString('base64url')
}

function base64urlDecode(str: string): string {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

function hmacSign(payload: string, secret: string): string {
  return createHmac(HASH_ALGORITHM, secret).update(payload).digest('base64url')
}

function tokenEncode(payload: TokenPayload, secret: string): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64url(JSON.stringify(payload))
  return `${header}.${body}.${hmacSign(`${header}.${body}`, secret)}`
}

function tokenDecode(token: string, secret: string): TokenPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [headerB64, payloadB64, sigB64] = parts
    const expectedSig = hmacSign(`${headerB64}.${payloadB64}`, secret)
    const sigBuf = Buffer.from(sigB64, 'base64url')
    const expectedBuf = Buffer.from(expectedSig, 'base64url')
    if (sigBuf.length !== expectedBuf.length) return null
    if (!timingSafeEqual(sigBuf, expectedBuf)) return null
    const payload: TokenPayload = JSON.parse(base64urlDecode(payloadB64))
    if (payload.exp && payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  for (const c of cookieHeader.split(';')) {
    const [key, ...rest] = c.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return null
}

function extractToken(req: Request): string | null {
  return (
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    parseCookie(req.headers.get('cookie'), 'token') ??
    null
  )
}

function toUserRecord(row: Record<string, unknown>): UserRecord {
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string,
    role: row.role as string,
    avatar: row.avatar as string | undefined,
    is_active: row.is_active as boolean,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
    last_login_at: row.last_login_at as Date | undefined,
  }
}

function getSqlFromCtx(ctx: Context): SqlClient {
  const sql = (ctx as Record<string, unknown>).sql as SqlClient | undefined
  if (!sql) {
    throw new Error(
      'user() requires postgres() middleware to be registered first.\n' +
      'Make sure app.use(postgres()) is called before app.use(user())',
    )
  }
  return sql
}

// ═══════════════════════════════════════════════════════════════
// Implementation
// ═══════════════════════════════════════════════════════════════

export class UserModule {
  readonly table: string
  readonly secret: string
  readonly tokenExpiry: number
  private migrated = false

  constructor(opts?: UserModuleOptions) {
    this.table = opts?.table ?? DEFAULT_TABLE
    this.secret = opts?.secret ?? process.env.JWT_SECRET ?? 'change-me-in-production'
    this.tokenExpiry = opts?.tokenExpiry ?? DEFAULT_TOKEN_EXPIRY
  }

  // ── Migration ─────────────────────────────────────────────

  async migrate(sql: SqlClient): Promise<void> {
    if (this.migrated) return

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "${this.table}" (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email       TEXT NOT NULL UNIQUE,
        name        TEXT NOT NULL,
        password    TEXT NOT NULL,
        role        TEXT NOT NULL DEFAULT 'user',
        avatar      TEXT,
        is_active   BOOLEAN NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ
      )
    `)

    await sql.unsafe(`CREATE INDEX IF NOT EXISTS "${this.table}_email_idx" ON "${this.table}" (email)`)
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS "${this.table}_role_idx" ON "${this.table}" (role)`)

    this.migrated = true
  }

  // ── Per-request bound API ─────────────────────────────────

  /**
   * Create a per-request `UserModuleAPI` bound to the request's SQL context.
   * Called internally by the middleware. Thread-safe because each request
   * gets its own closure with a captured `ctx`.
   */
  bind(ctx: Context): UserModuleAPI {
    const self = this
    const sql = getSqlFromCtx(ctx)

    // Auto-migrate on first request
    if (!this.migrated) {
      this.migrate(sql).catch(() => {
        // migration failure is handled gracefully downstream
      })
    }

    return {
      createUser(input: CreateUserInput) {
        return self._createUser(input, sql)
      },

      register(input: CreateUserInput) {
        return self._register(input, sql)
      },

      login(email: string, password: string) {
        return self._login(email, password, sql)
      },

      getUserById(id: string) {
        return self._getUserById(id, sql)
      },

      getUserByEmail(email: string) {
        return self._getUserByEmail(email, sql)
      },

      updateUser(id: string, input: Partial<UpdateUserInput>) {
        return self._updateUser(id, input, sql)
      },

      deleteUser(id: string) {
        return self._deleteUser(id, sql)
      },

      listUsers(includeInactive = false) {
        return self._listUsers(sql, includeInactive)
      },

      changePassword(id: string, currentPassword: string, newPassword: string) {
        return self._changePassword(id, currentPassword, newPassword, sql)
      },

      verifyPassword(password: string, hash: string) {
        return verifyScrypt(password, hash)
      },

      generateToken(user: UserRecord) {
        return Promise.resolve(self._generateToken(user))
      },

      verifyToken(token: string) {
        return Promise.resolve(self._verifyToken(token))
      },

      refreshToken(token: string) {
        return Promise.resolve(self._refreshToken(token))
      },
    }
  }

  // ── Internal CRUD (take sql explicitly) ────────────────────

  private async ensureMigrated(sql: SqlClient): Promise<void> {
    if (!this.migrated) await this.migrate(sql)
  }

  private async _register(input: CreateUserInput, sql: SqlClient): Promise<{ user: UserRecord; token: string }> {
    const user = await this._createUser(input, sql)
    const token = this._generateToken(user)
    return { user, token }
  }

  private async _createUser(input: CreateUserInput, sql: SqlClient): Promise<UserRecord> {
    await this.ensureMigrated(sql)

    const hash = hashPassword(input.password)
    const role = input.role ?? 'user'
    const isActive = input.is_active ?? true

    const [row] = await sql.unsafe(
      `INSERT INTO "${this.table}" (email, name, password, role, avatar, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [input.email, input.name, hash, role, input.avatar ?? null, isActive],
    ) as unknown as Record<string, unknown>[]

    if (!row) throw new Error('Failed to create user')
    return toUserRecord(row)
  }

  private async _getUserById(id: string, sql: SqlClient): Promise<UserRecord | null> {
    await this.ensureMigrated(sql)
    const [row] = await sql.unsafe(
      `SELECT * FROM "${this.table}" WHERE id = $1`, [id],
    ) as unknown as Record<string, unknown>[]
    return row ? toUserRecord(row) : null
  }

  private async _getUserByEmail(email: string, sql: SqlClient): Promise<UserRecord | null> {
    await this.ensureMigrated(sql)
    const [row] = await sql.unsafe(
      `SELECT * FROM "${this.table}" WHERE email = $1`, [email],
    ) as unknown as Record<string, unknown>[]
    return row ? toUserRecord(row) : null
  }

  private async _updateUser(id: string, input: Partial<UpdateUserInput>, sql: SqlClient): Promise<UserRecord | null> {
    await this.ensureMigrated(sql)

    const sets: string[] = []
    const values: unknown[] = []
    let idx = 1

    if (input.name !== undefined) { sets.push(`name = $${idx++}`); values.push(input.name) }
    if (input.email !== undefined) { sets.push(`email = $${idx++}`); values.push(input.email) }
    if (input.role !== undefined) { sets.push(`role = $${idx++}`); values.push(input.role) }
    if (input.avatar !== undefined) { sets.push(`avatar = $${idx++}`); values.push(input.avatar) }
    if (input.is_active !== undefined) { sets.push(`is_active = $${idx++}`); values.push(input.is_active) }
    if (input.password !== undefined) {
      sets.push(`password = $${idx++}`)
      values.push(hashPassword(input.password))
    }

    if (sets.length === 0) return this._getUserById(id, sql)

    sets.push('updated_at = NOW()')
    values.push(id)

    const [row] = await sql.unsafe(
      `UPDATE "${this.table}" SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    ) as unknown as Record<string, unknown>[]

    return row ? toUserRecord(row) : null
  }

  private async _deleteUser(id: string, sql: SqlClient): Promise<boolean> {
    await this.ensureMigrated(sql)
    const [row] = await sql.unsafe(
      `UPDATE "${this.table}" SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id`, [id],
    ) as unknown as Record<string, unknown>[]
    return !!row
  }

  private async _listUsers(sql: SqlClient, includeInactive: boolean): Promise<UserRecord[]> {
    await this.ensureMigrated(sql)
    const rows = includeInactive
      ? await sql.unsafe(`SELECT * FROM "${this.table}" ORDER BY created_at DESC`)
      : await sql.unsafe(`SELECT * FROM "${this.table}" WHERE is_active = TRUE ORDER BY created_at DESC`)
    return (rows as unknown as Record<string, unknown>[]).map(toUserRecord)
  }

  private async _login(email: string, password: string, sql: SqlClient): Promise<{ user: UserRecord; token: string } | null> {
    await this.ensureMigrated(sql)

    const [row] = await sql.unsafe(
      `SELECT * FROM "${this.table}" WHERE email = $1`, [email],
    ) as unknown as Record<string, unknown>[]

    if (!row) return null
    if (!(await verifyScrypt(password, row.password as string))) return null

    const user = toUserRecord(row)
    const token = this._generateToken(user)

    await sql.unsafe(`UPDATE "${this.table}" SET last_login_at = NOW() WHERE id = $1`, [user.id])

    return { user, token }
  }

  private async _changePassword(id: string, currentPassword: string, newPassword: string, sql: SqlClient): Promise<boolean> {
    await this.ensureMigrated(sql)

    const [row] = await sql.unsafe(
      `SELECT password FROM "${this.table}" WHERE id = $1`, [id],
    ) as unknown as Record<string, unknown>[]

    if (!row) return false
    if (!(await verifyScrypt(currentPassword, row.password as string))) return false

    const hash = hashPassword(newPassword)
    await sql.unsafe(
      `UPDATE "${this.table}" SET password = $1, updated_at = NOW() WHERE id = $2`, [hash, id],
    )

    return true
  }

  // ── Token helpers (stateless, no sql needed) ────────────────

  private _generateToken(user: UserRecord): string {
    const now = Date.now()
    return tokenEncode(
      { sub: user.id, email: user.email, role: user.role, iat: now, exp: now + this.tokenExpiry },
      this.secret,
    )
  }

  private _verifyToken(token: string): TokenPayload | null {
    return tokenDecode(token, this.secret)
  }

  private _refreshToken(token: string): string | null {
    const payload = tokenDecode(token, this.secret)
    if (!payload) return null
    const now = Date.now()
    return tokenEncode(
      { sub: payload.sub, email: payload.email, role: payload.role, iat: now, exp: now + this.tokenExpiry },
      this.secret,
    )
  }

  // ── Middleware ──────────────────────────────────────────────

  /**
   * Middleware entry point. Injects `ctx.userModule` (per-request bound API)
   * and resolves `ctx.user` from the Authorization header or `token` cookie.
   */
  async middleware(req: Request, ctx: Context, next: Handler): Promise<Response> {
    // Inject per-request bound API (captures ctx in closure — concurrency-safe)
    ctx.userModule = this.bind(ctx)

    // Resolve user from token if available
    const token = extractToken(req)
    if (token && !ctx.user) {
      try {
        const payload = tokenDecode(token, this.secret)
        if (payload) {
          const sql = getSqlFromCtx(ctx)
          const [row] = await sql.unsafe(
            `SELECT * FROM "${this.table}" WHERE id = $1`, [payload.sub],
          ) as unknown as Record<string, unknown>[]
          if (row) {
            ctx.user = toUserRecord(row) as unknown as Record<string, unknown>
          }
        }
      } catch {
        // Invalid / expired token — continue without user
      }
    }

    return next(req, ctx)
  }
}
