/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import crypto from 'node:crypto'
import type { SqlClient } from '../vendor.ts'
import type { Router } from '../router.ts'
import type { OAuthProviderConfig } from './types.ts'

// ── Built-in provider presets ───────────────────────────────────────────────

interface ProviderMeta {
  authUrl: string
  tokenUrl: string
  userUrl: string
  scope: string
  parseUser: (data: any, accessToken: string) => ProviderUser
}

interface ProviderUser {
  id: string
  email: string
  name: string
  avatarUrl?: string
}

const BUILTIN_PROVIDERS: Record<string, ProviderMeta> = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scope: 'openid email profile',
    parseUser: (data: any): ProviderUser => ({
      id: data.id,
      email: data.email,
      name: data.name,
      avatarUrl: data.picture,
    }),
  },
  github: {
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userUrl: 'https://api.github.com/user',
    scope: 'read:user user:email',
    parseUser: (data: any): ProviderUser => ({
      id: String(data.id),
      email: data.email ?? '',
      name: data.name ?? data.login,
      avatarUrl: data.avatar_url,
    }),
  },
}

// ── Internal deps ───────────────────────────────────────────────────────────

interface OAuthLoginDeps {
  sql: SqlClient
  jwtSecret: string
  expiresIn: string | number
  usersTable: string
  /** Table for provider-user link, derived from usersTable. */
  providerTable: string
  redirectUrl: string
  signToken: (user: any) => string
  /** Create a placeholder user for OAuth login (no password). */
  createPlaceholderUser: (email: string, name: string) => Promise<any>
  /** Find user by internal ID. */
  findUserById: (id: number) => Promise<any | undefined>
  /** Find user by email. */
  findUserByEmail: (email: string) => Promise<any | undefined>
}

// ── Route registration ──────────────────────────────────────────────────────

