import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import type { Sql } from './vendor.ts'
import type { PostgresClient } from './postgres/types.ts'
import type { Middleware } from './types.ts'
import { Router } from './router.ts'

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
  parseUser?: (data: any, accessToken: string) => ProviderUser
}

export interface OAuthClientOptions {
  /** Postgres client (required). */
  pg: PostgresClient
  /** JWT secret — must match user() module's jwtSecret. */
  jwtSecret: string
  /** JWT expiry (default: '24h'). */
  expiresIn?: string | number
  /** Where to redirect after successful login (default: '/'). */
  redirectUrl?: string
  /** Provider configurations. */
  providers: Record<string, OAuthProviderConfig>
  /** Table name for provider-user links (default: '_auth_providers'). */
  table?: string
}

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

// ── Built-in provider presets ───────────────────────────────────────────────

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

export function oauthClient(options: OAuthClientOptions): Router {
  const {
    pg,
    jwtSecret,
    providers,
    redirectUrl = '/',
    expiresIn = '24h',
  } = options

  const providerTable = options.table ?? '_auth_providers'
  const router = new Router()

  // ── State management in session ────────────────────────────────
  // The middleware reads/writes OAuth state in ctx.session.oauthState
  // Must be placed after session() middleware.

  async function saveOAuthState(ctx: any, state: string, provider: string): Promise<void> {
    if (ctx.session) {
      ctx.session.oauthState = { state, provider }
    }
  }

  function verifyOAuthState(ctx: any, state: string, provider: string): boolean {
    const saved = ctx.session?.oauthState
    if (!saved) return false
    if (saved.state !== state || saved.provider !== provider) return false
    // Clear used state
    delete ctx.session.oauthState
    return true
  }

  // ── Database helpers ───────────────────────────────────────────

  async function ensureTable(): Promise<void> {
    await pg.sql`
      CREATE TABLE IF NOT EXISTS ${pg.sql(providerTable)} (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES "_users"(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        email TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL DEFAULT '',
        avatar_url TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(provider, provider_id)
      )
    `
    // Index for user lookup
    await pg.sql`
      CREATE INDEX IF NOT EXISTS ${pg.sql(providerTable + '_user_idx')}
      ON ${pg.sql(providerTable)}(user_id)
    `
  }

  async function findUserByProvider(provider: string, providerId: string): Promise<any | null> {
    const [row] = await pg.sql`
      SELECT * FROM ${pg.sql(providerTable)}
      WHERE provider = ${provider} AND provider_id = ${providerId}
      LIMIT 1
    `
    return row ?? null
  }

  async function findUserByEmail(email: string): Promise<any | null> {
    const [row] = await pg.sql`
      SELECT * FROM "_users" WHERE email = ${email} LIMIT 1
    `
    return row ?? null
  }

  async function createUser(email: string, name: string): Promise<any> {
    const randomPassword = crypto.randomBytes(32).toString('hex')
    const [row] = await pg.sql`
      INSERT INTO "_users" (email, password, name, role)
      VALUES (${email}, ${randomPassword}, ${name}, 'user')
      RETURNING *
    `
    return row
  }

  async function linkProvider(userId: number, provider: string, providerId: string, email: string, name: string, avatarUrl: string): Promise<void> {
    await pg.sql`
      INSERT INTO ${pg.sql(providerTable)} (user_id, provider, provider_id, email, name, avatar_url)
      VALUES (${userId}, ${provider}, ${providerId}, ${email}, ${name}, ${avatarUrl})
      ON CONFLICT (provider, provider_id) DO NOTHING
    `
  }

  async function findOrCreateUser(provider: string, providerId: string, email: string, name: string, avatarUrl: string): Promise<any> {
    // Step 1: Check if provider link exists
    const link = await findUserByProvider(provider, providerId)
    if (link) {
      const [user] = await pg.sql`SELECT * FROM "_users" WHERE id = ${link.user_id} LIMIT 1`
      return user ?? null
    }

    // Step 2: Check if email already registered
    if (email) {
      const existingUser = await findUserByEmail(email)
      if (existingUser) {
        await linkProvider(existingUser.id, provider, providerId, email, name, avatarUrl)
        return existingUser
      }
    }

    // Step 3: Create new user
    const newUser = await createUser(email || `${provider}_${providerId}@oauth.local`, name || provider)
    await linkProvider(newUser.id, provider, providerId, email, name, avatarUrl)
    return newUser
  }

  function signToken(user: any): string {
    return jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      jwtSecret,
      { expiresIn } as any,
    )
  }

  // ── Routes ─────────────────────────────────────────────────────

  // Init table on first use
  let tableReady: Promise<void> | null = null
  function ensureInit(): Promise<void> {
    if (!tableReady) tableReady = ensureTable()
    return tableReady
  }

  function getProviderMeta(providerName: string): { config: OAuthProviderConfig; meta: ProviderMeta } | null {
    const config = providers[providerName]
    if (!config) return null

    // Use custom URLs if provided, else fall back to built-in preset
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

  // GET /:provider — redirect to provider's auth page
  router.get('/:provider', async (req, ctx: any) => {
    await ensureInit()
    const providerName = ctx.params.provider
    const resolved = getProviderMeta(providerName)
    if (!resolved) {
      return Response.json({ error: `Unsupported provider: ${providerName}` }, { status: 400 })
    }
    const { config, meta } = resolved

    const state = crypto.randomUUID()
    const redirectUri = new URL(req.url)
    redirectUri.pathname = redirectUri.pathname.replace(/\/[^/]+$/, '/') + providerName + '/callback'

    // Store state in session
    await saveOAuthState(ctx, state, providerName)

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

  // GET /:provider/callback — handle OAuth callback
  router.get('/:provider/callback', async (req, ctx: any) => {
    await ensureInit()
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

    // Verify state matches session
    if (!verifyOAuthState(ctx, state, providerName)) {
      return Response.json({ error: 'Invalid state — possible CSRF attack' }, { status: 403 })
    }

    const redirectUri = url.origin + url.pathname.replace(/\/callback$/, '')

    // Exchange code for access token
    let tokenRes: Response
    try {
      tokenRes = await fetch(meta.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    } catch (err) {
      console.error(`[oauth] token exchange network error for ${providerName}:`, err)
      return Response.json({ error: 'Failed to connect to OAuth provider' }, { status: 502 })
    }

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text()
      console.error(`[oauth] token exchange failed for ${providerName}:`, errBody)
      return Response.json({ error: 'Failed to exchange authorization code' }, { status: 502 })
    }

    const tokenData = await tokenRes.json() as any
    const accessToken = tokenData.access_token
    if (!accessToken) {
      return Response.json({ error: 'No access_token in response' }, { status: 502 })
    }

    // Fetch user info from provider
    let userRes: Response
    try {
      userRes = await fetch(meta.userUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    } catch (err) {
      console.error(`[oauth] user info network error for ${providerName}:`, err)
      return Response.json({ error: 'Failed to connect to OAuth provider' }, { status: 502 })
    }

    if (!userRes.ok) {
      return Response.json({ error: 'Failed to fetch user profile' }, { status: 502 })
    }

    const userData = await userRes.json() as any
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

    // Browser redirect — attach token as query param (SPA catches it)
    const finalUrl = new URL(redirectUrl, url.origin)
    finalUrl.searchParams.set('token', token)
    return Response.redirect(finalUrl.toString(), 302)
  })

  return router
}
