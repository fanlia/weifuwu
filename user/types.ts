import type { Middleware } from '../types.ts'
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

export interface UserOptions {
  pg: PostgresClient
  jwtSecret: string
  table?: string
  expiresIn?: string | number
  oauth2?: OAuth2ServerOptions
}

export interface UserModule {
  router: () => Router
  middleware: () => Middleware
  migrate: () => Promise<void>
  register: (data: { email: string; password: string; name: string }) => Promise<AuthResult>
  login: (data: { email: string; password: string }) => Promise<AuthResult>
  verify: (token: string) => Promise<Omit<UserData, 'password'> | null>
  registerClient: (data: { name: string; redirectUris: string[] }) => Promise<OAuth2Client>
  getClient: (clientId: string) => Promise<OAuth2Client | null>
  revokeClient: (clientId: string) => Promise<void>
  close: () => Promise<void>
}
