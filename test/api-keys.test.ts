 
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { user } from '../user/index.ts'
import { postgres } from '../postgres/index.ts'
import { testApp } from '../test-utils.ts'

const TEST_DB = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL

describe('user API keys', { skip: !TEST_DB }, () => {
  let pg: ReturnType<typeof postgres>
  let users: ReturnType<typeof user>

  before(async () => {
    pg = postgres({ connection: TEST_DB })
    users = user({
      pg,
      jwtSecret: 'test-secret-for-api-keys',
      apiKeys: true,
    })
    await users.migrate()
  })

  after(async () => {
    await pg.sql.unsafe(`DROP TABLE IF EXISTS "_api_keys" CASCADE`)
    await pg.sql.unsafe(`DROP TABLE IF EXISTS "_users" CASCADE`)
    await pg.close()
  })

  it('should create an API key for a user', async () => {
    // First register a user
    const { user: userData } = await users.register({
      email: 'key-test@example.com',
      password: 'password123',
      name: 'Key Test',
    })

    const result = await users.createApiKey(userData.id, 'My First Key')
    assert.ok(result.id > 0, 'should return a key ID')
    assert.ok(result.key.startsWith('sk_live_'), `key should start with sk_live_: ${result.key}`)
    assert.equal(result.key.length, 8 + 64, 'sk_live_ (8) + 64 hex chars = 72')
    assert.ok(result.key.length > 20, 'key should be long enough')
  })

  it('should list API keys (masked)', async () => {
    const { user: userData } = await users.register({
      email: 'key-list@example.com',
      password: 'password123',
      name: 'Key List',
    })

    await users.createApiKey(userData.id, 'Dev Key')
    await users.createApiKey(userData.id, 'Prod Key', ['read', 'write'])

    const keys = await users.listApiKeys(userData.id)
    assert.equal(keys.length, 2)
    assert.equal(keys[0].name, 'Prod Key') // newest first
    assert.equal(keys[1].name, 'Dev Key')

    // Keys should be masked
    for (const k of keys) {
      assert.ok(k.prefix.startsWith('sk_live_'), `prefix should start with sk_live_: ${k.prefix}`)
      assert.ok(k.prefix.includes('...'), 'prefix should be masked with ...')
      assert.ok(!k.revoked, 'key should not be revoked')
    }

    // Prod Key should have scopes
    assert.deepEqual(keys[0].scopes, ['read', 'write'])
  })

  it('should revoke an API key', async () => {
    const { user: userData } = await users.register({
      email: 'key-revoke@example.com',
      password: 'password123',
      name: 'Key Revoke',
    })

    const { id } = await users.createApiKey(userData.id, 'To Revoke')
    await users.revokeApiKey(userData.id, id)

    const keys = await users.listApiKeys(userData.id)
    const revoked = keys.find((k) => k.id === id)
    assert.ok(revoked, 'key should exist in list')
    assert.ok(revoked!.revoked, 'key should be marked as revoked')
  })

  it('should verify a valid API key', async () => {
    const { user: userData } = await users.register({
      email: 'key-verify@example.com',
      password: 'password123',
      name: 'Key Verify',
    })

    const { key } = await users.createApiKey(userData.id, 'Verify Key', ['read'])

    // Use the key via middleware — create a test app
    const app = testApp()
    app.use(users.middleware())
    app.get('/me', (req: any, ctx: any) => {
      return Response.json({ user: ctx.user })
    })

    const res = await app.getReq('/me').header('Authorization', `Bearer ${key}`).send()

    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.user.email, 'key-verify@example.com')
    // API key auth should return user data
    assert.ok(body.user.id > 0)
  })

  it('should reject a revoked API key', async () => {
    const { user: userData } = await users.register({
      email: 'key-rejected@example.com',
      password: 'password123',
      name: 'Key Rejected',
    })

    const { id, key } = await users.createApiKey(userData.id, 'Revoke Me')
    await users.revokeApiKey(userData.id, id)

    const app = testApp()
    app.use(users.middleware())
    app.get('/secure', () => Response.json({ ok: true }))

    const res = await app.getReq('/secure').header('Authorization', `Bearer ${key}`).send()

    assert.equal(res.status, 401, 'revoked key should get 401')
  })

  it('should reject invalid API key format', async () => {
    const app = testApp()
    app.use(users.middleware())
    app.get('/secure', () => Response.json({ ok: true }))

    const res = await app.getReq('/secure').header('Authorization', 'Bearer not-an-api-key').send()

    assert.equal(res.status, 401, 'invalid key should get 401')
  })

  it('should have API key REST routes', async () => {
    // Use the router handler directly (avoiding auto-registered strict middleware)
    const handler = users.handler()
    const ctx = { params: {}, query: {} }

    // Register via router
    const regRes = await handler(
      new Request('http://localhost/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'key-rest@example.com',
          password: 'password123',
          name: 'Key REST',
        }),
      }),
      { ...ctx },
    )
    assert.equal(regRes.status, 201, 'register should succeed')
    const { token } = (await regRes.json()) as any
    assert.ok(token, 'should get a token')

    // Create API key via router
    const createRes = await handler(
      new Request('http://localhost/api-keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: 'REST Key', scopes: ['read', 'write'] }),
      }),
      { ...ctx },
    )
    assert.equal(createRes.status, 201, 'should create API key')
    const createBody = (await createRes.json()) as any
    assert.ok(createBody.key.startsWith('sk_live_'), 'key should have correct prefix')

    // List API keys via router
    const listRes = await handler(
      new Request('http://localhost/api-keys', {
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
      }),
      { ...ctx },
    )
    assert.equal(listRes.status, 200)
    const listBody = (await listRes.json()) as any[]
    assert.equal(listBody.length, 1)
    assert.equal(listBody[0].name, 'REST Key')

    // Delete API key via router
    const deleteRes = await handler(
      new Request(`http://localhost/api-keys/${createBody.id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      }),
      { ...ctx },
    )
    assert.equal(deleteRes.status, 200)

    // Verify it's revoked via router
    const listAfter = await handler(
      new Request('http://localhost/api-keys', {
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
      }),
      { ...ctx },
    )
    const listAfterBody = (await listAfter.json()) as any[]
    assert.ok(listAfterBody[0].revoked, 'key should be revoked after delete')
  })

  it('should not expose API key management routes when apiKeys is not enabled', async () => {
    const pg2 = postgres({ connection: TEST_DB })
    const users2 = user({
      pg: pg2,
      jwtSecret: 'test-secret-no-apikeys',
      // apiKeys not enabled
    })
    await users2.migrate()

    try {
      await assert.rejects(
        () => users2.createApiKey(1, 'Should Fail'),
        /not enabled/,
        'should throw when apiKeys not enabled',
      )
    } finally {
      await pg2.sql.unsafe(`DROP TABLE IF EXISTS "_users" CASCADE`)
      await pg2.close()
    }
  })
})
