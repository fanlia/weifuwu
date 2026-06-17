/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import jwt, { type SignOptions } from 'jsonwebtoken'
import { z } from 'zod'
import { HttpError, type Middleware, type Context } from '../types.ts'
import { Router } from '../router.ts'
import { currentTraceId } from '../trace.ts'
import type { PostgresClient } from '../postgres/types.ts'
import type { UserOptions, UserData, UserModule, AuthResult, UserInjected } from './types.ts'

// Augment Context with user property
declare module '../types.ts' {
  interface Context {
    user: UserData
  }
}

import { PgModule } from '../postgres/module.ts'
import {
  serial,
  text,
  integer,
  boolean,
  timestamptz,
  textArray,
  sql,
} from '../postgres/schema/index.ts'
import { createOAuth2Server } from './oauth2.ts'
import { registerOAuthLoginRoutes } from './oauth-login.ts'

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
})

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const CreateApiKeySchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.string()).optional(),
})

function escapeIdent(s: string): string {
  return `"${s.replace(/"/g, '""')}"`
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  const verify = scryptSync(password, salt, 64).toString('hex')
  if (hash.length !== verify.length) return false
  return timingSafeEqual(Buffer.from(hash), Buffer.from(verify))
}

function extractToken(req: Request, headerName: string, cookieName?: string): string | null {
  // Priority 1: Authorization header
  const header = req.headers.get(headerName)
  if (header) {
    if (headerName.toLowerCase() === 'authorization') {
      const parts = header.split(' ')
      if (parts[0]?.toLowerCase() === 'bearer') {
        return parts.slice(1).join(' ').trim()
      }
    }
    return header.trim()
  }
  // Priority 2: Query param (access_token) — only when using default Authorization header
  if (headerName.toLowerCase() === 'authorization') {
    const url = new URL(req.url)
    const qsToken = url.searchParams.get('access_token')
    if (qsToken) return qsToken
  }
  // Priority 3: Cookie
  if (cookieName) {
    const cookies =
      req.headers
        .get('cookie')
        ?.split(';')
        .map((c) => c.trim())
        .filter(Boolean) || []
    for (const c of cookies) {
      const eq = c.indexOf('=')
      if (eq > 0 && c.slice(0, eq) === cookieName) return c.slice(eq + 1)
    }
  }
  return null
}

/**
 * User authentication module — local register/login, JWT verification, OAuth2 server, social login.
 * Supports DB-less auth via tokens/verify/proxy options.
 *
 * ```ts
 * // Full auth with DB
 * import { user, postgres } from 'weifuwu'
 * const pg = postgres({ connection: DATABASE_URL })
 * const auth = user({ pg, jwtSecret: process.env.JWT_SECRET })
 *
 * await auth.migrate()
 * app.use(auth.middleware())   // inject ctx.user
 * app.use('/', auth)           // /register, /login
 *
 * // DB-less token auth
 * const auth = user({ tokens: ['sk-123', 'sk-456'] })
 * app.use(auth.middleware())   // injects ctx.user for valid tokens
 *
 * // DB-less custom verify
 * const auth = user({ verify: async (token) => validateToken(token) })
 * app.use(auth.middleware())
 * ```
 */
