import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { postgres } from '../postgres/index.ts'
import { user } from '../user.ts'
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
    await pg.sql.unsafe(`DROP TABLE IF EXISTS "${table}"`)
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
    const r = auth.router()

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

    const r = auth.router()
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
    const r = auth.router()

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
})