export function registerOAuthLoginRoutes(
  router: Router,
  deps: OAuthLoginDeps,
  providers: Record<string, OAuthProviderConfig>,
): void {
  const { sql, providerTable, signToken, redirectUrl } = deps

  let tableReady: Promise<void> | null = null
  async function ensureTable(): Promise<void> {
    if (tableReady) return tableReady
    tableReady = (async () => {
      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS ${escapeIdent(providerTable)} (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES ${escapeIdent(deps.usersTable)}(id) ON DELETE CASCADE,
          provider TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          email TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL DEFAULT '',
          avatar_url TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(provider, provider_id)
        )
      `)
      await sql.unsafe(`
        CREATE INDEX IF NOT EXISTS ${escapeIdent(providerTable + '_user_idx')}
        ON ${escapeIdent(providerTable)}(user_id)
      `)
    })()
    return tableReady
  }

  async function findUserByProvider(provider: string, providerId: string): Promise<any | null> {
    const [row] = await sql.unsafe(
      `SELECT * FROM ${escapeIdent(providerTable)} WHERE provider = $1 AND provider_id = $2 LIMIT 1`,
      [provider, providerId],
    )
    return row ?? null
  }

  async function linkProvider(
    userId: number,
    provider: string,
    providerId: string,
    email: string,
    name: string,
    avatarUrl: string,
  ): Promise<void> {
    await sql.unsafe(
      `INSERT INTO ${escapeIdent(providerTable)} (user_id, provider, provider_id, email, name, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (provider, provider_id) DO NOTHING`,
      [userId, provider, providerId, email, name, avatarUrl],
    )
  }

  async function findOrCreateUser(
    provider: string,
    providerId: string,
    email: string,
    name: string,
    avatarUrl: string,
  ): Promise<any> {
    // Step 1: Check if provider link exists
    const link = await findUserByProvider(provider, providerId)
    if (link) {
      const user = await deps.findUserById(link.user_id)
      if (user) return user
    }

    // Step 2: Check if email already registered
    if (email) {
      const existingUser = await deps.findUserByEmail(email)
      if (existingUser) {
        await linkProvider(existingUser.id, provider, providerId, email, name, avatarUrl)
        return existingUser
      }
    }

    // Step 3: Create new user
    const newUser = await deps.createPlaceholderUser(
      email || `${provider}_${providerId}@oauth.local`,
      name || provider,
    )
    await linkProvider(newUser.id, provider, providerId, email, name, avatarUrl)
    return newUser
  }

  function getProviderMeta(
    providerName: string,
  ): { config: OAuthProviderConfig; meta: ProviderMeta } | null {
    const config = providers[providerName]
    if (!config) return null

    const builtin = BUILTIN_PROVIDERS[providerName]
    const parseUser = config.parseUser ?? builtin?.parseUser
    if (!parseUser) return null

    const meta: ProviderMeta = {
      authUrl: config.authUrl ?? builtin?.authUrl ?? '',
      tokenUrl: config.tokenUrl ?? builtin?.tokenUrl ?? '',
      userUrl: config.userUrl ?? builtin?.userUrl ?? '',
      scope: config.scope ?? builtin?.scope ?? 'openid',
      parseUser,
    }

    if (!meta.authUrl || !meta.tokenUrl || !meta.userUrl) return null
    return { config, meta }
  }

  // ── Routes ──

  // GET /auth/:provider — redirect to provider's auth page
  router.get('/auth/:provider', async (req, ctx: any) => {
    await ensureTable()
    const providerName = ctx.params.provider
    const resolved = getProviderMeta(providerName)
    if (!resolved) {
      return Response.json({ error: `Unsupported provider: ${providerName}` }, { status: 400 })
    }
    const { config, meta } = resolved

    const state = crypto.randomUUID()
    const redirectUri = new URL(req.url)
    redirectUri.pathname =
      redirectUri.pathname.replace(/\/[^/]+$/, '/') + providerName + '/callback'

    // Store state in session for CSRF protection
    if (ctx.session) {
      ctx.session.oauthState = { state, provider: providerName }
    }

    const scope = config.scope ?? meta.scope
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri.origin + redirectUri.pathname,
      response_type: 'code',
      scope,
      state,
      access_type: 'offline',
      prompt: 'consent',
    })

    return Response.redirect(`${meta.authUrl}?${params.toString()}`, 302)
  })

  // GET /auth/:provider/callback — handle OAuth callback
  router.get('/auth/:provider/callback', async (req, ctx: any) => {
    const providerName = ctx.params.provider
    const resolved = getProviderMeta(providerName)
    if (!resolved) {
      return Response.json({ error: `Unsupported provider: ${providerName}` }, { status: 400 })
    }
    const { config, meta } = resolved

    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')

    if (!code || !state) {
      return Response.json({ error: 'Missing code or state parameter' }, { status: 400 })
    }

    // Verify state matches session (CSRF protection)
    const savedState = ctx.session?.oauthState
    if (!savedState || savedState.state !== state || savedState.provider !== providerName) {
      return Response.json({ error: 'Invalid state — possible CSRF attack' }, { status: 403 })
    }
    if (ctx.session) delete ctx.session.oauthState

    const redirectUri = url.origin + url.pathname.replace(/\/callback$/, '')

    // Exchange code for access token
    let tokenRes: Response
    try {
      tokenRes = await fetch(meta.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      })
    } catch (err) {
      console.error(
        `[oauth] token exchange network error for ${providerName}:`,
        (err as Error).message,
      )
      return Response.json({ error: 'Failed to connect to OAuth provider' }, { status: 502 })
    }

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text()
      console.error(`[oauth] token exchange failed for ${providerName}:`, errBody)
      return Response.json({ error: 'Failed to exchange authorization code' }, { status: 502 })
    }

    const tokenData = (await tokenRes.json()) as any
    const accessToken = tokenData.access_token
    if (!accessToken) {
      return Response.json({ error: 'No access_token in response' }, { status: 502 })
    }

    // Fetch user info from provider
    let userRes: Response
    try {
      userRes = await fetch(meta.userUrl, { headers: { Authorization: 'Bearer ' + accessToken } })
    } catch (err) {
      console.error(
        '[oauth] user info network error for ' + providerName + ':',
        (err as Error).message,
      )
      return Response.json({ error: 'Failed to connect to OAuth provider' }, { status: 502 })
    }

    if (!userRes.ok) {
      return Response.json({ error: 'Failed to fetch user profile' }, { status: 502 })
    }

    const userData = (await userRes.json()) as any
    const providerUser = meta.parseUser(userData, accessToken)

    // Find or create user
    const user = await findOrCreateUser(
      providerName,
      providerUser.id,
      providerUser.email,
      providerUser.name,
      providerUser.avatarUrl ?? '',
    )

    if (!user) {
      return Response.json({ error: 'Failed to create/link user' }, { status: 500 })
    }

    // Sign JWT
    const token = signToken(user)

    // Create session if session middleware is present
    if (ctx.session) {
      ctx.session.userId = user.id
      ctx.session.role = user.role
    }

    // Redirect with token (or return JSON for API clients)
    const accept = req.headers.get('accept') ?? ''
    if (accept.includes('application/json')) {
      return Response.json({
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      })
    }

    // Browser redirect — attach token as query param
    const finalUrl = new URL(redirectUrl, url.origin)
    finalUrl.searchParams.set('token', token)
    return Response.redirect(finalUrl.toString(), 302)
  })
}

// ── Helper ──

function escapeIdent(s: string): string {
  return `"${s.replace(/"/g, '""')}"`
}
