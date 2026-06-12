import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { z } from 'zod'
import { postgres } from '../postgres/index.ts'
import { user } from '../user/index.ts'
import type { PostgresClient } from '../postgres/types.ts'

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

describe('user', { skip: !DATABASE_URL }, () => {
  let pg: PostgresClient
  const table = '__test_user_auth'
  const jwtSecret = 'test-secret-key'

  before(async () => {
    pg = postgres({ connection: DATABASE_URL })
    const auth = user({ pg, jwtSecret, table })
    await auth.migrate()
  })

  beforeEach(async () => {
    await pg.sql`DELETE FROM ${pg.sql(table as any)}`
  })

  after(async () => {
    await pg.sql.unsafe(`DROP TABLE IF EXISTS "_oauth2_tokens"`)
    await pg.sql.unsafe(`DROP TABLE IF EXISTS "_oauth2_codes"`)
    await pg.sql.unsafe(`DROP TABLE IF EXISTS "_oauth2_clients"`)
    await pg.sql.unsafe(`DROP TABLE IF EXISTS "${table}" CASCADE`)
    await pg.close()
  })

  it('register creates a user and returns token', async () => {
    const auth = user({ pg, jwtSecret, table })

    const { user: u, token } = await auth.register({
      email: 'alice@test.com',
      password: 'password123',
      name: 'Alice',
    })

    assert.ok(u.id)
    assert.equal(u.email, 'alice@test.com')
    assert.equal(u.name, 'Alice')
    assert.equal(u.role, 'user')
    assert.ok(!('password' in u))
    assert.ok(token)
  })

  it('register rejects duplicate email', async () => {
    const auth = user({ pg, jwtSecret, table })

    await auth.register({ email: 'dupe@test.com', password: 'password123', name: 'A' })

    await assert.rejects(
      () => auth.register({ email: 'dupe@test.com', password: 'password123', name: 'B' }),
      (err: any) => err.status === 409,
    )
  })

  it('register with short password rejects', async () => {
    const auth = user({ pg, jwtSecret, table })

    await assert.rejects(
      () => auth.register({ email: 'short@test.com', password: '12345', name: 'Short' }),
      z.ZodError,
    )
  })

  it('login returns user and token', async () => {
    const auth = user({ pg, jwtSecret, table })

    await auth.register({ email: 'login@test.com', password: 'mypassword', name: 'Login' })

    const { user: u, token } = await auth.login({ email: 'login@test.com', password: 'mypassword' })
    assert.ok(u.id)
    assert.equal(u.email, 'login@test.com')
    assert.ok(token)
  })

  it('login with wrong password rejects', async () => {
    const auth = user({ pg, jwtSecret, table })

    await auth.register({ email: 'wrongpw@test.com', password: 'correct', name: 'X' })

    await assert.rejects(
      () => auth.login({ email: 'wrongpw@test.com', password: 'wrong' }),
      (err: any) => err.status === 401,
    )
  })

  it('login with non-existent email rejects', async () => {
    const auth = user({ pg, jwtSecret, table })

    await assert.rejects(
      () => auth.login({ email: 'nobody@test.com', password: 'x' }),
      (err: any) => err.status === 401,
    )
  })

  it('verify returns user for valid token', async () => {
    const auth = user({ pg, jwtSecret, table })

    const { user: u, token } = await auth.register({ email: 'verify@test.com', password: 'password123', name: 'Verify' })

    const verified = await auth.verify(token)
    assert.ok(verified)
    assert.equal(verified!.id, u.id)
    assert.equal(verified!.email, 'verify@test.com')
  })

  it('verify returns null for invalid token', async () => {
    const auth = user({ pg, jwtSecret, table })
    assert.equal(await auth.verify('bad-token'), null)
  })

  it('verify returns null for wrong secret', async () => {
    const auth1 = user({ pg, jwtSecret: 'secret1', table })
    const auth2 = user({ pg, jwtSecret: 'secret2', table })

    const { token } = await auth1.register({ email: 'ws@test.com', password: 'password123', name: 'WS' })
    assert.equal(await auth2.verify(token), null)
  })

  it('role defaults to "user"', async () => {
    const auth = user({ pg, jwtSecret, table })

    const { user: u } = await auth.register({ email: 'role@test.com', password: 'password123', name: 'Role' })
    assert.equal(u.role, 'user')
  })

  it('middleware sets ctx.user for valid token', async () => {
    const auth = user({ pg, jwtSecret, table })

    const { token } = await auth.register({ email: 'mw@test.com', password: 'password123', name: 'MW' })

    const mw = auth.middleware()
    let captured: any = null

    const res = await mw(
      new Request('http://localhost/me', { headers: { Authorization: `Bearer ${token}` } }),
      { params: {}, query: {} } as any,
      (_req: any, ctx: any) => { captured = ctx.user; return new Response('ok') },
    )

    assert.equal(res.status, 200)
    assert.ok(captured)
    assert.equal(captured.email, 'mw@test.com')
  })

  it('middleware returns 401 without token', async () => {
    const auth = user({ pg, jwtSecret, table })
    const mw = auth.middleware()

    const res = await mw(
      new Request('http://localhost/me'),
      { params: {}, query: {} } as any,
      () => new Response('ok'),
    )
    assert.equal(res.status, 401)
  })

  it('router POST /register works', async () => {
    const auth = user({ pg, jwtSecret, table })
    const r = auth

    const res = await r.handler()(
      new Request('http://localhost/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'router@test.com', password: 'password123', name: 'Router' }),
      }),
      { params: {}, query: {} } as any,
    )

    assert.equal(res.status, 201)
    const body = await res.json() as any
    assert.ok(body.user)
    assert.ok(body.token)
  })

  it('router POST /login works', async () => {
    const auth = user({ pg, jwtSecret, table })

    await auth.register({ email: 'rlogin@test.com', password: 'password456', name: 'RL' })

    const r = auth
    const res = await r.handler()(
      new Request('http://localhost/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'rlogin@test.com', password: 'password456' }),
      }),
      { params: {}, query: {} } as any,
    )

    assert.equal(res.status, 200)
    const body = await res.json() as any
    assert.ok(body.token)
  })

  it('router returns 400 for invalid input', async () => {
    const auth = user({ pg, jwtSecret, table })
    const r = auth

    const res = await r.handler()(
      new Request('http://localhost/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bad', password: '12', name: '' }),
      }),
      { params: {}, query: {} } as any,
    )

    assert.equal(res.status, 400)
  })

  describe('oauth2 server', () => {
    const oauthTable = '__test_user_oauth'
    const oauthSecret = 'oauth-test-secret'
    let auth: ReturnType<typeof user>

    before(async () => {
      auth = user({ pg, jwtSecret: oauthSecret, table: oauthTable, oauth2: { server: true } })
      await auth.migrate()
    })

    beforeEach(async () => {
      await pg.sql`DELETE FROM "_oauth2_tokens"`
      await pg.sql`DELETE FROM "_oauth2_codes"`
      await pg.sql`DELETE FROM "_oauth2_clients"`
      await pg.sql`DELETE FROM ${pg.sql(oauthTable as any)}`
    })

    after(async () => {
      await pg.sql.unsafe(`DROP TABLE IF EXISTS "_oauth2_tokens"`)
      await pg.sql.unsafe(`DROP TABLE IF EXISTS "_oauth2_codes"`)
      await pg.sql.unsafe(`DROP TABLE IF EXISTS "_oauth2_clients"`)
      await pg.sql.unsafe(`DROP TABLE IF EXISTS "${oauthTable}" CASCADE`)
    })

    it('registerClient creates a client', async () => {
      const client = await auth.registerClient({
        name: 'Test App',
        redirectUris: ['https://app.com/callback'],
      })
      assert.ok(client.id)
      assert.ok(client.clientId)
      assert.ok(client.clientSecret)
      assert.equal(client.name, 'Test App')
      assert.deepEqual(client.redirectUris, ['https://app.com/callback'])
    })

    it('getClient returns client by client_id', async () => {
      const created = await auth.registerClient({
        name: 'Find Me',
        redirectUris: ['https://find.me/cb'],
      })
      const found = await auth.getClient(created.clientId)
      assert.ok(found)
      assert.equal(found!.name, 'Find Me')
    })

    it('getClient returns null for unknown client_id', async () => {
      const found = await auth.getClient('non-existent')
      assert.equal(found, null)
    })

    it('revokeClient removes a client', async () => {
      const created = await auth.registerClient({
        name: 'Revoke Me',
        redirectUris: ['https://revoke.me/cb'],
      })
      await auth.revokeClient(created.clientId)
      const found = await auth.getClient(created.clientId)
      assert.equal(found, null)
    })

    it('authorization code flow (without PKCE)', async () => {
      const client = await auth.registerClient({
        name: 'AuthCode App',
        redirectUris: ['https://authcode.app/cb'],
      })
      const { user: u } = await auth.register({ email: 'oauth-user@test.com', password: 'password123', name: 'OAuth' })

      const router = auth

      const authorizeRes = await router.handler()(
        new Request(`http://localhost/oauth/authorize?client_id=${client.clientId}&redirect_uri=https://authcode.app/cb&response_type=code&state=xyz`, {
          headers: { Authorization: `Bearer ${(await auth.login({ email: 'oauth-user@test.com', password: 'password123' })).token}` },
        }),
        { params: {}, query: {} } as any,
      )
      assert.equal(authorizeRes.status, 200)
      const html = await authorizeRes.text()
      assert.ok(html.includes(client.name))
      assert.ok(html.includes(client.clientId))

      const consentRes = await router.handler()(
        new Request('http://localhost/oauth/consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            approve: 'true',
            client_id: client.clientId,
            redirect_uri: 'https://authcode.app/cb',
            state: 'xyz',
            user_id: String(u.id),
          }),
        }),
        { params: {}, query: {} } as any,
      )
      assert.equal(consentRes.status, 302)
      const location = consentRes.headers.get('location') || ''
      assert.ok(location.startsWith('https://authcode.app/cb?code='))
      const code = new URL(location).searchParams.get('code') || ''

      const tokenRes = await router.handler()(
        new Request('http://localhost/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            code,
            client_id: client.clientId,
            client_secret: client.clientSecret,
            redirect_uri: 'https://authcode.app/cb',
          }),
        }),
        { params: {}, query: {} } as any,
      )
      assert.equal(tokenRes.status, 200)
      const tokenBody = await tokenRes.json() as any
      assert.ok(tokenBody.access_token)
      assert.equal(tokenBody.token_type, 'Bearer')
      assert.ok(tokenBody.refresh_token)
      assert.ok(tokenBody.expires_in)

      const verified = await auth.verify(tokenBody.access_token)
      assert.ok(verified)
      assert.equal(verified!.id, u.id)
    })

    it('authorization code flow with PKCE', async () => {
      const client = await auth.registerClient({
        name: 'PKCE App',
        redirectUris: ['https://pkce.app/cb'],
      })
      const { user: u } = await auth.register({ email: 'pkce-user@test.com', password: 'password123', name: 'PKCE' })

      const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXK'
      const challenge = crypto.createHash('sha256').update(codeVerifier).digest().toString('base64url')

      const router = auth

      const authorizeRes = await router.handler()(
        new Request(`http://localhost/oauth/authorize?client_id=${client.clientId}&redirect_uri=https://pkce.app/cb&response_type=code&code_challenge=${challenge}&code_challenge_method=S256&state=pkce`, {
          headers: { Authorization: `Bearer ${(await auth.login({ email: 'pkce-user@test.com', password: 'password123' })).token}` },
        }),
        { params: {}, query: {} } as any,
      )
      assert.equal(authorizeRes.status, 200)

      const consentRes = await router.handler()(
        new Request('http://localhost/oauth/consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            approve: 'true',
            client_id: client.clientId,
            redirect_uri: 'https://pkce.app/cb',
            state: 'pkce',
            user_id: String(u.id),
            code_challenge: challenge,
            code_challenge_method: 'S256',
          }),
        }),
        { params: {}, query: {} } as any,
      )
      const location = consentRes.headers.get('location') || ''
      const code = new URL(location).searchParams.get('code') || ''

      const tokenRes = await router.handler()(
        new Request('http://localhost/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            code,
            client_id: client.clientId,
            client_secret: client.clientSecret,
            redirect_uri: 'https://pkce.app/cb',
            code_verifier: codeVerifier,
          }),
        }),
        { params: {}, query: {} } as any,
      )
      assert.equal(tokenRes.status, 200)
      const tokenBody = await tokenRes.json() as any
      assert.ok(tokenBody.access_token)

      const verified = await auth.verify(tokenBody.access_token)
      assert.ok(verified)
      assert.equal(verified!.id, u.id)
    })

    it('token exchange with wrong code rejects', async () => {
      const client = await auth.registerClient({
        name: 'BadCode App',
        redirectUris: ['https://badcode.app/cb'],
      })

      const router = auth
      const tokenRes = await router.handler()(
        new Request('http://localhost/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            code: 'non-existent-code',
            client_id: client.clientId,
            client_secret: client.clientSecret,
            redirect_uri: 'https://badcode.app/cb',
          }),
        }),
        { params: {}, query: {} } as any,
      )
      assert.equal(tokenRes.status, 400)
      const body = await tokenRes.json() as any
      assert.equal(body.error, 'invalid_grant')
    })

    it('authorize redirects to /login when not authenticated', async () => {
      const client = await auth.registerClient({
        name: 'NoAuth App',
        redirectUris: ['https://noauth.app/cb'],
      })

      const router = auth
      const res = await router.handler()(
        new Request(`http://localhost/oauth/authorize?client_id=${client.clientId}&redirect_uri=https://noauth.app/cb&response_type=code`),
        { params: {}, query: {} } as any,
      )
      assert.equal(res.status, 302)
      const loc = res.headers.get('location') || ''
      assert.ok(loc.startsWith('/login?redirect='))
    })

    it('consent deny redirects with error', async () => {
      const client = await auth.registerClient({
        name: 'Deny App',
        redirectUris: ['https://deny.app/cb'],
      })
      const { user: u } = await auth.register({ email: 'deny-user@test.com', password: 'password123', name: 'Deny' })

      const router = auth
      const res = await router.handler()(
        new Request('http://localhost/oauth/consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            approve: 'false',
            client_id: client.clientId,
            redirect_uri: 'https://deny.app/cb',
            state: 'mystate',
            user_id: String(u.id),
          }),
        }),
        { params: {}, query: {} } as any,
      )
      assert.equal(res.status, 302)
      const loc = res.headers.get('location') || ''
      assert.ok(loc.startsWith('https://deny.app/cb?error=access_denied'))
      assert.ok(loc.includes('state=mystate'))
    })

    it('client_credentials grant works', async () => {
      const client = await auth.registerClient({
        name: 'Machine App',
        redirectUris: ['https://machine.app/cb'],
      })

      const router = auth
      const tokenRes = await router.handler()(
        new Request('http://localhost/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: client.clientId,
            client_secret: client.clientSecret,
            scope: 'read',
          }),
        }),
        { params: {}, query: {} } as any,
      )
      assert.equal(tokenRes.status, 200)
      const body = await tokenRes.json() as any
      assert.ok(body.access_token)
      assert.equal(body.token_type, 'Bearer')

      const verified = await auth.verify(body.access_token)
      assert.equal(verified, null, 'client_credentials token should not verify as user')
    })

    it('authorize rejects invalid client_id', async () => {
      const router = auth
      const res = await router.handler()(
        new Request('http://localhost/oauth/authorize?client_id=nonexistent&redirect_uri=https://x.com/cb&response_type=code'),
        { params: {}, query: {} } as any,
      )
      assert.equal(res.status, 400)
      const html = await res.text()
      assert.ok(html.includes('Invalid client_id'))
    })
  })

  describe('session integration', () => {
    it('middleware loads user from ctx.session.userId', async () => {
      const { Router } = await import('../router.ts')
      const { MemoryStore } = await import('../session.ts')

      const auth = user({ pg, jwtSecret, table })
      const memStore = new MemoryStore()

      // Register a user fresh for this test
      const result = await auth.register({ email: 'session-int@test.com', password: 'password123', name: 'Session Int' })

      const app = new Router()
      app.use(auth.middleware())
      app.get('/me', (req, ctx: any) => Response.json({ id: ctx.user.id, email: ctx.user.email }))

      const handler = app.handler()
      const ctx1 = { params: {}, query: {}, session: { userId: result.user.id } }
      const res1 = await handler(new Request('http://localhost/me'), ctx1 as any)
      assert.equal(res1.status, 200)
      const data1 = await res1.json() as any
      assert.equal(data1.id, result.user.id)
      assert.equal(data1.email, 'session-int@test.com')

      memStore.close()
    })

    it('middleware falls back to JWT when no session.userId', async () => {
      const auth = user({ pg, jwtSecret, table })
      const result = await auth.register({ email: 'jwt-int@test.com', password: 'password123', name: 'JWT Int' })

      // JWT-based auth should still work (no session set)
      const { Router } = await import('../router.ts')
      const app = new Router()
      app.use(auth.middleware())
      app.get('/me', (req, ctx: any) => Response.json({ id: ctx.user.id }))

      const handler = app.handler()
      const res = await handler(
        new Request('http://localhost/me', { headers: { authorization: 'Bearer ' + result.token } }),
        { params: {}, query: {} } as any,
      )
      assert.equal(res.status, 200)
      assert.equal((await res.json() as any).id, result.user.id)
    })
  })
})
