import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import type { Middleware, Context } from './types.ts'
import { Router } from './router.ts'
import type { PostgresClient } from './postgres/types.ts'

export interface UserOptions {
  pg: PostgresClient
  jwtSecret: string
  table?: string
  expiresIn?: string | number
}

export interface UserData {
  id: number
  email: string
  name: string
  role: string
  created_at: Date
  updated_at: Date
}

export interface UserModule {
  router: () => Router
  middleware: () => Middleware
  migrate: () => Promise<void>
  register: (data: { email: string; password: string; name: string }) => Promise<{ user: Omit<UserData, 'password'>; token: string }>
  login: (data: { email: string; password: string }) => Promise<{ user: Omit<UserData, 'password'>; token: string }>
  verify: (token: string) => Promise<Omit<UserData, 'password'> | null>
}

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

  async function migrate(): Promise<void> {
    await pg.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "${table}" (
        "id" SERIAL PRIMARY KEY,
        "email" TEXT UNIQUE NOT NULL,
        "password" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'user',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
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
    const [row] = await pg.sql`SELECT * FROM ${pg.sql(table as any)} WHERE "email" = ${email} LIMIT 1`
    return row
  }

  async function findById(id: number): Promise<any | undefined> {
    const [row] = await pg.sql`SELECT * FROM ${pg.sql(table as any)} WHERE "id" = ${id} LIMIT 1`
    return row
  }

  async function register(data: { email: string; password: string; name: string }): Promise<{ user: Omit<UserData, 'password'>; token: string }> {
    const { email, password, name } = RegisterSchema.parse(data)

    const existing = await findByEmail(email)
    if (existing) {
      const err = new Error('Email already registered')
      ;(err as any).status = 409
      throw err
    }

    const hashed = hashPassword(password)

    const [row] = await pg.sql`
      INSERT INTO ${pg.sql(table as any)} ("email", "password", "name") VALUES (${email}, ${hashed}, ${name}) RETURNING *
    `

    const userData = row as UserData
    const token = signToken(userData)
    return { user: stripPassword(userData), token }
  }

  async function login(data: { email: string; password: string }): Promise<{ user: Omit<UserData, 'password'>; token: string }> {
    const { email, password } = LoginSchema.parse(data)

    const row = await findByEmail(email)
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

    const userData = row as UserData
    const token = signToken(userData)
    return { user: stripPassword(userData), token }
  }

  async function verify(token: string): Promise<Omit<UserData, 'password'> | null> {
    try {
      const payload = jwt.verify(token, secret) as any
      const row = await findById(payload.sub)
      if (!row) return null
      return stripPassword(row)
    } catch {
      return null
    }
  }

  function middleware(): Middleware {
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
      return next(req, ctx)
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
        return Response.json(result)
      } catch (err: any) {
        if (err instanceof z.ZodError) {
          return Response.json({ error: 'Validation failed', issues: err.issues }, { status: 400 })
        }
        const status = (err as any).status ?? 500
        return Response.json({ error: err.message }, { status })
      }
    })

    return r
  }

  return { router, middleware, migrate, register, login, verify }
}
