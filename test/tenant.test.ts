import { describe, it, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from '../postgres/index.ts'
import { tenant } from '../tenant/index.ts'
import type { PostgresClient } from '../postgres/types.ts'
import type { TenantModule, TenantContext, FieldDef } from '../tenant/types.ts'

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

describe('tenant BaaS', { skip: !DATABASE_URL }, () => {
  let pg: PostgresClient
  let t: TenantModule
  const usersTable = '__test_tenant_users'

  // Mock user context
  const mockUser = { id: 9999, email: 'test@tenant.test', name: 'Test', role: 'user', created_at: new Date(), updated_at: new Date() }
  let tenantCtx: TenantContext

  function mockCtx(overrides = {}): any {
    return {
      params: {},
      query: {},
      user: mockUser,
      tenant: tenantCtx,
      ...overrides,
    }
  }

  function mockTenantCtx(overrides = {}): any {
    return {
      ...mockCtx({
        tenant: tenantCtx,
        ...overrides,
      }),
    }
  }

  before(async () => {
    pg = postgres({ connection: DATABASE_URL })

    // Create a users table for testing
    await pg.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "${usersTable}" (
        "id" SERIAL PRIMARY KEY,
        "email" TEXT UNIQUE NOT NULL,
        "password" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'user',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    // Ensure test user exists
    const [existing] = await pg.sql`
      SELECT id FROM ${pg.sql(usersTable as any)} WHERE id = ${mockUser.id} LIMIT 1
    `
    if (!existing) {
      await pg.sql`
        INSERT INTO ${pg.sql(usersTable as any)} ("id", "email", "password", "name", "role")
        VALUES (${mockUser.id}, ${mockUser.email}, 'x', ${mockUser.name}, ${mockUser.role})
      `
    }

    t = tenant({ pg, usersTable })
    await t.migrate()
  })

  beforeEach(async () => {
    // Clean system tables
    await pg.sql`DELETE FROM "_user_tables"`
    await pg.sql`DELETE FROM "_tenant_members"`
    await pg.sql`DELETE FROM "_tenants"`
    // Reset tenant context
    tenantCtx = { id: '', name: '', role: '' }
  })

  after(async () => {
    await pg.sql.unsafe(`DROP TABLE IF EXISTS "${usersTable}" CASCADE`)
    await pg.sql.unsafe('DROP TABLE IF EXISTS "_user_tables" CASCADE')
    await pg.sql.unsafe('DROP TABLE IF EXISTS "_tenant_members" CASCADE')
    await pg.sql.unsafe('DROP TABLE IF EXISTS "_tenants" CASCADE')
    pg.close ? await pg.close() : await pg.sql.end({ timeout: 5 })
  })

  // ── Tenant management ─────────────────────────────────

  describe('tenants', () => {
    it('creates a tenant and adds creator as admin', async () => {
      const r = t
      const res = await r.handler()(
        new Request('http://localhost/sys/tenants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Acme Corp' }),
        }),
        mockCtx(),
      )
      assert.equal(res.status, 201)
      const body = await res.json() as any
      assert.ok(body.id)
      assert.equal(body.name, 'Acme Corp')

      // Verify membership
      const [member] = await pg.sql`
        SELECT * FROM "_tenant_members" WHERE tenant_id = ${body.id} AND user_id = ${mockUser.id}
      `
      assert.ok(member)
      assert.equal((member as any).role, 'admin')
      tenantCtx = { id: body.id, name: body.name, role: 'admin' }
    })

    it('lists user tenants', async () => {
      const r = t
      // Create tenant first
      const createRes = await r.handler()(
        new Request('http://localhost/sys/tenants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Org' }),
        }),
        mockCtx(),
      )
      const created = await createRes.json() as any

      const res = await r.handler()(
        new Request('http://localhost/sys/tenants'),
        mockCtx(),
      )
      assert.equal(res.status, 200)
      const list = await res.json() as any[]
      assert.ok(Array.isArray(list))
      assert.ok(list.some((t: any) => t.id === created.id))
      tenantCtx = { id: created.id, name: created.name, role: 'admin' }
    })

    it('rejects create without name', async () => {
      const r = t
      const res = await r.handler()(
        new Request('http://localhost/sys/tenants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
        mockCtx(),
      )
      assert.equal(res.status, 400)
    })
  })

  // ── Table management ──────────────────────────────────

  describe('tables', () => {
    beforeEach(async () => {
      // Create a tenant
      const [t] = await pg.sql`
        INSERT INTO "_tenants" ("name") VALUES ('Test Tenant') RETURNING *
      `
      tenantCtx = { id: (t as any).id, name: (t as any).name, role: 'admin' }
    })

    it('creates a dynamic table', async () => {
      const fields: FieldDef[] = [
        { name: 'title', type: 'string', required: true },
        { name: 'views', type: 'integer', default: 0 },
        { name: 'active', type: 'boolean', default: true },
      ]

      const r = t
      const res = await r.handler()(
        new Request('http://localhost/sys/tables', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: 'articles', label: 'Articles', fields }),
        }),
        mockTenantCtx(),
      )
      assert.equal(res.status, 201)
      const body = await res.json() as any
      assert.equal(body.slug, 'articles')
      assert.equal(body.fields.length, 3)

      // Verify PG table exists
      const check = await pg.sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${`_t_${tenantCtx.id.replace(/-/g, '').slice(0, 8)}_articles`}
        ORDER BY ordinal_position
      `
      const colNames = (check as any[]).map((r: any) => r.column_name)
      assert.ok(colNames.includes('id'))
      assert.ok(colNames.includes('tenant_id'))
      assert.ok(colNames.includes('title'))
      assert.ok(colNames.includes('views'))
      assert.ok(colNames.includes('active'))
    })

    it('rejects duplicate slug', async () => {
      const r = t
      const fields: FieldDef[] = [{ name: 'val', type: 'string' }]

      await r.handler()(
        new Request('http://localhost/sys/tables', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: 'dupe', fields }),
        }),
        mockTenantCtx(),
      )

      const res = await r.handler()(
        new Request('http://localhost/sys/tables', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: 'dupe', fields }),
        }),
        mockTenantCtx(),
      )
      assert.equal(res.status, 409)
    })

    it('rejects reserved slug', async () => {
      const r = t
      const res = await r.handler()(
        new Request('http://localhost/sys/tables', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: 'sys', fields: [] }),
        }),
        mockTenantCtx(),
      )
      assert.equal(res.status, 400)
    })

    it('lists tables', async () => {
      const r = t
      const fields: FieldDef[] = [{ name: 'n', type: 'string' }]
      await r.handler()(
        new Request('http://localhost/sys/tables', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: 'list_test', fields }),
        }),
        mockTenantCtx(),
      )

      const res = await r.handler()(
        new Request('http://localhost/sys/tables'),
        mockTenantCtx(),
      )
      assert.equal(res.status, 200)
      const list = await res.json() as any[]
      assert.ok(list.length >= 1)
    })

    it('deletes a table', async () => {
      const r = t
      const fields: FieldDef[] = [{ name: 'x', type: 'string' }]

      await r.handler()(
        new Request('http://localhost/sys/tables', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: 'delete_me', fields }),
        }),
        mockTenantCtx(),
      )

      const res = await r.handler()(
        new Request('http://localhost/sys/tables/delete_me', { method: 'DELETE' }),
        mockTenantCtx(),
      )
      assert.equal(res.status, 200)

      const [row] = await pg.sql`
        SELECT id FROM "_user_tables" WHERE tenant_id = ${tenantCtx.id} AND slug = 'delete_me' LIMIT 1
      `
      assert.equal(row, undefined)
    })
  })

  // ── Data CRUD ─────────────────────────────────────────

  describe('data CRUD', () => {
    beforeEach(async () => {
      const [t] = await pg.sql`
        INSERT INTO "_tenants" ("name") VALUES ('Data Tenant') RETURNING *
      `
      tenantCtx = { id: (t as any).id, name: (t as any).name, role: 'admin' }

      // Create a table
      const fields: FieldDef[] = [
        { name: 'title', type: 'string', required: true },
        { name: 'body', type: 'text' },
        { name: 'status', type: 'enum', options: ['draft', 'published'] },
      ]
      await pg.sql`
        INSERT INTO "_user_tables" ("tenant_id", "slug", "fields")
        VALUES (${tenantCtx.id}, 'posts', ${fields as any})
      `
      const createSQL = `CREATE TABLE "_t_${tenantCtx.id.replace(/-/g, '').slice(0, 8)}_posts" ("id" SERIAL PRIMARY KEY, "tenant_id" TEXT NOT NULL, "title" TEXT NOT NULL, "body" TEXT DEFAULT NULL, "status" TEXT DEFAULT NULL)`
      await pg.sql.unsafe(createSQL)
    })

    afterEach(async () => {
      await pg.sql.unsafe(`DROP TABLE IF EXISTS "_t_${tenantCtx.id.replace(/-/g, '').slice(0, 8)}_posts" CASCADE`)
    })

    it('creates a row', async () => {
      const r = t
      const res = await r.handler()(
        new Request('http://localhost/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Hello', body: 'World', status: 'draft' }),
        }),
        mockTenantCtx(),
      )
      assert.equal(res.status, 201)
      const body = await res.json() as any
      assert.ok(body.id)
      assert.equal(body.title, 'Hello')
      assert.equal(body.tenant_id, tenantCtx.id)
    })

    it('lists rows with pagination', async () => {
      const r = t
      const name = `_t_${tenantCtx.id.replace(/-/g, '').slice(0, 8)}_posts`

      // Insert 3 rows directly
      await pg.sql`INSERT INTO ${pg.sql(name as any)} ("tenant_id", "title") VALUES (${tenantCtx.id}, 'A')`
      await pg.sql`INSERT INTO ${pg.sql(name as any)} ("tenant_id", "title") VALUES (${tenantCtx.id}, 'B')`
      await pg.sql`INSERT INTO ${pg.sql(name as any)} ("tenant_id", "title") VALUES (${tenantCtx.id}, 'C')`

      const res = await r.handler()(
        new Request('http://localhost/posts?limit=2&offset=0'),
        mockTenantCtx(),
      )
      assert.equal(res.status, 200)
      const body = await res.json() as any
      assert.equal(body.rows.length, 2)
      assert.equal(body.count, 3)
    })

    it('gets a row by id', async () => {
      const r = t
      const name = `_t_${tenantCtx.id.replace(/-/g, '').slice(0, 8)}_posts`
      await pg.sql`INSERT INTO ${pg.sql(name as any)} ("tenant_id", "title") VALUES (${tenantCtx.id}, 'Get Me') RETURNING *`
      const [inserted] = await pg.sql`SELECT * FROM ${pg.sql(name as any)} WHERE title = 'Get Me' LIMIT 1`

      const res = await r.handler()(
        new Request(`http://localhost/posts/${(inserted as any).id}`),
        mockTenantCtx(),
      )
      assert.equal(res.status, 200)
      const body = await res.json() as any
      assert.equal(body.title, 'Get Me')
    })

    it('patches a row', async () => {
      const r = t
      const name = `_t_${tenantCtx.id.replace(/-/g, '').slice(0, 8)}_posts`
      const [inserted] = await pg.sql`INSERT INTO ${pg.sql(name as any)} ("tenant_id", "title") VALUES (${tenantCtx.id}, 'Old') RETURNING *`
      const id = (inserted as any).id

      const res = await r.handler()(
        new Request(`http://localhost/posts/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'New' }),
        }),
        mockTenantCtx(),
      )
      assert.equal(res.status, 200)
      const body = await res.json() as any
      assert.equal(body.title, 'New')
    })

    it('deletes a row', async () => {
      const r = t
      const name = `_t_${tenantCtx.id.replace(/-/g, '').slice(0, 8)}_posts`
      const [inserted] = await pg.sql`INSERT INTO ${pg.sql(name as any)} ("tenant_id", "title") VALUES (${tenantCtx.id}, 'Delete') RETURNING *`
      const id = (inserted as any).id

      const res = await r.handler()(
        new Request(`http://localhost/posts/${id}`, { method: 'DELETE' }),
        mockTenantCtx(),
      )
      assert.equal(res.status, 200)

      const [check] = await pg.sql`SELECT id FROM ${pg.sql(name as any)} WHERE id = ${id} LIMIT 1`
      assert.equal(check, undefined)
    })
  })

  // ── Row-level isolation ────────────────────────────────

  describe('isolation', () => {
    let tenantAId: string
    let tenantBId: string
    let slugA: string
    let slugB: string

    beforeEach(async () => {
      const [a] = await pg.sql`INSERT INTO "_tenants" ("name") VALUES ('Tenant A') RETURNING *`
      const [b] = await pg.sql`INSERT INTO "_tenants" ("name") VALUES ('Tenant B') RETURNING *`
      tenantAId = (a as any).id
      tenantBId = (b as any).id

      slugA = `_t_${tenantAId.replace(/-/g, '').slice(0, 8)}_items`
      slugB = `_t_${tenantBId.replace(/-/g, '').slice(0, 8)}_items`

      // Create same table for both tenants
      await pg.sql.unsafe(`CREATE TABLE "${slugA}" ("id" SERIAL PRIMARY KEY, "tenant_id" TEXT NOT NULL, "val" TEXT DEFAULT NULL)`)
      await pg.sql.unsafe(`CREATE TABLE "${slugB}" ("id" SERIAL PRIMARY KEY, "tenant_id" TEXT NOT NULL, "val" TEXT DEFAULT NULL)`)
      await pg.sql`
        INSERT INTO "_user_tables" ("tenant_id", "slug", "fields") VALUES (${tenantAId}, 'items', '[]')
      `
      await pg.sql`
        INSERT INTO "_user_tables" ("tenant_id", "slug", "fields") VALUES (${tenantBId}, 'items', '[]')
      `

      // Insert data for each tenant
      await pg.sql`INSERT INTO ${pg.sql(slugA as any)} ("tenant_id", "val") VALUES (${tenantAId}, 'A-data')`
      await pg.sql`INSERT INTO ${pg.sql(slugB as any)} ("tenant_id", "val") VALUES (${tenantBId}, 'B-data')`
    })

    afterEach(async () => {
      await pg.sql.unsafe(`DROP TABLE IF EXISTS "${slugA}" CASCADE`)
      await pg.sql.unsafe(`DROP TABLE IF EXISTS "${slugB}" CASCADE`)
    })

    it('tenant A cannot see tenant B data', async () => {
      const r = t
      tenantCtx = { id: tenantAId, name: 'Tenant A', role: 'admin' }

      const res = await r.handler()(
        new Request('http://localhost/items'),
        mockTenantCtx(),
      )
      const body = await res.json() as any
      assert.equal(body.rows.length, 1)
      assert.equal(body.rows[0].val, 'A-data')
    })
  })

  // ── Nested routes ──────────────────────────────────────

  describe('nested routes', () => {
    let tenantId: string
    let parentName: string
    let childName: string

    beforeEach(async () => {
      const [t] = await pg.sql`INSERT INTO "_tenants" ("name") VALUES ('Nested Tenant') RETURNING *`
      tenantId = (t as any).id
      tenantCtx = { id: tenantId, name: 'Nested', role: 'admin' }
      const hash = tenantId.replace(/-/g, '').slice(0, 8)
      parentName = `_t_${hash}_authors`
      childName = `_t_${hash}_books`

      // Create tables
      await pg.sql.unsafe(`CREATE TABLE "${parentName}" ("id" SERIAL PRIMARY KEY, "tenant_id" TEXT NOT NULL, "name" TEXT DEFAULT NULL)`)
      await pg.sql.unsafe(`CREATE TABLE "${childName}" ("id" SERIAL PRIMARY KEY, "tenant_id" TEXT NOT NULL, "author_id" INTEGER DEFAULT NULL, "title" TEXT DEFAULT NULL)`)

      // Register in _user_tables
      await pg.sql`
        INSERT INTO "_user_tables" ("tenant_id", "slug", "fields") VALUES (${tenantId}, 'authors', '[{"name":"name","type":"string"}]')
      `
      await pg.sql`
        INSERT INTO "_user_tables" ("tenant_id", "slug", "fields")
        VALUES (${tenantId}, 'books', '[{"name":"author_id","type":"integer","relation":{"table":"authors"}},{"name":"title","type":"string"}]')
      `
    })

    afterEach(async () => {
      await pg.sql.unsafe(`DROP TABLE IF EXISTS "${parentName}" CASCADE`)
      await pg.sql.unsafe(`DROP TABLE IF EXISTS "${childName}" CASCADE`)
    })

    it('lists nested resources via relation', async () => {
      const r = t
      const [author] = await pg.sql`INSERT INTO ${pg.sql(parentName as any)} ("tenant_id", "name") VALUES (${tenantId}, 'Tolkien') RETURNING *`
      await pg.sql`INSERT INTO ${pg.sql(childName as any)} ("tenant_id", "author_id", "title") VALUES (${tenantId}, ${(author as any).id}, 'LotR')`
      await pg.sql`INSERT INTO ${pg.sql(childName as any)} ("tenant_id", "author_id", "title") VALUES (${tenantId}, ${(author as any).id}, 'The Hobbit')`

      const res = await r.handler()(
        new Request(`http://localhost/authors/${(author as any).id}/books`),
        mockTenantCtx(),
      )
      assert.equal(res.status, 200)
      const body = await res.json() as any
      assert.equal(body.count, 2)
      assert.equal(body.rows.length, 2)
    })

    it('POST nested creates with relation field auto-filled', async () => {
      const r = t
      const [author] = await pg.sql`INSERT INTO ${pg.sql(parentName as any)} ("tenant_id", "name") VALUES (${tenantId}, 'Orwell') RETURNING *`

      const res = await r.handler()(
        new Request(`http://localhost/authors/${(author as any).id}/books`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: '1984' }),
        }),
        mockTenantCtx(),
      )
      assert.equal(res.status, 201)
      const body = await res.json() as any
      assert.ok(body.id)
      assert.equal(body.author_id, (author as any).id)
      assert.equal(body.title, '1984')
    })
  })

  // ── GraphQL ────────────────────────────────────────────

  describe('GraphQL', () => {
    let tenantId: string
    let tableName: string

    beforeEach(async () => {
      const [t] = await pg.sql`INSERT INTO "_tenants" ("name") VALUES ('GraphQL Tenant') RETURNING *`
      tenantId = (t as any).id
      tenantCtx = { id: tenantId, name: 'GraphQL', role: 'admin' }
      const hash = tenantId.replace(/-/g, '').slice(0, 8)
      tableName = `_t_${hash}_gitems`

      await pg.sql.unsafe(`CREATE TABLE "${tableName}" ("id" SERIAL PRIMARY KEY, "tenant_id" TEXT NOT NULL, "label" TEXT DEFAULT NULL, "count" INTEGER DEFAULT NULL)`)
      await pg.sql`
        INSERT INTO "_user_tables" ("tenant_id", "slug", "fields")
        VALUES (${tenantId}, 'gitems', '[{"name":"label","type":"string"},{"name":"count","type":"integer"}]')
      `
      await pg.sql`INSERT INTO ${pg.sql(tableName as any)} ("tenant_id", "label", "count") VALUES (${tenantId}, 'Item A', 10)`
      await pg.sql`INSERT INTO ${pg.sql(tableName as any)} ("tenant_id", "label", "count") VALUES (${tenantId}, 'Item B', 20)`
    })

    afterEach(async () => {
      await pg.sql.unsafe(`DROP TABLE IF EXISTS "${tableName}" CASCADE`)
    })

    it('queries list of items', async () => {
      const gql = t.graphql()
      const res = await gql.handler()(
        new Request('http://localhost/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: '{ gitems { id label count } }' }),
        }),
        mockTenantCtx(),
      )
      assert.equal(res.status, 200)
      const body = await res.json() as any
      assert.equal(body.data.gitems.length, 2)
    })

    it('creates an item via mutation', async () => {
      const gql = t.graphql()
      const res = await gql.handler()(
        new Request('http://localhost/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'mutation ($data: CreateGitemsInput!) { createGitems(data: $data) { id label count } }',
            variables: { data: { label: 'New Item', count: 5 } },
          }),
        }),
        mockTenantCtx(),
      )
      assert.equal(res.status, 200)
      const body = await res.json() as any
      assert.ok(body.data.createGitems.id)
      assert.equal(body.data.createGitems.label, 'New Item')
      assert.equal(body.data.createGitems.count, 5)
    })
  })

  // ── Middleware ──────────────────────────────────────────

  describe('middleware', () => {
    let ownedTenantId: string

    beforeEach(async () => {
      const [t] = await pg.sql`INSERT INTO "_tenants" ("name") VALUES ('MW Tenant') RETURNING *`
      ownedTenantId = (t as any).id
      await pg.sql`
        INSERT INTO "_tenant_members" ("tenant_id", "user_id", "role")
        VALUES (${ownedTenantId}, ${mockUser.id}, 'member')
      `
    })

    it('sets ctx.tenant for a user with single tenant', async () => {
      const mw = t.middleware()
      let captured: any = null
      const res = await mw(
        new Request('http://localhost/'),
        { params: {}, query: {}, user: mockUser } as any,
        (_req: any, ctx: any) => { captured = ctx.tenant; return new Response('ok') },
      )
      assert.equal(res.status, 200)
      assert.ok(captured)
      assert.equal(captured.id, ownedTenantId)
    })

    it('returns 401 without user', async () => {
      const mw = t.middleware()
      const res = await mw(
        new Request('http://localhost/'),
        { params: {}, query: {} } as any,
        () => new Response('ok'),
      )
      assert.equal(res.status, 401)
    })

    it('returns 403 if user has no tenants', async () => {
      const mw = t.middleware()
      const res = await mw(
        new Request('http://localhost/'),
        { params: {}, query: {}, user: { id: 7777 } } as any,
        () => new Response('ok'),
      )
      assert.equal(res.status, 403)
    })
  })
})
