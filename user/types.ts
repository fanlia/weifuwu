import type { Middleware, Context } from '../types.ts'
import type { Router } from '../router.ts'
import type { PostgresClient } from '../postgres/types.ts'

export interface UserData {
  id: number
  email: string
  name: string
  role: string
  created_at: Date
  updated_at: Date
}

export interface AuthResult {
  user: Omit<UserData, 'password'>
  token: string
}

export interface OAuth2Client {
  id: number
  name: string
  clientId: string
  clientSecret: string
  redirectUris: string[]
  scopes: string
}

export interface OAuth2ServerOptions {
  server: true
}

export interface OAuthProviderConfig {
  clientId: string
  clientSecret: string
  scope?: string
  /** Custom auth URL (overrides built-in provider default). */
  authUrl?: string
  /** Custom token URL (overrides built-in provider default). */
  tokenUrl?: string
  /** Custom user info URL (overrides built-in provider default). */
  userUrl?: string
  /**
   * Custom user parser.
   * Required when any of authUrl/tokenUrl/userUrl is custom.
   * Receives the raw response from userUrl + the access token.
   */
  parseUser?: (data: any, accessToken: string) => { id: string; email: string; name: string; avatarUrl?: string }
}

export interface UserOptions {
  pg: PostgresClient
  jwtSecret: string
  table?: string
  expiresIn?: string | number
  oauth2?: OAuth2ServerOptions
  /**
   * OAuth login providers (login with GitHub/Google).
   * Registers GET /auth/:provider and GET /auth/:provider/callback routes.
   */
  oauthLogin?: {
    providers: Record<string, OAuthProviderConfig>
    /** Where to redirect after successful login (default: '/'). */
    redirectUrl?: string
  }
}

export interface UserInjected {
  user: UserData
}

export interface UserModule extends Router {
  middleware: () => Middleware<Context, Context & UserInjected>
  migrate: () => Promise<void>
  register: (data: { email: string; password: string; name: string }) => Promise<AuthResult>
  login: (data: { email: string; password: string }) => Promise<AuthResult>
  verify: (token: string) => Promise<Omit<UserData, 'password'> | null>
  registerClient: (data: { name: string; redirectUris: string[] }) => Promise<OAuth2Client>
  getClient: (clientId: string) => Promise<OAuth2Client | null>
  revokeClient: (clientId: string) => Promise<void>
  close: () => Promise<void>
}
