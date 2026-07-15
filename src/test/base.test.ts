import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from '../postgres/index.ts'
import { user } from '../user/index.ts'
import { base } from '../base/index.ts'
import type { Context, Handler } from '../types.ts'

const TEST_SECRET = 'test-secret-for-base'

describe('base module', () => {
  const pg = postgres()
  const userMw = user({ secret: TEST_SECRET })

  async function withCtx(): Promise<{
    api: import('../base/types.ts').BaseAPI
    userId: string
  }> {
    const uid = Math.random().toString(36).slice(2, 8)
    const email = `base_${uid}@test.com`

    const userCtx: Context = { params: {}, query: {}, sql: pg.sql } as unknown as Context
    const mwUser = userMw as (req: Request, ctx: Context, next: Handler) => Response | Promise<Response>
    let userId = ''
    await mwUser(new Request('http://localhost/'), userCtx, async (_, c2) => {
      const u = await c2.userModule.register({ email, name: `User_${uid}`, password: 'pw' })
      userId = u.user.id
      return new Response('ok')
    })

    const c: Context = {
      params: {}, query: {},
      sql: pg.sql,
      user: { id: userId, name: `User_${uid}`, email, role: 'admin' },
    } as unknown as Context
    let api!: import('../base/types.ts').BaseAPI
    const mwBase = base() as (req: Request, ctx: Context, next: Handler) => Response | Promise<Response>
    await mwBase(new Request('http://localhost/'), c, async (_, c2) => {
      api = c2.base
      return new Response('ok')
    })

    return { api, userId }
  }

  after(async () => {
    // Clean up all base tables
    await pg.sql.unsafe(`DROP TABLE IF EXISTS public.base_search CASCADE`)
    await pg.sql.unsafe(`DROP TABLE IF EXISTS public.base_vectors CASCADE`)
    await pg.sql.unsafe(`DROP TABLE IF EXISTS public.base_data CASCADE`)
    await pg.sql.unsafe(`DROP TABLE IF EXISTS public.base_column_map CASCADE`)
    await pg.sql.unsafe(`DROP TABLE IF EXISTS public.base_bases CASCADE`)
    await pg.close()
  })

  // ═══════════════════════════════════════════════════════════
  // Create base
  // ═══════════════════════════════════════════════════════════

  it('creates a base with tables', async () => {
    const { api } = await withCtx()
    const b = await api.create({
      name: 'CRM',
      tables: [
        {
          name: 'contacts',
          fields: {
            name: { type: 'string', required: true },
            email: { type: 'string', unique: true },
            age: { type: 'number' },
            score: { type: 'number' },
            is_active: { type: 'boolean' },
            bio: { type: 'search' },
            avatar: { type: 'vector', dimensions: 1536 },
            notes: { type: 'json' },
          },
        },
        {
          name: 'orders',
          fields: {
            amount: { type: 'number' },
            status: { type: 'string', enum: ['pending', 'paid'] },
          },
        },
      ],
    })

    assert.ok(b.id)
    assert.equal(b.name, 'CRM')
    assert.equal(b.tables.length, 2)
    assert.equal(b.tables[0].name, 'contacts')
  })

  // ═══════════════════════════════════════════════════════════
  // List / Get
  // ═══════════════════════════════════════════════════════════

  it('lists all bases', async () => {
    const { api } = await withCtx()
    const bases = await api.list()
    assert.ok(bases.length >= 1)
    assert.ok(bases.some(b => b.name === 'CRM'))
  })

  it('gets a base by id', async () => {
    const { api } = await withCtx()
    const list = await api.list()
    const b = await api.get(list[0].id)
    assert.ok(b)
    assert.equal(b!.id, list[0].id)
  })

  it('gets a base by slug', async () => {
    const { api } = await withCtx()
    const b = await api.getBySlug('crm')
    assert.ok(b)
    assert.equal(b!.name, 'CRM')
  })

  // ═══════════════════════════════════════════════════════════
  // Table management
  // ═══════════════════════════════════════════════════════════

  it('defines a new table', async () => {
    const { api } = await withCtx()
    const crm = await api.getBySlug('crm')
    assert.ok(crm)

    const updated = await api.defineTable(crm!.id, {
      name: 'products',
      fields: {
        title: { type: 'string' },
        price: { type: 'number' },
      },
    })

    assert.equal(updated.tables.length, 3)
    assert.ok(updated.tables.some(t => t.name === 'products'))
  })

  it('throws on duplicate table', async () => {
    const { api } = await withCtx()
    const crm = await api.getBySlug('crm')
    assert.ok(crm)
    await assert.rejects(
      () => api.defineTable(crm!.id, {
        name: 'contacts',
        fields: { name: { type: 'string' } },
      }),
    )
  })

  it('removes a table', async () => {
    const { api } = await withCtx()
    const crm = await api.getBySlug('crm')
    assert.ok(crm)

    const updated = await api.removeTable(crm!.id, 'products')
    assert.ok(updated)
    assert.equal(updated!.tables.length, 2)
  })

  // ═══════════════════════════════════════════════════════════
  // CRUD data
  // ═══════════════════════════════════════════════════════════

  let crmId: string

  async function ensureCrmId(api: import('../base/types.ts').BaseAPI): Promise<string> {
    if (crmId) return crmId
    const crm = await api.getBySlug('crm')
    if (crm) { crmId = crm.id; return crmId }
    // Create the base if it doesn't exist (e.g., running in isolation)
    const b = await api.create({
      name: 'CRM',
      tables: [
        { name: 'contacts', fields: {
          name: { type: 'string', required: true },
          email: { type: 'string', unique: true },
          age: { type: 'number' },
          score: { type: 'number' },
          is_active: { type: 'boolean' },
          bio: { type: 'search' },
          avatar: { type: 'vector', dimensions: 1536 },
          notes: { type: 'json' },
        }},
        { name: 'orders', fields: {
          amount: { type: 'number' },
          status: { type: 'string', enum: ['pending', 'paid'] },
        }},
      ],
    })
    crmId = b.id
    return crmId
  }

  it('inserts a row', async () => {
    const { api } = await withCtx()
    const cid = await ensureCrmId(api)
    const row = await api.insert(cid, 'contacts', {
      name: 'Alice',
      email: 'alice@test.com',
      age: 30,
      score: 95.5,
      is_active: true,
      bio: 'Hello world, this is Alice!',
      notes: { hobby: 'reading' },
    })

    assert.ok(row.id)
    assert.equal(row.name, 'Alice')
    assert.equal(row.email, 'alice@test.com')
    assert.equal(row.age, 30)
    assert.equal(row.score, 95.5)
    assert.equal(row.is_active, true)
    assert.deepEqual(row.notes, { hobby: 'reading' })
  })

  it('gets a row by id', async () => {
    const { api } = await withCtx()
    const cid = await ensureCrmId(api)
    const rows = await api.query(cid, 'contacts', { limit: 1 })
    assert.ok(rows.length > 0)

    const row = await api.getRow(cid, 'contacts', rows[0].id)
    assert.ok(row)
    assert.equal(row!.id, rows[0].id)
  })

  it('queries with filter', async () => {
    const { api } = await withCtx()
    const cid = await ensureCrmId(api)
    const rows = await api.query(cid, 'contacts', {
      filter: { email: 'alice@test.com' },
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].name, 'Alice')
  })

  it('queries with sorting and pagination', async () => {
    const { api } = await withCtx()
    const cid = await ensureCrmId(api)
    const rows = await api.query(cid, 'contacts', {
      sort: 'created_at',
      order: 'desc',
      limit: 10,
      offset: 0,
    })
    assert.ok(Array.isArray(rows))
  })

  it('updates a row', async () => {
    const { api } = await withCtx()
    const cid = await ensureCrmId(api)
    const rows = await api.query(cid, 'contacts', { limit: 1 })
    assert.ok(rows.length > 0)

    const updated = await api.updateRow(cid, 'contacts', rows[0].id, {
      name: 'Alice Updated',
      score: 100,
    })
    assert.ok(updated)
    assert.equal(updated!.name, 'Alice Updated')
    assert.equal(updated!.score, 100)
  })

  it('deletes a row', async () => {
    const { api } = await withCtx()
    const cid = await ensureCrmId(api)
    const row = await api.insert(cid, 'contacts', {
      name: 'Temp',
      email: `temp_${Date.now()}@test.com`,
    })

    const deleted = await api.deleteRow(cid, 'contacts', row.id)
    assert.equal(deleted, true)

    const found = await api.getRow(cid, 'contacts', row.id)
    assert.equal(found, null)
  })

  // ═══════════════════════════════════════════════════════════
  // Vector search
  // ═══════════════════════════════════════════════════════════

  it('performs vector similarity search', async () => {
    const { api } = await withCtx()
    const cid = await ensureCrmId(api)
    // Insert a row with vector (stored in ext since pgvector may not be installed)
    const row1 = await api.insert(cid, 'contacts', {
      name: 'Vector Alice',
      email: 'valice@test.com',
      avatar: [0.1, 0.2],
    })
    await api.insert(cid, 'contacts', {
      name: 'Vector Bob',
      email: 'vbob@test.com',
      avatar: [0.9, 0.8],
    })

    // If pgvector is not installed, similaritySearch will throw
    try {
      const results = await api.similaritySearch(cid, 'contacts', 'avatar', [0.11, 0.21])
      assert.ok(results.length >= 1)
    } catch (e) {
      // pgvector not available — skip assertion
      assert.ok((e as Error).message.includes('pgvector extension'))
    }
  })

  // ═══════════════════════════════════════════════════════════
  // Full-text search
  // ═══════════════════════════════════════════════════════════

  it('performs full-text search', async () => {
    const { api } = await withCtx()
    const cid = await ensureCrmId(api)
    const results = await api.search(cid, 'contacts', 'bio', 'hello')
    assert.ok(results.length >= 1)
    assert.ok(results.some(r => (r.name as string).includes('Alice')))
    assert.ok(typeof results[0].rank === 'number')
  })

  // ═══════════════════════════════════════════════════════════
  // Delete base
  // ═══════════════════════════════════════════════════════════

  it('deletes a base', async () => {
    const { api } = await withCtx()
    const b = await api.create({ name: 'To Delete' })
    assert.ok(b.id)

    const deleted = await api.delete(b.id)
    assert.equal(deleted, true)

    const found = await api.get(b.id)
    assert.equal(found, null)
  })

  it('returns false when deleting non-existent base', async () => {
    const { api } = await withCtx()
    const result = await api.delete('00000000-0000-0000-0000-000000000000')
    assert.equal(result, false)
  })

  // ═══════════════════════════════════════════════════════════
  // Error cases
  // ═══════════════════════════════════════════════════════════

  it('throws when ctx.user is missing', async () => {
    const c: Context = { params: {}, query: {}, sql: pg.sql } as unknown as Context
    const mwBase = base() as (req: Request, ctx: Context, next: Handler) => Response | Promise<Response>
    await mwBase(new Request('http://localhost/'), c, async (_, c2) => {
      await assert.rejects(
        () => c2.base.create({ name: 'No User' }),
      )
      return new Response('ok')
    })
  })
})
