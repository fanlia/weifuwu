import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { permissions } from '../permissions.ts'
import { postgres } from '../postgres/index.ts'
import { Router } from '../router.ts'

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

describe('permissions', { skip: !DATABASE_URL }, () => {
  let pg: ReturnType<typeof postgres>
  let perm: ReturnType<typeof permissions>

  before(async () => {
    pg = postgres({ connection: DATABASE_URL })
    perm = permissions({ pg: pg as any })
    await perm.migrate()
  })

  after(async () => {
    await pg.sql`DROP TABLE IF EXISTS "_role_permissions" CASCADE`
    await pg.sql`DROP TABLE IF EXISTS "_user_roles" CASCADE`
    await pg.sql`DROP TABLE IF EXISTS "_roles" CASCADE`
    await pg.close()
  })

  // ── Role management ──

  it('assignRole creates role and assigns it', async () => {
    await perm.assignRole(1, 'admin')
    const roles = await perm.getUserRoles(1)
    assert.ok(roles.includes('admin'))
  })

  it('assignRole is idempotent', async () => {
    await perm.assignRole(1, 'admin')
    await perm.assignRole(1, 'admin')
    const roles = await perm.getUserRoles(1)
    const count = roles.filter(r => r === 'admin').length
    assert.equal(count, 1)
  })

  it('removeRole removes a role', async () => {
    await perm.assignRole(2, 'editor')
    await perm.removeRole(2, 'editor')
    const roles = await perm.getUserRoles(2)
    assert.ok(!roles.includes('editor'))
  })

  it('getUserRoles returns empty array for user with no roles', async () => {
    const roles = await perm.getUserRoles(999)
    assert.deepEqual(roles, [])
  })

  // ── Permission management ──

  it('grantPermission grants a permission to a role', async () => {
    await perm.grantPermission('admin', 'posts:create')
    await perm.grantPermission('admin', 'posts:edit')
    await perm.grantPermission('admin', 'posts:delete')
  })

  it('grantPermission is idempotent', async () => {
    await perm.grantPermission('admin', 'posts:create')
    await perm.grantPermission('admin', 'posts:create')
    // Should not throw
  })

  it('revokePermission removes a permission from a role', async () => {
    await perm.grantPermission('temp-role', 'temp:perm')
    await perm.revokePermission('temp-role', 'temp:perm')
  })

  it('getUserPermissions aggregates permissions from all roles', async () => {
    await perm.assignRole(1, 'editor')
    await perm.grantPermission('editor', 'posts:read')
    await perm.grantPermission('editor', 'posts:create')

    const perms = await perm.getUserPermissions(1)
    assert.ok(perms.includes('posts:create'))
    assert.ok(perms.includes('posts:edit'))
    assert.ok(perms.includes('posts:delete'))
    assert.ok(perms.includes('posts:read'))
  })

  it('getUserPermissions returns empty array for user with no permissions', async () => {
    const perms = await perm.getUserPermissions(999)
    assert.deepEqual(perms, [])
  })

  // ── Middleware ──

  it('injects ctx.roles and ctx.permissions for authenticated user', async () => {
    const app = new Router()

    app.use((req, ctx, next) => {
      (ctx as any).user = { id: 1 }
      return next(req, ctx)
    })

    app.use(perm)

    app.get('/test', async (req, ctx) => {
      assert.ok(ctx.roles instanceof Set)
      assert.ok(ctx.permissions instanceof Set)
      assert.ok(ctx.roles.has('admin'))
      assert.ok(ctx.roles.has('editor'))
      assert.ok(ctx.permissions.has('posts:create'))
      return Response.json({ ok: true })
    })

    const res = await app.handler()(
      new Request('http://localhost/test'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('injects empty sets when no user', async () => {
    const app = new Router()
    app.use(perm)

    app.get('/test', async (req, ctx) => {
      assert.equal(ctx.roles.size, 0)
      assert.equal(ctx.permissions.size, 0)
      return Response.json({ ok: true })
    })

    const res = await app.handler()(
      new Request('http://localhost/test'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  // ── Guard middleware ──

  it('requireRole passes when user has the role', async () => {
    const app = new Router()
    app.use((req, ctx, next) => { (ctx as any).user = { id: 1 }; return next(req, ctx) })
    app.use(perm)

    app.get('/admin', perm.requireRole('admin'), async () => {
      return Response.json({ ok: true })
    })

    const res = await app.handler()(
      new Request('http://localhost/admin'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('requireRole rejects when user lacks the role', async () => {
    const app = new Router()
    app.use((req, ctx, next) => { (ctx as any).user = { id: 3 }; return next(req, ctx) })
    app.use(perm)

    app.get('/admin', perm.requireRole('admin'), async () => {
      return Response.json({ ok: true })
    })

    const res = await app.handler()(
      new Request('http://localhost/admin'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 403)
  })

  it('requireRole accepts multiple roles (any match)', async () => {
    const app = new Router()
    app.use((req, ctx, next) => { (ctx as any).user = { id: 1 }; return next(req, ctx) })
    app.use(perm)

    app.get('/mod', perm.requireRole('moderator', 'admin'), async () => {
      return Response.json({ ok: true })
    })

    const res = await app.handler()(
      new Request('http://localhost/mod'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('requirePermission passes when user has the permission', async () => {
    const app = new Router()
    app.use((req, ctx, next) => { (ctx as any).user = { id: 1 }; return next(req, ctx) })
    app.use(perm)

    app.post('/posts', perm.requirePermission('posts:create'), async () => {
      return Response.json({ ok: true })
    })

    const res = await app.handler()(
      new Request('http://localhost/posts', { method: 'POST' }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('requirePermission rejects when user lacks permission', async () => {
    const app = new Router()
    app.use((req, ctx, next) => { (ctx as any).user = { id: 3 }; return next(req, ctx) })
    app.use(perm)

    app.post('/posts', perm.requirePermission('posts:create'), async () => {
      return Response.json({ ok: true })
    })

    const res = await app.handler()(
      new Request('http://localhost/posts', { method: 'POST' }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 403)
  })

  it('wildcard permission grants all access', async () => {
    await perm.grantPermission('superadmin', '*')
    await perm.assignRole(4, 'superadmin')

    const app = new Router()
    app.use((req, ctx, next) => { (ctx as any).user = { id: 4 }; return next(req, ctx) })
    app.use(perm)

    app.delete('/anything', perm.requirePermission('anything:delete'), async () => {
      return Response.json({ ok: true })
    })

    const res = await app.handler()(
      new Request('http://localhost/anything', { method: 'DELETE' }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  // ── Cleanup test data ──

  it('migrate is safe to call multiple times', async () => {
    await perm.migrate()
    await perm.migrate()
  })
})
