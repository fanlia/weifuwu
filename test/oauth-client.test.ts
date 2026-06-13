import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../router.ts'
import { oauthClient } from '../oauth-client.ts'
import { serve } from '../serve.ts'
import { postgres } from '../postgres/index.ts'

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

describe('oauthClient', { skip: !DATABASE_URL }, () => {
  let pg: ReturnType<typeof postgres>
  let mockServer: { stop: () => Promise<void>; port: number }
  let mockUrl: string

  // ── Mock OAuth provider server ─────────────────────────────────
  // Simulates Google/GitHub OAuth endpoints

  const mockUsers: Record<string, any> = {
    'google-123': { id: '123', email: 'alice@gmail.com', name: 'Alice', picture: 'https://example.com/avatar.png' },
    'github-456': { id: 456, login: 'bob', email: 'bob@github.com', name: 'Bob', avatar_url: 'https://example.com/bob.png' },
  }

  // Generate deterministic codes for testing
  const codeMap = new Map<string, string>() // code → userKey

  function mockHandler(req: Request): Promise<Response> | Response {
    const url = new URL(req.url)

    // Token endpoint
    if (url.pathname === '/oauth/token' && req.method === 'POST') {
      return (async () => {
        const raw = await req.text()
        let body: any
        try { body = JSON.parse(raw) } catch { body = {} }
        const code = body.code
        const userKey = code ? codeMap.get(code) : undefined
        if (!userKey) return Response.json({ error: 'invalid_code' }, { status: 400 })
        const [provider, userId] = userKey.split('-')
        return Response.json({
          access_token: `token_${provider}_${userId}`,
          token_type: 'bearer',
        })
      })()
    }

    // User info endpoint — returns provider-specific format
    if (url.pathname === '/oauth/userinfo') {
      return (async () => {
        const auth = req.headers.get('authorization') ?? ''
        const token = auth.replace('Bearer ', '')
        const parts = token.split('_')
        if (parts.length < 3) return Response.json({ error: 'invalid_token' }, { status: 401 })
        // Token format: token_{provider}_{userId}
        const provider = parts[1]
        const userId = parts[2]
        const userKey = `${provider}-${userId}`
        const user = mockUsers[userKey]
        if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 })

        // Return in provider-specific format
        if (provider === 'google') {
          return Response.json({ id: user.id, email: user.email, name: user.name, picture: user.picture })
        }
        return Response.json({ id: user.id, login: user.login, email: user.email, name: user.name, avatar_url: user.avatar_url })
      })()
    }

    return new Response('Not Found', { status: 404 })
  }

  before(async () => {
    pg = postgres({ connection: DATABASE_URL })
    // Ensure _users table exists
    await pg.sql`
      CREATE TABLE IF NOT EXISTS "_users" (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
    // Start mock OAuth server
    const server = serve(mockHandler, { port: 0, shutdown: false })
    await server.ready
    mockServer = server as any
    mockUrl = `http://localhost:${server.port}`
  })

  after(async () => {
    if (mockServer) await mockServer.stop()
    await pg.sql`DROP TABLE IF EXISTS "_auth_providers"`
    await pg.sql`DROP TABLE IF EXISTS "_users"`
    await pg.close()
  })

  // ── Helper: create test app with mock providers ────────────────

  function createApp() {
    const app = new Router()

    // Session middleware for OAuth state storage
    app.use((req: any, ctx: any, next: any) => {
      ctx.session = {}
      ctx.sessionId = 'test-session'
      return next(req, ctx)
    })

    const client = oauthClient({
      pg: pg as any,
      jwtSecret: 'test-jwt-secret',
      redirectUrl: '/dashboard',
      providers: {
        google: {
          clientId: 'mock-client-id',
          clientSecret: 'mock-client-secret',
          authUrl: `${mockUrl}/oauth/authorize`,
          tokenUrl: `${mockUrl}/oauth/token`,
          userUrl: `${mockUrl}/oauth/userinfo`,
          parseUser: (data: any) => ({
            id: data.id,
            email: data.email,
            name: data.name,
            avatarUrl: data.picture,
          }),
        },
        github: {
          clientId: 'mock-github-id',
          clientSecret: 'mock-github-secret',
          authUrl: `${mockUrl}/oauth/authorize`,
          tokenUrl: `${mockUrl}/oauth/token`,
          userUrl: `${mockUrl}/oauth/userinfo`,
          parseUser: (data: any) => ({
            id: String(data.id),
            email: data.email ?? '',
            name: data.name ?? data.login,
            avatarUrl: data.avatar_url,
          }),
        },
      },
    })

    app.use('/auth', client)

    // Route to check login status
    app.get('/me', (req: any, ctx: any) => {
      return Response.json({
        userId: ctx.session?.userId,
        role: ctx.session?.role,
      })
    })

    return app
  }

  // ── Tests ──────────────────────────────────────────────────────

  it('returns 400 for unknown provider', async () => {
    const app = createApp()
    const res = await app.handler()(
      new Request('http://localhost/auth/unknown'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 400)
    const body = await res.json() as any
    assert.ok(body.error.includes('unknown'))
  })

  it('redirects to provider auth URL with state', async () => {
    const app = createApp()
    const res = await app.handler()(
      new Request('http://localhost/auth/google'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 302)
    const location = res.headers.get('location')!
    assert.ok(location.startsWith(`${mockUrl}/oauth/authorize`))
    assert.ok(location.includes('state='))
    assert.ok(location.includes('client_id=mock-client-id'))
  })

  it('handles missing code or state in callback', async () => {
    const app = createApp()
    const res = await app.handler()(
      new Request('http://localhost/auth/google/callback'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 400)
  })

  it('rejects invalid state (CSRF protection)', async () => {
    const app = createApp()
    const res = await app.handler()(
      new Request('http://localhost/auth/google/callback?code=xxx&state=bad-state'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 403, 'invalid state must be rejected')
  })

  it('complete OAuth flow: user created and session set', async () => {
    const app = new Router()
    let sessionStore: any = {}

    app.use((req: any, ctx: any, next: any) => {
      ctx.session = sessionStore
      ctx.sessionId = 'test-session'
      return next(req, ctx)
    })

    const client = oauthClient({
      pg: pg as any,
      jwtSecret: 'test-jwt-secret',
      redirectUrl: '/dashboard',
      providers: {
        google: {
          clientId: 'mock-client-id',
          clientSecret: 'mock-client-secret',
          authUrl: `${mockUrl}/oauth/authorize`,
          tokenUrl: `${mockUrl}/oauth/token`,
          userUrl: `${mockUrl}/oauth/userinfo`,
          parseUser: (data: any) => ({
            id: data.id,
            email: data.email,
            name: data.name,
            avatarUrl: data.picture,
          }),
        },
      },
    })

    app.use('/auth', client)

    // Step 1: Initiate OAuth — capture redirect URL and state
    sessionStore = {}
    const redirectRes = await app.handler()(
      new Request('http://localhost/auth/google'),
      { params: {}, query: {} } as any,
    )
    assert.equal(redirectRes.status, 302)
    const redirectLocation = redirectRes.headers.get('location')!
    const redirectUrl = new URL(redirectLocation)
    const state = redirectUrl.searchParams.get('state')!
    assert.ok(state)
    assert.ok(sessionStore.oauthState, 'state saved in session')
    assert.equal(sessionStore.oauthState.state, state)

    // Step 2: Generate a mock authorization code
    // The mock server's authorize endpoint generates codes, but since we're
    // pointing to our mock's token/userinfo endpoints directly (not the authorize),
    // we need to pre-generate a code and store it in the codeMap
    const code = `test-code-${Date.now()}`
    codeMap.set(code, 'google-123')

    // Step 3: Call the callback with the code
    sessionStore = { oauthState: { state, provider: 'google' } }

    const callbackRes = await app.handler()(
      new Request(`http://localhost/auth/google/callback?code=${code}&state=${state}`),
      { params: {}, query: {} } as any,
    )

    assert.equal(callbackRes.status, 302, 'callback should redirect to dashboard')
    const callbackLocation = callbackRes.headers.get('location')!
    const callbackUrl = new URL(callbackLocation)
    assert.ok(callbackUrl.pathname === '/dashboard', 'redirects to configured redirectUrl')
    assert.ok(callbackUrl.searchParams.has('token'), 'includes JWT token in redirect')

    // Step 4: Verify user was created in database
    const [user] = await pg.sql`
      SELECT * FROM "_users" WHERE email = ${'alice@gmail.com'} LIMIT 1
    ` as any
    assert.ok(user, 'user must be created in database')
    assert.equal(user.name, 'Alice')

    // Step 5: Verify provider link was created
    const [link] = await pg.sql`
      SELECT * FROM "_auth_providers" WHERE provider = ${'google'} AND provider_id = ${'123'} LIMIT 1
    ` as any
    assert.ok(link, 'provider link must be created')
    assert.equal(link.user_id, user.id)

    // Step 6: Verify session was populated
    assert.equal(sessionStore.userId, user.id)
    assert.equal(sessionStore.role, user.role)
  })

  it('complete GitHub OAuth flow', async () => {
    const app = new Router()
    let sessionStore: any = {}

    app.use((req: any, ctx: any, next: any) => {
      ctx.session = sessionStore
      ctx.sessionId = 'test-session'
      return next(req, ctx)
    })

    const client = oauthClient({
      pg: pg as any,
      jwtSecret: 'test-jwt-secret',
      redirectUrl: '/dashboard',
      providers: {
        github: {
          clientId: 'mock-github-id',
          clientSecret: 'mock-github-secret',
          authUrl: `${mockUrl}/oauth/authorize`,
          tokenUrl: `${mockUrl}/oauth/token`,
          userUrl: `${mockUrl}/oauth/userinfo`,
          parseUser: (data: any) => ({
            id: String(data.id),
            email: data.email ?? '',
            name: data.name ?? data.login,
            avatarUrl: data.avatar_url,
          }),
        },
      },
    })

    app.use('/auth', client)

    // Initiate
    sessionStore = {}
    const redirectRes = await app.handler()(
      new Request('http://localhost/auth/github'),
      { params: {}, query: {} } as any,
    )
    const state = new URL(redirectRes.headers.get('location')!).searchParams.get('state')!

    // Generate code for GitHub user
    const code = `test-code-github-${Date.now()}`
    codeMap.set(code, 'github-456')

    // Callback
    sessionStore = { oauthState: { state, provider: 'github' } }
    const callbackRes = await app.handler()(
      new Request(`http://localhost/auth/github/callback?code=${code}&state=${state}`),
      { params: {}, query: {} } as any,
    )
    assert.equal(callbackRes.status, 302)

    // Verify user created
    const [user] = await pg.sql`
      SELECT id, email, name FROM "_users" WHERE email = ${'bob@github.com'} LIMIT 1
    ` as any
    assert.ok(user, 'GitHub user must be created')
    assert.equal(user.name, 'Bob')
  })

  it('re-use existing account when email matches', async () => {
    // First, create an existing user manually
    const [existingUser] = await pg.sql`
      INSERT INTO "_users" (email, password, name, role)
      VALUES ('existing@test.com', 'dummy-hash', 'Existing User', 'user')
      RETURNING id
    ` as any

    const app = new Router()
    let sessionStore: any = {}

    app.use((req: any, ctx: any, next: any) => {
      ctx.session = sessionStore
      ctx.sessionId = 'test-session'
      return next(req, ctx)
    })

    const client = oauthClient({
      pg: pg as any,
      jwtSecret: 'test-jwt-secret',
      redirectUrl: '/dashboard',
      providers: {
        google: {
          clientId: 'mock-client-id',
          clientSecret: 'mock-client-secret',
          authUrl: `${mockUrl}/oauth/authorize`,
          tokenUrl: `${mockUrl}/oauth/token`,
          userUrl: `${mockUrl}/oauth/userinfo`,
          parseUser: (data: any) => ({
            id: data.id,
            email: data.email,
            name: data.name,
            avatarUrl: data.picture,
          }),
        },
      },
    })

    app.use('/auth', client)

    // Initiate
    const redirectRes = await app.handler()(
      new Request('http://localhost/auth/google'),
      { params: {}, query: {} } as any,
    )
    const state = new URL(redirectRes.headers.get('location')!).searchParams.get('state')!

    // Generate code for a user whose email matches the existing user
    // We'll register a user with the same email as the existing user
    const code = `test-code-link-${Date.now()}`
    codeMap.set(code, 'google-link')
    mockUsers['google-link'] = { id: 'link', email: 'existing@test.com', name: 'Linked User', picture: '' }

    // Callback
    sessionStore = { oauthState: { state, provider: 'google' } }
    const callbackRes = await app.handler()(
      new Request(`http://localhost/auth/google/callback?code=${code}&state=${state}`),
      { params: {}, query: {} } as any,
    )
    assert.equal(callbackRes.status, 302, 'existing email should allow linking')

    // Verify the provider link points to the existing user
    const [link] = await pg.sql`
      SELECT user_id FROM "_auth_providers"
      WHERE provider = 'google' AND provider_id = 'link'
      LIMIT 1
    ` as any
    assert.ok(link)
    assert.equal(link.user_id, existingUser.id, 'provider must link to existing user')

    // Verify session uses existing user
    assert.equal(sessionStore.userId, existingUser.id)
  })

  it('supports JSON response for API clients', async () => {
    const app = new Router()
    let sessionStore: any = {}

    app.use((req: any, ctx: any, next: any) => {
      ctx.session = sessionStore
      ctx.sessionId = 'test-session'
      return next(req, ctx)
    })

    const client = oauthClient({
      pg: pg as any,
      jwtSecret: 'test-jwt-secret',
      redirectUrl: '/dashboard',
      providers: {
        google: {
          clientId: 'mock-client-id',
          clientSecret: 'mock-client-secret',
          authUrl: `${mockUrl}/oauth/authorize`,
          tokenUrl: `${mockUrl}/oauth/token`,
          userUrl: `${mockUrl}/oauth/userinfo`,
          parseUser: (data: any) => ({
            id: data.id,
            email: data.email,
            name: data.name,
            avatarUrl: data.picture,
          }),
        },
      },
    })

    app.use('/auth', client)

    // Initiate
    const redirectRes = await app.handler()(
      new Request('http://localhost/auth/google'),
      { params: {}, query: {} } as any,
    )
    const state = new URL(redirectRes.headers.get('location')!).searchParams.get('state')!

    // Generate code
    const code = `test-code-json-${Date.now()}`
    codeMap.set(code, 'google-123')

    // Callback with Accept: application/json
    sessionStore = { oauthState: { state, provider: 'google' } }
    const callbackRes = await app.handler()(
      new Request(`http://localhost/auth/google/callback?code=${code}&state=${state}`, {
        headers: { accept: 'application/json' },
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(callbackRes.status, 200, 'API clients get JSON response')
    const body = await callbackRes.json() as any
    assert.ok(body.token, 'JSON response includes token')
    assert.equal(body.user.email, 'alice@gmail.com')
  })

  it('creates _auth_providers table on first request', async () => {
    // Drop table if exists
    await pg.sql`DROP TABLE IF EXISTS "_auth_providers"`

    const app = new Router()
    app.use((req: any, ctx: any, next: any) => {
      ctx.session = {}
      ctx.sessionId = 'test-session'
      return next(req, ctx)
    })

    const client = oauthClient({
      pg: pg as any,
      jwtSecret: 'test-jwt-secret',
      providers: {
        google: {
          clientId: 'x', clientSecret: 'y',
          authUrl: `${mockUrl}/oauth/authorize`,
          tokenUrl: `${mockUrl}/oauth/token`,
          userUrl: `${mockUrl}/oauth/userinfo`,
          parseUser: (d: any) => ({ id: d.id, email: '', name: '' }),
        },
      },
    })
    app.use('/auth', client)

    const res = await app.handler()(
      new Request('http://localhost/auth/google'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 302, '302 means table was created')

    const [row] = await pg.sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = '_auth_providers'
      ) AS exists
    ` as any
    assert.equal(row.exists, true)
  })
})
