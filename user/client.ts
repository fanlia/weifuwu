import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import type { Middleware, Context } from '../types.ts'
import { Router } from '../router.ts'
import { currentTraceId } from '../trace.ts'
import type { PostgresClient } from '../postgres/types.ts'
import type { UserOptions, UserData, UserModule, AuthResult, OAuth2Client, UserInjected } from './types.ts'
import { PgModule } from '../postgres/module.ts'
import { serial, text, integer, boolean, timestamptz, textArray, sql } from '../postgres/schema/index.ts'
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
    const cookies = req.headers.get('cookie')?.split(';').map(c => c.trim()).filter(Boolean) || []
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
    return jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      secret!,
      { expiresIn } as any,
    )
  }

  function stripPassword(row: any): Omit<UserData, 'password'> {
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

  async function register(data: { email: string; password: string; name: string }): Promise<AuthResult> {
    const { email, password, name } = RegisterSchema.parse(data)

    const existing = await findByEmail(email)
    if (existing) {
      const err = new Error('Email already registered')
      ;(err as any).status = 409
      throw err
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
      const err = new Error('Invalid email or password')
      ;(err as any).status = 401
      throw err
    }

    if (!verifyPassword(password, row.password)) {
      const err = new Error('Invalid email or password')
      ;(err as any).status = 401
      throw err
    }

    const userData = row as unknown as UserData
    const token = signToken(userData)
    return { user: stripPassword(userData), token }
  }

  async function verify(token: string): Promise<Omit<UserData, 'password'> | null> {
    try {
      const payload = jwt.verify(token, secret!) as any
      if (payload.token_type === 'client_credentials') return null
      if (!hasDb || !findById) return null
      const row = await findById(payload.sub)
      if (!row) return null
      return stripPassword(row)
    } catch {
      return null
    }
  }

  const headerName = options.header ?? 'Authorization'

  /**
   * Try all auth strategies in order. Returns `ctx.user` value or null.
   * Used by both middleware() (strict) and middlewareOptional() (non-blocking).
   */
  async function resolveUser(req: Request, ctx: Context): Promise<unknown> {
    // ── Strategy 1: Session-based auth ──────────────────────────────
    const sessionUserId = (ctx as any).session?.userId
    if (sessionUserId !== undefined && sessionUserId !== null) {
      if (hasDb) {
        const row = await findById(sessionUserId)
        if (row) {
          return stripPassword(row)
        }
        // User was deleted — clear stale session reference
        if (typeof (ctx as any).session?.destroy === 'function') {
          ;(ctx as any).session.destroy()
        } else {
          delete (ctx as any).session?.userId
        }
      } else if (options.resolveUser) {
        const userData = await options.resolveUser(sessionUserId)
        if (userData) {
          return userData
        }
        // User was deleted — clear stale session reference
        if (typeof (ctx as any).session?.destroy === 'function') {
          ;(ctx as any).session.destroy()
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
          try { return await proxyRes.json() } catch {}
        }
        return { id: token }
      } catch (err) {
        console.warn(`[${currentTraceId()}] user: proxy auth error: ${err}`)
        return null
      }
    }

    // ── Strategy 5: JWT-based auth (requires jwtSecret + DB) ───────
    if (secret && hasDb) {
      try {
        const payload = jwt.verify(token, secret) as any
        if (payload.token_type === 'client_credentials') return null
        const row = await findById(payload.sub)
        if (row) return stripPassword(row)
      } catch {}
      return null
    }

    return null
  }

  function middleware(): Middleware<Context, Context & UserInjected> {
    return async (req, ctx, next) => {
      const userData = await resolveUser(req, ctx)
      if (userData) {
        ctx.user = userData
        return next(req, ctx as Context & UserInjected)
      }
      return new Response('Unauthorized', {
        status: 401,
        headers: headerName.toLowerCase() === 'authorization'
          ? { 'WWW-Authenticate': 'Bearer' }
          : undefined,
      })
    }
  }

  function middlewareOptional(_opts?: { cookie?: string }): Middleware {
    return async (req, ctx, next) => {
      const userData = await resolveUser(req, ctx)
      if (userData) {
        ctx.user = userData as any
      }
      return next(req, ctx)
    }
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
      } catch (err: any) {
        if (err instanceof z.ZodError) {
          return Response.json({ error: 'Validation failed', issues: err.issues }, { status: 400 })
        }
        const status = (err as any).status ?? 500
        return Response.json({ error: err.message }, { status })
      }
    })

    r.post('/login', async (req, ctx) => {
      try {
        const body = await parseBody(req)
        const result = await login(body as any)

        if ((ctx as any).session) {
          ;(ctx as any).session.userId = result.user.id
          ;(ctx as any).session.role = result.user.role
        }

        const res = Response.json(result)
        if (!(ctx as any).session) {
          res.headers.set('Set-Cookie', `session=${result.token}; HttpOnly; SameSite=Lax; Path=/`)
        }
        return res
      } catch (err: any) {
        if (err instanceof z.ZodError) {
          return Response.json({ error: 'Validation failed', issues: err.issues }, { status: 400 })
        }
        const status = (err as any).status ?? 500
        return Response.json({ error: err.message }, { status })
      }
    })
  }

  if (oauth2) {
    r.get('/oauth/authorize', (req, ctx) => oauth2!.authorizeHandler(req, ctx))
    r.post('/oauth/consent', (req) => oauth2!.consentHandler(req))
    r.post('/oauth/token', (req) => oauth2!.tokenHandler(req))
  }

  // Register OAuth login routes (login with GitHub/Google)
  if (hasDb && options.oauthLogin) {
    registerOAuthLoginRoutes(r, {
      sql: _pg.sql,
      jwtSecret: secret,
      expiresIn,
      usersTable: table,
      providerTable: '_auth_providers',
      redirectUrl: options.oauthLogin.redirectUrl || '/',
      signToken,
      createPlaceholderUser,
      findUserById: findById,
      findUserByEmail: findByEmail,
    }, options.oauthLogin.providers)
  }

  // ── Assemble module ───────────────────────────────────────────────────
  const mod = r as UserModule
  mod.middleware = middleware
  mod.middlewareOptional = middlewareOptional
  mod.migrate = hasDb ? migrate : async () => {}
  mod.register = hasDb ? register : async () => { throw new Error('user(): pg required for register') }
  mod.login = hasDb ? login : async () => { throw new Error('user(): pg required for login') }
  mod.verify = hasDb ? verify : async () => null
  mod.registerClient = oauth2
    ? (data) => oauth2!.registerClient(data)
    : async () => { throw new Error('OAuth2 server is not enabled') }
  mod.getClient = oauth2
    ? (clientId) => oauth2!.getClient(clientId)
    : async () => { throw new Error('OAuth2 server is not enabled') }
  mod.revokeClient = oauth2
    ? (clientId) => oauth2!.revokeClient(clientId)
    : async () => { throw new Error('OAuth2 server is not enabled') }
  mod.close = hasDb ? () => base!.close() : async () => {}

  return mod
}
