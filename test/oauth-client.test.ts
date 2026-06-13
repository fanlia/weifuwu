import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { user } from '../user/index.ts'
import { createTestServer } from '../serve.ts'
import { postgres } from '../postgres/index.ts'

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

describe('oauthLogin', { skip: !DATABASE_URL }, () => {
  let pg: ReturnType<typeof postgres>
  let mockServer: { stop: () => Promise<void>; port: number }
  let mockUrl: string

  // Mock OAuth provider server
  const mockUsers: Record<string, any> = {
    'google-123': { id: '123', email: 'alice@gmail.com', name: 'Alice', picture: 'https://example.com/avatar.png' },
    'github-456': { id: 456, login: 'bob', email: 'bob@github.com', name: 'Bob', avatar_url: 'https://example.com/bob.png' },
  }
  const codeMap = new Map<string, string>()

  function mockHandler(req: Request): Promise<Response> | Response {
    const purl = new URL(req.url)
    if (purl.pathname === '/oauth/token') {
      return (async () => {
        const body = await req.json() as any
        const userKey = body.code ? codeMap.get(body.code) : undefined
        if (!userKey) return Response.json({ error: 'invalid_code' }, { status: 400 })
        // token format: token_{provider}_{userId}
        const [pid, uid] = userKey.split('-')
        return Response.json({ access_token: 'token_' + pid + '_' + uid, token_type: 'bearer' })
      })()
    }
    if (purl.pathname === '/oauth/userinfo') {
      return (async () => {
        const auth = req.headers.get('authorization') ?? ''
        const token = auth.replace('Bearer ', '')
        const parts = token.split('_')
        if (parts.length < 3) return Response.json({ error: 'invalid_token' }, { status: 401 })
        const prov = parts[1]
        const uid = parts[2]
        const userData = mockUsers[prov + '-' + uid]
        if (!userData) return Response.json({ error: 'user_not_found' }, { status: 404 })
        return Response.json({ id: userData.id, email: userData.email, name: userData.name })
      })()
    }
    return new Response('Not Found', { status: 404 })
  }

  // Build providers lazily (mockUrl is set in before())
  function googleProviders() { return {
    google: {
      clientId: 'mock-client-id', clientSecret: 'mock-client-secret',
      authUrl: mockUrl + '/oauth/authorize', tokenUrl: mockUrl + '/oauth/token', userUrl: mockUrl + '/oauth/userinfo',
      parseUser: (data: any) => ({ id: data.id, email: data.email, name: data.name, avatarUrl: data.picture }),
    },
  } }

  function githubProviders() { return {
    github: {
      clientId: 'mock-github-id', clientSecret: 'mock-github-secret',
      authUrl: mockUrl + '/oauth/authorize', tokenUrl: mockUrl + '/oauth/token', userUrl: mockUrl + '/oauth/userinfo',
      parseUser: (data: any) => ({ id: String(data.id), email: data.email ?? '', name: data.name ?? data.login, avatarUrl: data.avatar_url }),
    },
  } }

  // Helper: create a callable handler with session
  function makeHandler(providers: Record<string, any>) {
    const u = user({ pg: pg as any, jwtSecret: 'test-jwt-secret', oauthLogin: { redirectUrl: '/dashboard', providers } })
    const h = u.handler()
    return (req: Request, session: any) =>
      h(req, { params: {}, query: {}, session } as any)
  }

  before(async () => {
    pg = postgres({ connection: DATABASE_URL })
    await pg.sql`
      CREATE TABLE IF NOT EXISTS "_users" (
        id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
        name TEXT NOT NULL, role TEXT DEFAULT 'user',
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
    const { server, url } = await createTestServer(mockHandler)
    mockServer = server as any
    mockUrl = url
  })

  after(async () => {
    if (mockServer) await mockServer.stop()
    await pg.sql`DROP TABLE IF EXISTS "_auth_providers"`
    await pg.sql`DROP TABLE IF EXISTS "_users"`
    await pg.close()
  })

  // ── Tests ──

  it('returns 400 for unknown provider', async () => {
    const call = makeHandler(googleProviders())
    const res = await call(new Request('http://localhost/auth/unknown'), {})
    assert.equal(res.status, 400)
  })

  it('redirects to provider auth URL with state', async () => {
    const call = makeHandler(googleProviders())
    const res = await call(new Request('http://localhost/auth/google'), {})
    assert.equal(res.status, 302)
    const location = res.headers.get('location')!
    assert.ok(location.startsWith(mockUrl + '/oauth/authorize'))
    assert.ok(location.includes('state='))
  })

  it('handles missing code or state in callback', async () => {
    const call = makeHandler(googleProviders())
    const res = await call(new Request('http://localhost/auth/google/callback'), {})
    assert.equal(res.status, 400)
  })

  it('rejects invalid state (CSRF protection)', async () => {
    const call = makeHandler(googleProviders())
    const res = await call(new Request('http://localhost/auth/google/callback?code=xxx&state=bad-state'), {})
    assert.equal(res.status, 403)
  })

  it('complete OAuth flow: user created and session set', async () => {
    const call = makeHandler(googleProviders())
    let session: any = {}

    // Initiate
    const redirectRes = await call(new Request('http://localhost/auth/google'), session)
    const state = new URL(redirectRes.headers.get('location')!).searchParams.get('state')!
    assert.ok(session.oauthState)
    assert.equal(session.oauthState.state, state)

    // Callback
    const code = 'test-code-' + Date.now()
    codeMap.set(code, 'google-123')
    session = { oauthState: { state, provider: 'google' } }
    const callbackRes = await call(new Request(`http://localhost/auth/google/callback?code=${code}&state=${state}`), session)
    assert.equal(callbackRes.status, 302)

    // Verify user created
    const [userRow] = await pg.sql`SELECT * FROM "_users" WHERE email = 'alice@gmail.com' LIMIT 1` as any
    assert.ok(userRow)
    assert.equal(session.userId, userRow.id)
  })

  it('complete GitHub OAuth flow', async () => {
    const call = makeHandler(githubProviders())
    let session: any = {}

    const redirectRes = await call(new Request('http://localhost/auth/github'), session)
    const state = new URL(redirectRes.headers.get('location')!).searchParams.get('state')!

    const code = 'test-code-gh-' + Date.now()
    codeMap.set(code, 'github-456')
    session = { oauthState: { state, provider: 'github' } }
    const callbackRes = await call(new Request(`http://localhost/auth/github/callback?code=${code}&state=${state}`), session)
    assert.equal(callbackRes.status, 302)

    const [userRow] = await pg.sql`SELECT id, name FROM "_users" WHERE email = 'bob@github.com' LIMIT 1` as any
    assert.ok(userRow)
    assert.equal(userRow.name, 'Bob')
  })

  it('re-use existing account when email matches', async () => {
    const [existingUser] = await pg.sql`
      INSERT INTO "_users" (email, password, name, role) VALUES ('existing@test.com', 'hash', 'Existing', 'user') RETURNING id
    ` as any

    const call = makeHandler(googleProviders())
    let session: any = {}

    const redirectRes = await call(new Request('http://localhost/auth/google'), session)
    const state = new URL(redirectRes.headers.get('location')!).searchParams.get('state')!

    const code = 'test-code-link-' + Date.now()
    codeMap.set(code, 'google-link')
    mockUsers['google-link'] = { id: 'link', email: 'existing@test.com', name: 'Linked', picture: '' }

    session = { oauthState: { state, provider: 'google' } }
    const callbackRes = await call(new Request(`http://localhost/auth/google/callback?code=${code}&state=${state}`), session)
    assert.equal(callbackRes.status, 302)
    assert.equal(session.userId, existingUser.id)
  })

  it('supports JSON response for API clients', async () => {
    const call = makeHandler(googleProviders())
    let session: any = {}

    const redirectRes = await call(new Request('http://localhost/auth/google'), session)
    const state = new URL(redirectRes.headers.get('location')!).searchParams.get('state')!

    const code = 'test-code-json-' + Date.now()
    codeMap.set(code, 'google-123')
    session = { oauthState: { state, provider: 'google' } }

    const callbackRes = await call(
      new Request(`http://localhost/auth/google/callback?code=${code}&state=${state}`, { headers: { accept: 'application/json' } }),
      session,
    )
    assert.equal(callbackRes.status, 200)
    const body = await callbackRes.json() as any
    assert.ok(body.token)
    assert.equal(body.user.email, 'alice@gmail.com')
  })
})
