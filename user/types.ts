import type { Middleware, Context, Closeable } from '../types.ts'
import type { Router } from '../router.ts'
import type { PostgresClient } from '../postgres/types.ts'

/** A user record from the database. */
export interface UserData {
  id: number
  email: string
  name: string
  role: string
  created_at: Date
  updated_at: Date
}

/** Result of a successful register or login. */
export interface AuthResult {
  /** User data (excluding password hash). */
  user: Omit<UserData, 'password'>
  /** Signed JWT token. */
  token: string
}

/** An OAuth2 client application registered with the server. */
export interface OAuth2Client {
  id: number
  name: string
  clientId: string
  clientSecret: string
  redirectUris: string[]
  scopes: string
}

/** Enable OAuth2 server mode (authorization code flow). */
export interface OAuth2ServerOptions {
  server: true
}

/** Configuration for an OAuth login provider (e.g. GitHub, Google). */
export interface OAuthProviderConfig {
  /** OAuth app client ID. */
  clientId: string
  /** OAuth app client secret. */
  clientSecret: string
  /** Scopes to request (default: `'openid profile email'`). */
  scope?: string
  /** Custom auth URL (overrides built-in provider default). */
  authUrl?: string
  /** Custom token URL (overrides built-in provider default). */
  tokenUrl?: string
  /** Custom user info URL (overrides built-in provider default). */
  userUrl?: string
  /**
   * Custom user parser.
   * Required when any of `authUrl`/`tokenUrl`/`userUrl` is custom.
   * Receives the raw response from `userUrl` + the access token.
   */
  parseUser?: (data: any, accessToken: string) => { id: string; email: string; name: string; avatarUrl?: string }
}

/** Options for {@link user}. */
export interface UserOptions {
  /** PostgreSQL client for user storage. Omit for DB-less token/verify/proxy auth. */
  pg?: PostgresClient
  /** Secret key for JWT signing. Required for JWT auth and login/register routes. */
  jwtSecret?: string
  /** Custom table name for users (default: `'users'`). */
  table?: string
  /** JWT expiration time (default: `'7d'`). */
  expiresIn?: string | number

  // ── DB-less auth strategies (from auth()) ────────────────────────────
  /** Static token(s) for simple bearer auth. No DB or JWT needed. */
  tokens?: string[]
  /** Custom verify function. Receives the token and request, returns user data or null. */
  verify?: (token: string, req: Request) => unknown | Promise<unknown>
  /** Proxy auth — forward request to an external auth service for validation. */
  proxy?: string | URL
  /** Custom header name for token extraction (default: `'Authorization'`). */
  header?: string
  /**
   * Function to load user data from a user ID stored in the session.
   * Called when `ctx.session.userId` is present. Only used when `pg` is not provided.
   * Return a falsy value to reject (e.g. if the user was deleted).
   * If not provided and no pg, `ctx.user` is set to `{ id: userId }`.
   */
  resolveUser?: (userId: unknown) => unknown | Promise<unknown>

  /** Enable OAuth2 server mode (authorization code flow). */
  oauth2?: OAuth2ServerOptions
  /**
   * OAuth login providers (login with GitHub/Google).
   * Registers `GET /auth/:provider` and `GET /auth/:provider/callback` routes.
   */
  oauthLogin?: {
    /** Map of provider name to config (e.g. `{ github: {...}, google: {...} }`). */
    providers: Record<string, OAuthProviderConfig>
    /** Redirect URL after successful login (default: `'/'`). */
    redirectUrl?: string
  }
}

/** The shape of `ctx.user` when the user middleware is active. */
export interface UserInjected {
  user: UserData
}

/**
 * User module returned by {@link user}. Provides auth routes, middleware, and programmatic API.
 *
 * ```ts
 * const auth = user({ pg, jwtSecret: process.env.JWT_SECRET })
 * app.use(auth.middleware())   // injects ctx.user on every request
 * app.use('/', auth)           // mounts routes: /register, /login
 * ```
 */
export interface UserModule extends Router, Closeable {
  /**
   * Strict auth middleware. Reads JWT from `Authorization: Bearer` header.
   * Returns 401 if no valid token is found.
   * Use for routes that require authentication.
   */
  middleware: () => Middleware<Context, Context & UserInjected>
  /**
   * Optional auth middleware. Reads JWT from `Authorization` header or `token` cookie.
   * Sets `ctx.user` if a valid token is present, but does **not** block unauthenticated requests.
   * Use as a global middleware when some routes are public and some are protected.
   *
   * ```ts
   * app.use(auth.middlewareOptional({ cookie: 'token' }))
   * app.get('/profile', auth.middleware(), handler)  // protected
   * app.get('/', handler)                              // public
   * ```
   */
  middlewareOptional: (opts?: { cookie?: string }) => Middleware
  /** Create the users table. */
  migrate: () => Promise<void>
  /** Register a new user. Returns user data + JWT. */
  register: (data: { email: string; password: string; name: string }) => Promise<AuthResult>
  /** Authenticate by email + password. Returns user data + JWT. */
  login: (data: { email: string; password: string }) => Promise<AuthResult>
  /** Verify a JWT and return the user data (or null if invalid). */
  verify: (token: string) => Promise<Omit<UserData, 'password'> | null>
  /** Register a new OAuth2 client application. */
  registerClient: (data: { name: string; redirectUris: string[] }) => Promise<OAuth2Client>
  /** Look up an OAuth2 client by clientId. */
  getClient: (clientId: string) => Promise<OAuth2Client | null>
  /** Revoke an OAuth2 client. */
  revokeClient: (clientId: string) => Promise<void>
  /** Close the underlying DB connection. */
  close: () => Promise<void>
}
