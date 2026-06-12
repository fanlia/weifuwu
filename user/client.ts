import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import type { Middleware, Context } from '../types.ts'
import { Router } from '../router.ts'
import type { UserOptions, UserData, UserModule, AuthResult, OAuth2Client, UserInjected } from './types.ts'
import { PgModule } from '../postgres/module.ts'
import { pgTable, serial, text, integer, boolean, timestamptz, textArray, sql } from '../postgres/schema/index.ts'
import { createOAuth2Server } from './oauth2.ts'

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
})

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

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

export function user(options: UserOptions): UserModule {
  const table = options.table ?? '_users'
  const pg = options.pg
  const secret = options.jwtSecret
  const expiresIn = options.expiresIn ?? '24h'
  const oauth2Enabled = options.oauth2?.server ?? false

  const base = new PgModule(pg)

  const users = pg.table(table, {
    id: serial('id').primaryKey(),
    email: text('email').unique().notNull(),
    password: text('password').notNull(),
    name: text('name').notNull(),
    role: text('role').default('user'),
    created_at: timestamptz('created_at').default(sql`NOW()`),
    updated_at: timestamptz('updated_at').default(sql`NOW()`),
  })

  let oauth2: ReturnType<typeof createOAuth2Server> | null = null
  if (oauth2Enabled) {
    oauth2 = createOAuth2Server({ pg, users, jwtSecret: secret, expiresIn })
  }

  async function migrate(): Promise<void> {
    await users.create()

    if (!oauth2Enabled) return

    const clients = pgTable('_oauth2_clients', {
      id: serial('id').primaryKey(),
      name: text('name').notNull(),
      client_id: text('client_id').unique().notNull(),
      client_secret: text('client_secret').notNull(),
      redirect_uris: textArray('redirect_uris').notNull(),
      scopes: text('scopes').default(''),
      created_at: timestamptz('created_at').default(sql`NOW()`),
    })
    await clients.create(pg.sql)

    const codes = pgTable('_oauth2_codes', {
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
    await codes.create(pg.sql)

    const tokens = pgTable('_oauth2_tokens', {
      id: serial('id').primaryKey(),
      token: text('token').unique().notNull(),
      client_id: text('client_id').notNull(),
      user_id: integer('user_id').references(table, 'id'),
      scope: text('scope'),
      expires_at: timestamptz('expires_at').notNull(),
      revoked: boolean('revoked').default(false),
    })
    await tokens.create(pg.sql)
  }

  function signToken(user: UserData): string {
    return jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      secret,
      { expiresIn } as any,
    )
  }

  function stripPassword(row: any): Omit<UserData, 'password'> {
    const { password: _, ...user } = row
    return user as Omit<UserData, 'password'>
  }

  async function findByEmail(email: string): Promise<any | undefined> {
    const { data: rows } = await users.readMany({ email } as any)
    return rows[0]
  }

  async function findById(id: number): Promise<any | undefined> {
    return await users.read(id)
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
    const row = await users.insert({ email, password: hashed, name } as any)
    const userData = row as unknown as UserData
    const token = signToken(userData)
    return { user: stripPassword(userData), token }
  }

  async function login(data: { email: string; password: string }): Promise<AuthResult> {
    const { email, password } = LoginSchema.parse(data)

    const { data: rows } = await users.readMany({ email } as any)
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
      const payload = jwt.verify(token, secret) as any
      if (payload.token_type === 'client_credentials') return null
      const row = await findById(payload.sub)
      if (!row) return null
      return stripPassword(row)
    } catch {
      return null
    }
  }

  function middleware(): Middleware<Context, Context & UserInjected> {
    return async (req, ctx, next) => {
      const header = req.headers.get('Authorization')
      if (!header?.startsWith('Bearer ')) {
        return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } })
      }

      const token = header.slice(7)
      const userData = await verify(token)
      if (!userData) {
        return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } })
      }

      ctx.user = userData
      return next(req, ctx as Context & UserInjected)
    }
  }

  function router(): Router {
    const r = new Router()

    r.post('/register', async (req) => {
      try {
        const body = await req.json() as Record<string, unknown>
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

    r.post('/login', async (req) => {
      try {
        const body = await req.json() as Record<string, unknown>
        const result = await login(body as any)
        const res = Response.json(result)
        res.headers.set('Set-Cookie', `session=${result.token}; HttpOnly; SameSite=Lax; Path=/`)
        return res
      } catch (err: any) {
        if (err instanceof z.ZodError) {
          return Response.json({ error: 'Validation failed', issues: err.issues }, { status: 400 })
        }
        const status = (err as any).status ?? 500
        return Response.json({ error: err.message }, { status })
      }
    })

    if (oauth2) {
      r.get('/oauth/authorize', (req, ctx) => oauth2!.authorizeHandler(req, ctx))
      r.post('/oauth/consent', (req) => oauth2!.consentHandler(req))
      r.post('/oauth/token', (req) => oauth2!.tokenHandler(req))
    }

    return r
  }

  const r = router()
  const mod = r as UserModule
  mod.middleware = middleware
  mod.migrate = migrate
  mod.register = register
  mod.login = login
  mod.verify = verify
  mod.registerClient = oauth2
    ? (data) => oauth2!.registerClient(data)
    : async () => { throw new Error('OAuth2 server is not enabled') }
  mod.getClient = oauth2
    ? (clientId) => oauth2!.getClient(clientId)
    : async () => { throw new Error('OAuth2 server is not enabled') }
  mod.revokeClient = oauth2
    ? (clientId) => oauth2!.revokeClient(clientId)
    : async () => { throw new Error('OAuth2 server is not enabled') }
  mod.close = () => base.close()

  return mod
}
