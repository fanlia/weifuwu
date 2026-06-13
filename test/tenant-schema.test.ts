import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import type { FieldDef } from '../tenant/types.ts'

// Test the pure SQL-generation functions from tenant/schema.ts
describe('tenant schema (SQL generation)', () => {
  let createTableSQL: typeof import('../tenant/schema.ts').createTableSQL
  let addColumnSQL: typeof import('../tenant/schema.ts').addColumnSQL
  let dropTableSQL: typeof import('../tenant/schema.ts').dropTableSQL
  let createIndexesSQL: typeof import('../tenant/schema.ts').createIndexesSQL

  before(async () => {
    const mod = await import('../tenant/schema.ts')
    createTableSQL = mod.createTableSQL
    addColumnSQL = mod.addColumnSQL
    dropTableSQL = mod.dropTableSQL
    createIndexesSQL = mod.createIndexesSQL
  })

  const tenantId = 't_abc123'

  it('createTableSQL generates CREATE TABLE with all column types', () => {
    const fields: FieldDef[] = [
      { name: 'name', type: 'text', required: true },
      { name: 'age', type: 'integer' },
      { name: 'score', type: 'float' },
      { name: 'active', type: 'boolean', default: true },
      { name: 'tags', type: 'json' },
    ]

    const sql = createTableSQL(tenantId, 'users', fields)

    assert.ok(sql.includes('CREATE TABLE'), 'should be CREATE TABLE')
    assert.ok(sql.includes('"id" SERIAL PRIMARY KEY'), 'should have id column')
    assert.ok(sql.includes('"tenant_id" TEXT NOT NULL'), 'should have tenant_id')
    assert.ok(sql.includes('"name"'), 'should include name field')
    assert.ok(sql.includes('NOT NULL'), 'required field should be NOT NULL')
    assert.ok(sql.includes('"age" INTEGER'), 'integer type')
    assert.ok(sql.includes('"score" DOUBLE PRECISION'), 'float type')
    assert.ok(sql.includes('"active" BOOLEAN DEFAULT true'), 'boolean with default (lowercase true)')
    assert.ok(sql.includes('"tags" JSONB'), 'json type maps to JSONB')
  })

  it('createTableSQL includes UNIQUE constraint', () => {
    const fields: FieldDef[] = [
      { name: 'email', type: 'text', unique: true },
    ]

    const sql = createTableSQL(tenantId, 'contacts', fields)
    assert.ok(sql.includes('UNIQUE'), 'should include UNIQUE')
    assert.ok(sql.includes('"email" TEXT UNIQUE'))
  })

  it('createTableSQL includes foreign key (relation)', () => {
    const fields: FieldDef[] = [
      { name: 'org_id', type: 'integer', relation: { table: 'organizations', field: 'id' } },
    ]

    const sql = createTableSQL(tenantId, 'members', fields)
    assert.ok(sql.includes('REFERENCES'), 'should include REFERENCES')
    // internalTableName formats as: _t_<tenantId>_<slug>
    assert.ok(sql.includes('"_t_t_abc123_organizations"'), 'relation table name with tenant prefix')
    assert.ok(sql.includes('ON DELETE RESTRICT'), 'default onDelete')
  })

  it('createTableSQL includes relation with custom onDelete', () => {
    const fields: FieldDef[] = [
      { name: 'user_id', type: 'integer', relation: { table: 'users', onDelete: 'cascade' } },
    ]

    const sql = createTableSQL(tenantId, 'posts', fields)
    assert.ok(sql.includes('ON DELETE CASCADE'))
  })

  it('createTableSQL uses DEFAULT for text field', () => {
    const fields: FieldDef[] = [
      { name: 'status', type: 'text', default: 'active' },
    ]

    const sql = createTableSQL(tenantId, 'items', fields)
    assert.ok(sql.includes("DEFAULT 'active'"))
  })

  it('createTableSQL handles vector type', () => {
    const fields: FieldDef[] = [
      { name: 'embedding', type: 'vector', dimensions: 384 },
    ]

    const sql = createTableSQL(tenantId, 'docs', fields)
    assert.ok(sql.includes('vector(384)'), 'vector with dimensions')
  })

  it('createTableSQL handles enum type', () => {
    const fields: FieldDef[] = [
      { name: 'priority', type: 'enum', options: ['low', 'medium', 'high'] },
    ]

    const sql = createTableSQL(tenantId, 'tickets', fields)
    assert.ok(sql.includes('TEXT'), 'enum stored as TEXT')
    // Enum is stored as TEXT without CHECK constraint at DB level
    assert.ok(sql.includes('"priority" TEXT'), 'enum stored as TEXT')
    assert.ok(!sql.includes('CHECK'), 'no CHECK constraint for enum')
  })

  it('addColumnSQL generates ALTER TABLE ADD COLUMN', () => {
    const field: FieldDef = { name: 'description', type: 'text' }
    const sql = addColumnSQL(tenantId, 'users', field)
    assert.ok(sql.includes('ALTER TABLE'), 'should be ALTER TABLE')
    assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS'))
    assert.ok(sql.includes('"description" TEXT'))
  })

  it('dropTableSQL generates DROP TABLE', () => {
    const sql = dropTableSQL(tenantId, 'temp_data')
    assert.ok(sql.includes('DROP TABLE IF EXISTS'))
    assert.ok(sql.includes('CASCADE'))
  })

  describe('createIndexesSQL', () => {
    it('creates tenant and ID indexes for every table', () => {
      const indexes = createIndexesSQL(tenantId, 'items', [])
      assert.ok(indexes.some(i => i.includes('_tenant_idx')))
      assert.ok(indexes.some(i => i.includes('_tenant_id_idx')))
    })

    it('creates unique index for unique fields', () => {
      const fields: FieldDef[] = [
        { name: 'slug', type: 'text', unique: true },
      ]
      const indexes = createIndexesSQL(tenantId, 'pages', fields)
      assert.ok(indexes.some(i => i.includes('UNIQUE') && i.includes('slug')))
    })

    it('creates HNSW index for vector fields with hnsw index', () => {
      const fields: FieldDef[] = [
        { name: 'vec', type: 'vector', dimensions: 128, index: 'hnsw' },
      ]
      const indexes = createIndexesSQL(tenantId, 'embeddings', fields)
      assert.ok(indexes.some(i => i.includes('hnsw') && i.includes('vec')))
    })

    it('creates GIN index for json fields', () => {
      const fields: FieldDef[] = [
        { name: 'metadata', type: 'json', index: 'gin' },
      ]
      const indexes = createIndexesSQL(tenantId, 'events', fields)
      assert.ok(indexes.some(i => i.includes('GIN') && i.includes('metadata')))
    })

    it('creates DESC index', () => {
      const fields: FieldDef[] = [
        { name: 'created_at', type: 'text', index: 'desc' },
      ]
      const indexes = createIndexesSQL(tenantId, 'logs', fields)
      assert.ok(indexes.some(i => i.includes('DESC') && i.includes('created_at')))
    })

    it('creates relation index for relation fields', () => {
      const fields: FieldDef[] = [
        { name: 'author_id', type: 'integer', relation: { table: 'users' } },
      ]
      const indexes = createIndexesSQL(tenantId, 'posts', fields)
      assert.ok(indexes.some(i => i.includes('rel_idx') && i.includes('author_id')))
    })
  })
})