export function user(options: UserOptions): UserModule {
  const hasDb = !!options.pg
  const table = options.table ?? '_users'
  const pg = options.pg! as NonNullable<typeof options.pg>
  const secret = options.jwtSecret as string
  const expiresIn = options.expiresIn ?? '24h'
  const oauth2Enabled = options.oauth2?.server ?? false
  const apiKeysEnabled = options.apiKeys ?? false

  const base = hasDb ? new PgModule(pg) : null

  // DB-only: define users table and related helpers
  const users = hasDb
    ? (pg as NonNullable<typeof pg>).table(table, {
        id: serial('id').primaryKey(),
        email: text('email').unique().notNull(),
        password: text('password').notNull(),
        name: text('name').notNull(),
        role: text('role').default('user'),
        created_at: timestamptz('created_at').default(sql`NOW()`),
        updated_at: timestamptz('updated_at').default(sql`NOW()`),
      })
    : null

  const _pg = pg! as PostgresClient
  const _users = users!

  let oauth2: ReturnType<typeof createOAuth2Server> | null = null
  if (oauth2Enabled) {
    oauth2 = createOAuth2Server({ pg: _pg, users: _users, jwtSecret: secret!, expiresIn })
  }

  async function migrate(): Promise<void> {
    await _users.create()

    // OAuth provider table (for login with GitHub/Google)
    if (options.oauthLogin) {
      await _pg.sql.unsafe(`
        CREATE TABLE IF NOT EXISTS "_auth_providers" (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES ${escapeIdent(table)}(id) ON DELETE CASCADE,
          provider TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          email TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL DEFAULT '',
          avatar_url TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(provider, provider_id)
        )
      `)
      await _pg.sql.unsafe(`
        CREATE INDEX IF NOT EXISTS "_auth_providers_user_idx"
        ON "_auth_providers"(user_id)
      `)
    }

    // API keys table
    if (apiKeysEnabled) {
      await _pg.sql.unsafe(`
        CREATE TABLE IF NOT EXISTS "_api_keys" (
          id          SERIAL PRIMARY KEY,
          user_id     INTEGER NOT NULL REFERENCES ${escapeIdent(table)}(id) ON DELETE CASCADE,
          name        TEXT NOT NULL,
          key_prefix  TEXT NOT NULL,
          key_hash    TEXT NOT NULL,
          scopes      TEXT[] DEFAULT '{}',
          last_used_at TIMESTAMPTZ,
          expires_at  TIMESTAMPTZ,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          revoked     BOOLEAN DEFAULT false
        )
      `)
      await _pg.sql.unsafe(`
        CREATE INDEX IF NOT EXISTS "_api_keys_user_idx" ON "_api_keys"(user_id)
      `)
      await _pg.sql.unsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "_api_keys_hash_idx" ON "_api_keys"(key_hash)
      `)
    }

    if (!oauth2Enabled) return

    const clients = _pg.table('_oauth2_clients', {
      id: serial('id').primaryKey(),
      name: text('name').notNull(),
      client_id: text('client_id').unique().notNull(),
      client_secret: text('client_secret').notNull(),
      redirect_uris: textArray('redirect_uris').notNull(),
      scopes: text('scopes').default(''),
      created_at: timestamptz('created_at').default(sql`NOW()`),
    })
    await clients.create()

    const codes = _pg.table('_oauth2_codes', {
      id: serial('id').primaryKey(),
      code: text('code').unique().notNull(),
      client_id: text('client_id').notNull(),
      user_id: integer('user_id').notNull().references(table, 'id'),
      redirect_uri: text('redirect_uri').notNull(),
      code_challenge: text('code_challenge'),
      code_challenge_method: text('code_challenge_method'),
      scope: text('scope'),
      expires_at: timestamptz('expires_at').notNull(),
      used: boolean('used').default(false),
    })
    await codes.create()

    const tokens = _pg.table('_oauth2_tokens', {
      id: serial('id').primaryKey(),
      token: text('token').unique().notNull(),
      client_id: text('client_id').notNull(),
      user_id: integer('user_id').references(table, 'id'),
      scope: text('scope'),
      expires_at: timestamptz('expires_at').notNull(),
      revoked: boolean('revoked').default(false),
    })
    await tokens.create()
  }

  function signToken(user: UserData): string {
    return jwt.sign({ sub: user.id, email: user.email, role: user.role }, secret!, {
      expiresIn,
    } as SignOptions)
  }

  function stripPassword(row: any): Omit<UserData, 'password'> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...user } = row
    return user as Omit<UserData, 'password'>
  }

  async function findByEmail(email: string): Promise<any | undefined> {
    const { data: rows } = await _users.readMany({ email } as any)
    return rows[0]
  }

  async function findById(id: number): Promise<any | undefined> {
    return await _users.read(id)
  }

  async function createPlaceholderUser(email: string, name: string): Promise<any> {
    const randomPassword = randomBytes(32).toString('hex')
    const row = await _users.insert({ email, password: randomPassword, name } as any)
    return row as any
  }

  async function register(data: {
    email: string
    password: string
    name: string
  }): Promise<AuthResult> {
    const { email, password, name } = RegisterSchema.parse(data)

    const existing = await findByEmail(email)
    if (existing) {
      throw new HttpError('Email already registered', 409)
    }

    const hashed = hashPassword(password)
    const row = await _users.insert({ email, password: hashed, name } as any)
    const userData = row as unknown as UserData
    const token = signToken(userData)
    return { user: stripPassword(userData), token }
  }

  async function login(data: { email: string; password: string }): Promise<AuthResult> {
    const { email, password } = LoginSchema.parse(data)

    const { data: rows } = await _users.readMany({ email } as any)
    const row = rows[0]
    if (!row) {
      throw new HttpError('Invalid email or password', 401)
    }

    if (!verifyPassword(password, row.password)) {
      throw new HttpError('Invalid email or password', 401)
    }

    const userData = row as unknown as UserData
    const token = signToken(userData)
    return { user: stripPassword(userData), token }
  }

  async function verify(token: string): Promise<Omit<UserData, 'password'> | null> {
    try {
      const payload = jwt.verify(token, secret!) as {
        sub: string
        email?: string
        role?: string
        token_type?: string
      }
      if (payload.token_type === 'client_credentials') return null
      if (!hasDb || !findById) return null
      const row = await findById(Number(payload.sub))
      if (!row) return null
      return stripPassword(row)
    } catch {
      return null
    }
  }

  // ── API Key management ────────────────────────────────────────────

  function hashApiKey(key: string): string {
    return createHash('sha256').update(key).digest('hex')
  }

  function generateApiKey(): string {
    const random = randomBytes(32).toString('hex')
    return `sk_live_${random}`
  }

  async function createApiKey(
    userId: number,
    name: string,
    scopes?: string[],
  ): Promise<{ id: number; key: string }> {
    if (!hasDb) throw new Error('user(): pg required for API key management')

    const key = generateApiKey()
    const keyHash = hashApiKey(key)
    const prefix = key.slice(0, 12) + '...' + key.slice(-4)

    const [row] = (await _pg.sql.unsafe(
      `INSERT INTO "_api_keys" (user_id, name, key_prefix, key_hash, scopes)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, name, prefix, keyHash, scopes ?? []],
    )) as { id: number }[]

    return { id: row.id, key }
  }

  async function listApiKeys(userId: number): Promise<import('./types.ts').ApiKeyInfo[]> {
    if (!hasDb) return []
    const rows = (await _pg.sql.unsafe(
      `SELECT id, name, key_prefix, scopes, last_used_at, created_at, revoked
       FROM "_api_keys" WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    )) as any[]

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      prefix: r.key_prefix as string,
      scopes: Array.isArray(r.scopes) ? r.scopes : [],
      last_used_at: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
      created_at: new Date(r.created_at).toISOString(),
      revoked: !!r.revoked,
    }))
  }

  async function revokeApiKey(userId: number, keyId: number): Promise<void> {
    if (!hasDb) throw new Error('user(): pg required for API key management')
    await _pg.sql.unsafe(`UPDATE "_api_keys" SET revoked = true WHERE id = $1 AND user_id = $2`, [
      keyId,
      userId,
    ])
  }

  async function verifyApiKey(key: string): Promise<{ userId: number; scopes: string[] } | null> {
    if (!hasDb || !apiKeysEnabled) return null
    const keyHash = hashApiKey(key)
    const [row] = (await _pg.sql.unsafe(
      `SELECT id, user_id, scopes, revoked, expires_at
       FROM "_api_keys" WHERE key_hash = $1 LIMIT 1`,
      [keyHash],
    )) as any[] | undefined[]

    if (!row) return null
    if (row.revoked) return null
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null

    // Update last_used_at (best-effort)
    await _pg.sql
      .unsafe(
        `UPDATE "_api_keys" SET last_used_at = NOW() WHERE id = $1 AND last_used_at IS NULL OR last_used_at < NOW() - interval '1 minute'`,
        [row.id],
      )
      .catch(() => {})

    return {
      userId: row.user_id,
      scopes: Array.isArray(row.scopes) ? row.scopes : [],
    }
  }

  // ── Strategy: API Key auth (inserted into resolveUser) ────────────

  async function tryApiKeyAuth(
    token: string,
  ): Promise<{ userId: number; scopes: string[] } | null> {
    if (!apiKeysEnabled || !hasDb) return null
    if (!token.startsWith('sk_')) return null
    return verifyApiKey(token)
  }

  const headerName = options.header ?? 'Authorization'

  /**
   * Try all auth strategies in order. Returns `ctx.user` value or null.
   * Used by both middleware() (strict) and middlewareOptional() (non-blocking).
   */
  async function resolveUser(req: Request, ctx: Context): Promise<unknown> {
    // Skip if already resolved (nested middleware calls)
    const _ctx = ctx as Record<string, unknown>
    if (_ctx.user) return _ctx.user

    const s = ctx as Context & { session?: { userId?: number; destroy?: () => void } }

    // ── Strategy 1: Session-based auth ──────────────────────────────
    const sessionUserId = s.session?.userId
    if (sessionUserId !== undefined && sessionUserId !== null) {
      if (hasDb) {
        const row = await findById(sessionUserId)
        if (row) {
          return stripPassword(row)
        }
        // User was deleted — clear stale session reference
        if (typeof s.session?.destroy === 'function') {
          s.session.destroy()
        } else if (s.session) {
          delete s.session.userId
        }
      } else if (options.resolveUser) {
        const userData = await options.resolveUser(sessionUserId)
        if (userData) {
          return userData
        }
        // User was deleted — clear stale session reference
        if (typeof s.session?.destroy === 'function') {
          s.session.destroy()
        }
        console.warn(`[${currentTraceId()}] user: session userId ${sessionUserId} resolved to null`)
      } else {
        // DB-less, no resolveUser: trust the session
        return { id: sessionUserId }
      }
    }

    // Extract token from header / query / cookie
    const token = extractToken(req, headerName)
    if (!token) return null

    // ── Strategy 2: Static tokens ──────────────────────────────────
    if (options.tokens?.length) {
      if (options.tokens.includes(token)) {
        return { id: token }
      }
      console.warn(`[${currentTraceId()}] user: invalid static token`)
      return null
    }

    // ── Strategy 3: Custom verify ──────────────────────────────────
    if (options.verify) {
      const result = await options.verify(token, req)
      if (!result) {
        console.warn(`[${currentTraceId()}] user: verify failed for token`)
        return null
      }
      return result
    }

    // ── Strategy 4: Proxy auth ─────────────────────────────────────
    if (options.proxy) {
      let proxyUrl: URL
      try {
        proxyUrl = typeof options.proxy === 'string' ? new URL(options.proxy) : options.proxy
      } catch {
        return null
      }

      const proxyHeaders: Record<string, string> = {}
      proxyHeaders[headerName] = req.headers.get(headerName) ?? `Bearer ${token}`

      for (const name of ['x-forwarded-for', 'x-real-ip', 'user-agent', 'content-type']) {
        const v = req.headers.get(name)
        if (v) proxyHeaders[name] = v
      }

      try {
        const proxyRes = await fetch(proxyUrl.href, { headers: proxyHeaders })
        if (proxyRes.status >= 400) {
          console.warn(`[${currentTraceId()}] user: proxy auth rejected (${proxyRes.status})`)
          return null
        }
        const ct = proxyRes.headers.get('content-type')
        if (ct?.includes('application/json')) {
          try {
            return await proxyRes.json()
          } catch {}
        }
        return { id: token }
      } catch (err) {
        console.warn(`[${currentTraceId()}] user: proxy auth error: ${err}`)
        return null
      }
    }

    // ── Strategy 5: API Key auth (sk_ prefix) ──────────────────────
    if (token.startsWith('sk_')) {
      const result = await tryApiKeyAuth(token)
      if (result) {
        // Return user data for API key auth
        if (hasDb) {
          const row = await findById(result.userId)
          if (row) return { ...stripPassword(row), _apiKeyScopes: result.scopes }
        }
        return { id: result.userId, _apiKeyScopes: result.scopes }
      }
      return null
    }

    // ── Strategy 6: JWT-based auth (requires jwtSecret + DB) ───────
    if (secret && hasDb) {
      try {
        const payload = jwt.verify(token, secret) as {
          sub: string
          email?: string
          role?: string
          token_type?: string
        }
        if (payload.token_type === 'client_credentials') return null
        const row = await findById(Number(payload.sub))
        if (row) return stripPassword(row)
      } catch {}
      return null
    }

    return null
  }

  function middleware(): Middleware<Context, Context & UserInjected> {
    const mw: Middleware<Context, Context & UserInjected> = async (req, ctx, next) => {
      const userData = await resolveUser(req, ctx)
      if (userData) {
        ctx.user = userData as UserData
        return next(req, ctx as Context & UserInjected)
      }
      return new Response('Unauthorized', {
        status: 401,
        headers:
          headerName.toLowerCase() === 'authorization'
            ? { 'WWW-Authenticate': 'Bearer' }
            : undefined,
      })
    }
    mw.__meta = { injects: ['user'], depends: [] }
    return mw
  }

  function middlewareOptional(_opts?: {
    cookie?: string
  }): Middleware<Context, Context & UserInjected> {
    const mw: Middleware<Context, Context & UserInjected> = async (req, ctx, next) => {
      const userData = await resolveUser(req, ctx)
      if (userData) {
        ;(ctx as Context & UserInjected).user = userData as UserData
      }
      return next(req, ctx as Context & UserInjected)
    }
    mw.__meta = { injects: ['user'], depends: [] }
    return mw
  }

  async function parseBody(req: Request): Promise<Record<string, unknown>> {
    const ct = req.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      return req.json() as Promise<Record<string, unknown>>
    }
    const form = await req.formData()
    const obj: Record<string, unknown> = {}
    for (const [key, val] of form) {
      obj[key] = val
    }
    return obj
  }

  // ── Router (only when DB is available) ───────────────────────────────
  const r = new Router()

  if (hasDb) {
    r.post('/register', async (req) => {
      try {
        const body = await parseBody(req)
        const result = await register(body as any)
        return Response.json(result, { status: 201 })
      } catch (err: unknown) {
        if (err instanceof z.ZodError) {
          return Response.json({ error: 'Validation failed', issues: err.issues }, { status: 400 })
        }
        const status = err instanceof HttpError ? err.status : 500
        const message = err instanceof Error ? err.message : String(err)
        return Response.json({ error: message }, { status })
      }
    })

    r.post('/login', async (req, ctx) => {
      try {
        const body = await parseBody(req)
        const result = await login(body as any)
        const s = ctx as Context & { session?: { userId?: number; role?: string } }

        if (s.session) {
          s.session.userId = result.user.id
          s.session.role = result.user.role
        }

        const res = Response.json(result)
        if (!s.session) {
          res.headers.set('Set-Cookie', `session=${result.token}; HttpOnly; SameSite=Lax; Path=/`)
        }
        return res
      } catch (err: unknown) {
        if (err instanceof z.ZodError) {
          return Response.json({ error: 'Validation failed', issues: err.issues }, { status: 400 })
        }
        const status = err instanceof HttpError ? err.status : 500
        const message = err instanceof Error ? err.message : String(err)
        return Response.json({ error: message }, { status })
      }
    })
  }

  // API Key management routes (require auth)
  if (apiKeysEnabled) {
    r.get('/api-keys', middleware(), async (_req, ctx) => {
      const keys = await listApiKeys((ctx as Context & UserInjected).user.id)
      return Response.json(keys)
    })

    r.post('/api-keys', middleware(), async (req, ctx) => {
      try {
        const body = await parseBody(req)
        const { name, scopes } = CreateApiKeySchema.parse(body)
        const result = await createApiKey((ctx as Context & UserInjected).user.id, name, scopes)
        return Response.json(result, { status: 201 })
      } catch (err: unknown) {
        if (err instanceof z.ZodError) {
          return Response.json({ error: 'Validation failed', issues: err.issues }, { status: 400 })
        }
        const message = err instanceof Error ? err.message : String(err)
        return Response.json({ error: message }, { status: 500 })
      }
    })

    r.delete('/api-keys/:id', middleware(), async (req, ctx) => {
      const keyId = parseInt(ctx.params.id, 10)
      if (isNaN(keyId)) {
        return Response.json({ error: 'Invalid key ID' }, { status: 400 })
      }
      await revokeApiKey((ctx as Context & UserInjected).user.id, keyId)
      return Response.json({ ok: true })
    })
  }

  if (oauth2) {
    r.get('/oauth/authorize', (req, ctx) => oauth2!.authorizeHandler(req, ctx))
    r.post('/oauth/consent', (req) => oauth2!.consentHandler(req))
    r.post('/oauth/token', (req) => oauth2!.tokenHandler(req))
  }

  // Register OAuth login routes (login with GitHub/Google)
  if (hasDb && options.oauthLogin) {
    registerOAuthLoginRoutes(
      r,
      {
        sql: _pg.sql,
        jwtSecret: secret,
        expiresIn,
        usersTable: table,
        providerTable: '_auth_providers',
        redirectUrl: options.oauthLogin.redirectUrl || '/',
        signToken: signToken as unknown as (user: Record<string, unknown>) => string,
        createPlaceholderUser,
        findUserById: findById,
        findUserByEmail: findByEmail,
      },
      options.oauthLogin.providers,
    )
  }

  // ── Assemble module ───────────────────────────────────────────────────
  const mod = r as UserModule
  mod.middleware = middleware
  mod.middlewareOptional = middlewareOptional
  mod.migrate = hasDb ? migrate : async () => {}
  mod.register = hasDb
    ? register
    : async () => {
        throw new Error('user(): pg required for register')
      }
  mod.login = hasDb
    ? login
    : async () => {
        throw new Error('user(): pg required for login')
      }
  mod.verify = hasDb ? verify : async () => null
  mod.registerClient = oauth2
    ? (data) => oauth2!.registerClient(data)
    : async () => {
        throw new Error('OAuth2 server is not enabled')
      }
  mod.getClient = oauth2
    ? (clientId) => oauth2!.getClient(clientId)
    : async () => {
        throw new Error('OAuth2 server is not enabled')
      }
  mod.revokeClient = oauth2
    ? (clientId) => oauth2!.revokeClient(clientId)
    : async () => {
        throw new Error('OAuth2 server is not enabled')
      }
  mod.createApiKey =
    hasDb && apiKeysEnabled
      ? createApiKey
      : async () => {
          throw new Error(
            'API key management is not enabled. Pass apiKeys: true in user() options.',
          )
        }
  mod.listApiKeys =
    hasDb && apiKeysEnabled
      ? listApiKeys
      : async () => {
          throw new Error(
            'API key management is not enabled. Pass apiKeys: true in user() options.',
          )
        }
  mod.revokeApiKey =
    hasDb && apiKeysEnabled
      ? revokeApiKey
      : async () => {
          throw new Error(
            'API key management is not enabled. Pass apiKeys: true in user() options.',
          )
        }
  mod.close = hasDb ? () => base!.close() : async () => {}

  return mod
}
