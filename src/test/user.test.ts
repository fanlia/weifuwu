import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from '../postgres/index.ts'
import { user, requireRole } from '../user/index.ts'
import type { Context, Handler } from '../types.ts'

const TEST_SECRET = 'test-secret-for-user-module'
const TABLE = '__test_users_' + Math.random().toString(36).slice(2, 6)

describe('user module', () => {
  const pg = postgres()
  const userModule = user({ secret: TEST_SECRET, table: TABLE })

  // Helper: run middleware → get ctx.userModule
  async function withAPI(req: Request = new Request('http://localhost/')): Promise<{
    api: import('../user/types.ts').UserModuleAPI
    ctx: Context
  }> {
    const c: Context = { params: {}, query: {}, sql: pg.sql } as unknown as Context
    let api!: import('../user/types.ts').UserModuleAPI
    const mw = userModule as (req: Request, ctx: Context, next: Handler) => Response | Promise<Response>
    await mw(req, c, async (_, c2) => {
      api = c2.userModule
      return new Response('ok')
    })
    return { api, ctx: c }
  }

  before(async () => {
    // Create the test table directly
    await pg.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "${TABLE}" (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email       TEXT NOT NULL UNIQUE,
        name        TEXT NOT NULL,
        password    TEXT NOT NULL,
        role        TEXT NOT NULL DEFAULT 'user',
        avatar      TEXT,
        is_active   BOOLEAN NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ
      )
    `)

    // Trigger auto-migration so the module knows table exists
    await withAPI()
  })

  after(async () => {
    await pg.sql.unsafe(`DROP TABLE IF EXISTS "${TABLE}"`)
    await pg.close()
  })

  // ═══════════════════════════════════════════════════════════
  // Middleware injection
  // ═══════════════════════════════════════════════════════════

  it('injects ctx.userModule', async () => {
    const { api } = await withAPI()
    assert.ok(api)
    assert.equal(typeof api.register, 'function')
    assert.equal(typeof api.login, 'function')
    assert.equal(typeof api.getUserById, 'function')
  })

  // ═══════════════════════════════════════════════════════════
  // User CRUD
  // ═══════════════════════════════════════════════════════════

  it('creates a user with hashed password', async () => {
    const { api } = await withAPI()

    const user = await api.createUser({
      email: 'alice@test.com',
      name: 'Alice',
      password: 'secure-password-123',
    })

    assert.ok(user.id)
    assert.equal(user.email, 'alice@test.com')
    assert.equal(user.name, 'Alice')
    assert.equal(user.role, 'user')
    assert.equal(user.is_active, true)
    assert.ok(user.created_at)
    assert.ok(!('password' in user)) // password never exposed
  })

  it('finds user by id', async () => {
    const { api } = await withAPI()

    const created = await api.createUser({
      email: 'bob@test.com',
      name: 'Bob',
      password: 'bob-password',
    })

    const found = await api.getUserById(created.id)
    assert.ok(found)
    assert.equal(found!.email, 'bob@test.com')
    assert.equal(found!.name, 'Bob')
  })

  it('finds user by email', async () => {
    const { api } = await withAPI()

    const found = await api.getUserByEmail('alice@test.com')
    assert.ok(found)
    assert.equal(found!.id.length, 36) // UUID
  })

  it('returns null for non-existent id', async () => {
    const { api } = await withAPI()
    const result = await api.getUserById('00000000-0000-0000-0000-000000000000')
    assert.equal(result, null)
  })

  it('returns null for non-existent email', async () => {
    const { api } = await withAPI()
    const result = await api.getUserByEmail('noone@test.com')
    assert.equal(result, null)
  })

  it('updates user fields', async () => {
    const { api } = await withAPI()

    const created = await api.createUser({
      email: 'carol@test.com',
      name: 'Carol',
      password: 'carol-pw',
    })

    const updated = await api.updateUser(created.id, {
      name: 'Carol Updated',
      role: 'admin',
    })

    assert.ok(updated)
    assert.equal(updated!.name, 'Carol Updated')
    assert.equal(updated!.role, 'admin')
  })

  it('returns null when updating non-existent id', async () => {
    const { api } = await withAPI()
    const result = await api.updateUser('00000000-0000-0000-0000-000000000000', { name: 'Nope' })
    assert.equal(result, null)
  })

  it('soft-deletes a user', async () => {
    const { api } = await withAPI()

    const created = await api.createUser({
      email: 'dave@test.com',
      name: 'Dave',
      password: 'dave-pw',
    })

    const deleted = await api.deleteUser(created.id)
    assert.equal(deleted, true)

    const found = await api.getUserById(created.id)
    assert.ok(found)
    assert.equal(found!.is_active, false)
  })

  it('returns false when deleting non-existent id', async () => {
    const { api } = await withAPI()
    const result = await api.deleteUser('00000000-0000-0000-0000-000000000000')
    assert.equal(result, false)
  })

  it('lists active users only by default', async () => {
    const { api } = await withAPI()
    const users = await api.listUsers()
    assert.ok(Array.isArray(users))
    for (const u of users) {
      assert.equal(u.is_active, true)
    }
  })

  it('lists inactive users when requested', async () => {
    const { api } = await withAPI()
    const all = await api.listUsers(true)
    // Should include dave (soft-deleted above)
    const dave = all.find(u => u.email === 'dave@test.com')
    assert.ok(dave)
    assert.equal(dave!.is_active, false)
  })

  // ═══════════════════════════════════════════════════════════
  // Authentication
  // ═══════════════════════════════════════════════════════════

  it('register creates user and returns token', async () => {
    const { api } = await withAPI()

    const result = await api.register({
      email: 'eve@test.com',
      name: 'Eve',
      password: 'eve-password',
    })

    assert.ok(result.user)
    assert.ok(result.token)
    assert.equal(result.user.email, 'eve@test.com')
    assert.equal(result.token.split('.').length, 3) // JWT format
  })

  it('register throws on duplicate email', async () => {
    const { api } = await withAPI()
    await assert.rejects(
      () => api.register({
        email: 'alice@test.com',
        name: 'Alice Again',
        password: 'password',
      }),
    )
  })

  it('login returns user and token for valid credentials', async () => {
    const { api } = await withAPI()

    const result = await api.login('alice@test.com', 'secure-password-123')
    assert.ok(result)
    assert.equal(result!.user.email, 'alice@test.com')
    assert.equal(result!.token.split('.').length, 3)
  })

  it('login returns null for wrong password', async () => {
    const { api } = await withAPI()

    const result = await api.login('alice@test.com', 'wrong-password')
    assert.equal(result, null)
  })

  it('login returns null for unknown email', async () => {
    const { api } = await withAPI()
    const result = await api.login('nonexistent@test.com', 'any-password')
    assert.equal(result, null)
  })

  // ═══════════════════════════════════════════════════════════
  // Password management
  // ═══════════════════════════════════════════════════════════

  it('changePassword succeeds with correct current password', async () => {
    const { api } = await withAPI()

    const result = await api.register({
      email: 'charlie@test.com',
      name: 'Charlie',
      password: 'old-password',
    })

    const ok = await api.changePassword(result.user.id, 'old-password', 'new-password')
    assert.equal(ok, true)

    // Can login with new password
    const login = await api.login('charlie@test.com', 'new-password')
    assert.ok(login)

    // Cannot login with old password
    const oldLogin = await api.login('charlie@test.com', 'old-password')
    assert.equal(oldLogin, null)
  })

  it('changePassword fails with wrong current password', async () => {
    const { api } = await withAPI()

    const result = await api.register({
      email: 'denise@test.com',
      name: 'Denise',
      password: 'correct-pw',
    })

    const ok = await api.changePassword(result.user.id, 'wrong-pw', 'new-pw')
    assert.equal(ok, false)

    // Old password still works
    const login = await api.login('denise@test.com', 'correct-pw')
    assert.ok(login)
  })

  it('changePassword returns false for non-existent id', async () => {
    const { api } = await withAPI()
    const ok = await api.changePassword('00000000-0000-0000-0000-000000000000', 'any', 'new')
    assert.equal(ok, false)
  })

  it('verifyPassword validates hashed passwords', async () => {
    const { api } = await withAPI()

    const hash = (await pg.sql.unsafe(
      `SELECT password FROM "${TABLE}" WHERE email = $1`, ['alice@test.com'],
    ))[0].password as string
    assert.ok(hash.startsWith('scrypt:'))

    const valid = await api.verifyPassword('secure-password-123', hash)
    assert.equal(valid, true)

    const invalid = await api.verifyPassword('wrong-password', hash)
    assert.equal(invalid, false)
  })

  // ═══════════════════════════════════════════════════════════
  // Token management
  // ═══════════════════════════════════════════════════════════

  it('verifyToken validates tokens', async () => {
    const { api } = await withAPI()

    const result = await api.register({
      email: 'frank@test.com',
      name: 'Frank',
      password: 'frank-pw',
    })

    const payload = await api.verifyToken(result.token)
    assert.ok(payload)
    assert.equal(payload!.sub, result.user.id)
    assert.equal(payload!.email, 'frank@test.com')
    assert.equal(payload!.role, 'user')
    assert.ok(payload!.iat)
    assert.ok(payload!.exp)
  })

  it('verifyToken returns null for tampered token', async () => {
    const { api } = await withAPI()
    const result = await api.verifyToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tampered.invalidsig')
    assert.equal(result, null)
  })

  it('refreshToken issues a new valid token', async () => {
    const { api } = await withAPI()

    const result = await api.register({
      email: 'grace@test.com',
      name: 'Grace',
      password: 'grace-pw',
    })

    const refreshed = await api.refreshToken(result.token)
    assert.ok(refreshed)
    assert.equal(refreshed!.split('.').length, 3)

    const payload = await api.verifyToken(refreshed!)
    assert.ok(payload)
    assert.equal(payload!.sub, result.user.id)
    assert.equal(payload!.email, 'grace@test.com')
  })

  it('refreshToken returns null for invalid token', async () => {
    const { api } = await withAPI()
    const result = await api.refreshToken('invalid.token.here')
    assert.equal(result, null)
  })

  // ═══════════════════════════════════════════════════════════
  // ctx.user resolution
  // ═══════════════════════════════════════════════════════════

  it('resolves ctx.user from Authorization header', async () => {
    const { api, ctx } = await withAPI()

    const result = await api.register({
      email: 'heidi@test.com',
      name: 'Heidi',
      password: 'pw',
    })

    // Make a new request with the token
    const req = new Request('http://localhost/', {
      headers: { authorization: `Bearer ${result.token}` },
    })
    const c: Context = { params: {}, query: {}, sql: pg.sql } as unknown as Context
    const mw = userModule as (req: Request, ctx: Context, next: Handler) => Response | Promise<Response>
    await mw(req, c, async (_, c2) => {
      assert.ok(c2.user)
      assert.equal((c2.user as any).email, 'heidi@test.com')
      return new Response('ok')
    })
  })

  it('resolves ctx.user from token cookie', async () => {
    const { api } = await withAPI()

    const result = await api.register({
      email: 'ivan@test.com',
      name: 'Ivan',
      password: 'pw',
    })

    const req = new Request('http://localhost/', {
      headers: { cookie: `token=${result.token}` },
    })
    const c: Context = { params: {}, query: {}, sql: pg.sql } as unknown as Context
    const mw = userModule as (req: Request, ctx: Context, next: Handler) => Response | Promise<Response>
    await mw(req, c, async (_, c2) => {
      assert.ok(c2.user)
      assert.equal((c2.user as any).email, 'ivan@test.com')
      return new Response('ok')
    })
  })

  it('leaves ctx.user undefined when no token', async () => {
    const { ctx } = await withAPI()
    assert.equal(ctx.user, undefined)
  })

  // ═══════════════════════════════════════════════════════════
  // requireRole middleware
  // ═══════════════════════════════════════════════════════════

  it('requireRole passes for matching role', async () => {
    const mw = requireRole('admin')
    const ctx: Context = {
      params: {}, query: {},
      user: { id: '1', role: 'admin' },
    } as unknown as Context
    let called = false
    await mw(new Request('http://localhost/'), ctx, async (_, c2) => {
      called = true
      return new Response('ok')
    })
    assert.equal(called, true)
  })

  it('requireRole blocks for wrong role', async () => {
    const mw = requireRole('admin')
    const ctx: Context = {
      params: {}, query: {},
      user: { id: '1', role: 'user' },
    } as unknown as Context
    const res = await mw(new Request('http://localhost/'), ctx, async (_, c2) => {
      return new Response('ok')
    })
    assert.equal(res.status, 403)
  })

  it('requireRole blocks when no user', async () => {
    const mw = requireRole('admin')
    const ctx: Context = { params: {}, query: {} } as unknown as Context
    const res = await mw(new Request('http://localhost/'), ctx, async (_, c2) => {
      return new Response('ok')
    })
    assert.equal(res.status, 401)
  })

  it('requireRole accepts multiple roles', async () => {
    const mw = requireRole('admin', 'moderator')
    const ctx: Context = {
      params: {}, query: {},
      user: { id: '1', role: 'moderator' },
    } as unknown as Context
    let called = false
    await mw(new Request('http://localhost/'), ctx, async (_, c2) => {
      called = true
      return new Response('ok')
    })
    assert.equal(called, true)
  })
})
