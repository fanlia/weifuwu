import type { Context, Middleware } from '../types.ts'

declare module '../types.ts' {
  interface Context {
    /** User module instance for downstream CRUD and auth operations. */
    userModule: import('./types.ts').UserModuleAPI
  }
}

/** User record stored in the database. Password field is never exposed. */
export interface UserRecord {
  id: string
  email: string
  name: string
  role: string
  avatar?: string
  is_active: boolean
  created_at: Date
  updated_at: Date
  last_login_at?: Date
}

export interface CreateUserInput {
  email: string
  name: string
  password: string
  role?: string
  avatar?: string
  is_active?: boolean
}

export interface UpdateUserInput {
  name?: string
  email?: string
  password?: string
  role?: string
  avatar?: string
  is_active?: boolean
}

/** JWT-like HMAC token payload. */
export interface TokenPayload {
  sub: string
  email: string
  role: string
  iat: number
  exp: number
}

export interface UserModuleOptions {
  /** HMAC secret for signing tokens (default: process.env.JWT_SECRET). */
  secret?: string
  /** Token expiry in ms (default: 7 days). */
  tokenExpiry?: number
  /** PostgreSQL table name (default: 'users'). */
  table?: string
}

/**
 * Per-request user module API injected via `ctx.userModule`.
 * Each method is already bound to the request's SQL context,
 * so callers never need to pass `ctx`.
 */
export interface UserModuleAPI {
  /** Register a new user. Returns user + signed token. */
  register(input: CreateUserInput): Promise<{ user: UserRecord; token: string }>

  /** Create a user directly (no token). Throws if email exists. */
  createUser(input: CreateUserInput): Promise<UserRecord>

  /** Authenticate with email + password. Returns user + token or null. */
  login(email: string, password: string): Promise<{ user: UserRecord; token: string } | null>

  /** Lookup user by primary key. */
  getUserById(id: string): Promise<UserRecord | null>

  /** Lookup user by email. */
  getUserByEmail(email: string): Promise<UserRecord | null>

  /** Update user fields. Returns updated record or null if not found. */
  updateUser(id: string, input: Partial<UpdateUserInput>): Promise<UserRecord | null>

  /** Soft-delete (deactivate) a user. Returns false if not found. */
  deleteUser(id: string): Promise<boolean>

  /** List users. Defaults to active only; pass true to include deactivated. */
  listUsers(includeInactive?: boolean): Promise<UserRecord[]>

  /** Change password — verifies currentPassword before updating. */
  changePassword(id: string, currentPassword: string, newPassword: string): Promise<boolean>

  /** Verify a plaintext password against a stored scrypt hash. */
  verifyPassword(password: string, hash: string): Promise<boolean>

  /** Generate a signed HMAC token for a user. */
  generateToken(user: UserRecord): Promise<string>

  /** Verify and decode a token. Returns payload or null if expired/invalid. */
  verifyToken(token: string): Promise<TokenPayload | null>

  /** Re-issue a token with a fresh expiry. Returns null if token is invalid. */
  refreshToken(token: string): Promise<string | null>
}

/**
 * Middleware factory: returns a middleware that checks `ctx.user.role`.
 *
 * ```ts
 * app.get('/admin', requireRole('admin'), handler)
 * ```
 */
export function requireRole(...roles: string[]): Middleware {
  return (req, ctx, next) => {
    if (!ctx.user) {
      return new Response('Unauthorized', { status: 401 })
    }
    const userRole = (ctx.user as Record<string, unknown>).role as string | undefined
    if (!userRole || !roles.includes(userRole)) {
      return new Response('Forbidden', { status: 403 })
    }
    return next(req, ctx)
  }
}
