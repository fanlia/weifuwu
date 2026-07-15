/**
 * Base — dynamic data storage engine for weifuwu.
 *
 * Each "base" is a collection of user-defined tables with fixed physical slots
 * (text001..064, number001..032, etc.) mapped via a column_map.
 *
 * Depends on `postgres()` and `user()` middleware registered first.
 *
 * ```ts
 * import { serve, Router, postgres, user, base } from 'weifuwu'
 *
 * const app = new Router()
 * app.use(postgres())
 * app.use(user())
 * app.use(base())
 *
 * app.post('/api/bases', async (req, ctx) => {
 *   const b = await ctx.base.create(await req.json())
 *   return Response.json(b, { status: 201 })
 * })
 * ```
 */

import type { Context, Handler, SqlClient } from '../types.ts'
import type {
  BaseAPI,
  BaseDef,
  BaseOptions,
  TableSchema,
  FieldSchema,
  FieldType,
  ColumnMap,
  CreateBaseInput,
  UpdateBaseInput,
  QueryOptions,
} from './types.ts'

// ═══════════════════════════════════════════════════════════════
// Slot configuration
// ═══════════════════════════════════════════════════════════════

interface SlotRange {
  prefix: string
  count: number
}

const SLOTS: Record<string, SlotRange> = {
  text:   { prefix: 'text',   count: 64 },
  number: { prefix: 'number', count: 32 },
  date:   { prefix: 'date',   count: 8 },
  vector: { prefix: 'vector', count: 4 },
  search: { prefix: 'search', count: 4 },
}

const TYPE_TO_SLOT: Record<string, string> = {
  string:   'text',
  text:     'text',
  number:   'number',
  boolean:  'text',    // stored as 'true'/'false' in text
  date:     'date',
  datetime: 'date',
  vector:   'vector',
  search:   'search',
  relation: 'text',    // stores UUID
  json:     'ext',
}

// ═══════════════════════════════════════════════════════════════
// Query defaults
// ═══════════════════════════════════════════════════════════════

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function q(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function slugify(name: string): string {
  return name.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'untitled'
}

function getSql(ctx: Context): SqlClient {
  const sql = (ctx as Record<string, unknown>).sql as SqlClient | undefined
  if (!sql) throw new Error('base() requires postgres() middleware')
  return sql
}

function currentUserId(ctx: Context): string {
  const u = (ctx as Record<string, unknown>).user as Record<string, unknown> | undefined
  if (!u?.id) throw new Error('base() requires user() middleware')
  return u.id as string
}

function now(): Date {
  return new Date()
}

function normalizeValue(val: unknown): unknown {
  if (val === undefined) return null
  if (typeof val === 'boolean') return val ? 'true' : 'false'
  if (Array.isArray(val)) return JSON.stringify(val)
  if (typeof val === 'object' && val !== null) return JSON.stringify(val)
  return val
}

// ═══════════════════════════════════════════════════════════════
// Row mapping
// ═══════════════════════════════════════════════════════════════

function toBaseDef(row: Record<string, unknown>): BaseDef {
  let tables: TableSchema[] = []
  const raw = row.tables
  if (typeof raw === 'string') {
    try { tables = JSON.parse(raw) } catch {}
  } else if (Array.isArray(raw)) {
    tables = raw as TableSchema[]
  }
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    description: row.description as string | null,
    tables,
    created_by: row.created_by as string,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  }
}

// ═══════════════════════════════════════════════════════════════
// Base implementation
// ═══════════════════════════════════════════════════════════════

export class Base {
  private migrated = false
  hasVector = false
  readonly managementSchema: string
  readonly usersTable: string

  constructor(opts?: BaseOptions) {
    this.managementSchema = opts?.managementSchema ?? 'public'
    this.usersTable = opts?.usersTable ?? 'users'
  }

  private ms(name: string): string {
    return `${q(this.managementSchema)}.${q(name)}`
  }

  // ── Migration ──────────────────────────────────────────────

  async migrate(sql: SqlClient): Promise<void> {
    if (this.migrated) return

    // Management tables
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${this.ms('base_bases')} (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        TEXT NOT NULL,
        slug        TEXT NOT NULL UNIQUE,
        description TEXT,
        tables      JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_by  UUID NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${this.ms('base_column_map')} (
        base_id     UUID NOT NULL,
        table_name  TEXT NOT NULL,
        field_name  TEXT NOT NULL,
        field_type  TEXT NOT NULL,
        physical    TEXT NOT NULL,
        config      JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (base_id, table_name, field_name),
        UNIQUE (base_id, table_name, physical)
      )
    `)

    // Data rows table with fixed slots
    const textCols = Array.from({ length: SLOTS.text.count }, (_, i) =>
      `text${String(i + 1).padStart(3, '0')} TEXT`)
    const numCols = Array.from({ length: SLOTS.number.count }, (_, i) =>
      `number${String(i + 1).padStart(3, '0')} DOUBLE PRECISION`)
    const dateCols = Array.from({ length: SLOTS.date.count }, (_, i) =>
      `date${String(i + 1).padStart(3, '0')} TIMESTAMPTZ`)
    // Vector columns - check if pgvector is available
    let hasVector = false
    try {
      const extRows = await sql.unsafe(`SELECT 1 FROM pg_extension WHERE extname = 'vector'`) as unknown as Record<string, unknown>[]
      hasVector = extRows.length > 0
    } catch {}
    const vectorCols = hasVector
      ? Array.from({ length: SLOTS.vector.count }, (_, i) =>
          `vector${String(i + 1).padStart(3, '0')} VECTOR(1536)`)
      : []
    const searchCols = Array.from({ length: SLOTS.search.count }, (_, i) =>
      `search${String(i + 1).padStart(3, '0')} TEXT`)

    const allCols = [...textCols, ...numCols, ...dateCols, ...vectorCols, ...searchCols]
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${this.ms('base_data')} (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        base_id     UUID NOT NULL,
        table_name  TEXT NOT NULL,
        ${allCols.join(',\n        ')},
        ext         JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS base_data_base_table_idx
        ON ${this.ms('base_data')} (base_id, table_name)
    `)

    // Vector companion table (only if pgvector is available)
    if (hasVector) {
      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS ${this.ms('base_vectors')} (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          base_id     UUID NOT NULL,
          table_name  TEXT NOT NULL,
          field_name  TEXT NOT NULL,
          row_id      UUID NOT NULL,
          embedding   VECTOR(1536) NOT NULL,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await sql.unsafe(`
        CREATE INDEX IF NOT EXISTS base_vectors_lookup_idx
          ON ${this.ms('base_vectors')} (base_id, table_name, field_name)
      `)
    }

    // Search companion table
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${this.ms('base_search')} (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        base_id     UUID NOT NULL,
        table_name  TEXT NOT NULL,
        field_name  TEXT NOT NULL,
        row_id      UUID NOT NULL,
        content     TEXT NOT NULL,
        tsv         TSVECTOR NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS base_search_tsv_idx
        ON ${this.ms('base_search')} USING GIN (tsv)
    `)
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS base_search_lookup_idx
        ON ${this.ms('base_search')} (base_id, table_name, field_name)
    `)

    this.migrated = true
    this.hasVector = hasVector
  }

  private async ensureMigrated(sql: SqlClient): Promise<void> {
    if (!this.migrated) await this.migrate(sql)
  }

  // ── Slot allocator ─────────────────────────────────────────

  private async allocateSlot(
    sql: SqlClient, baseId: string, tableName: string, fieldType: string,
  ): Promise<string> {
    const slotGroup = TYPE_TO_SLOT[fieldType]
    if (!slotGroup || slotGroup === 'ext') {
      return 'ext'
    }

    const range = SLOTS[slotGroup]
    if (!range) return 'ext'

    // Find used slots for this table
    const used = await sql.unsafe(
      `SELECT physical FROM ${this.ms('base_column_map')}
       WHERE base_id = $1 AND table_name = $2 AND physical LIKE $3`,
      [baseId, tableName, `${range.prefix}%`],
    ) as unknown as Record<string, unknown>[]

    const usedSet = new Set(used.map(r => r.physical as string))

    // Find first available slot
    for (let i = 1; i <= range.count; i++) {
      const candidate = `${range.prefix}${String(i).padStart(3, '0')}`
      if (!usedSet.has(candidate)) {
        return candidate
      }
    }

    return 'ext' // overflow to JSONB
  }

  // ── Physical column type ───────────────────────────────────

  private physicalType(slotName: string, fieldType: string): string {
    if (slotName.startsWith('text') || slotName.startsWith('search')) {
      // search fields store text content + TSVECTOR is in companion
      return 'text'
    }
    if (slotName.startsWith('number')) return 'number'
    if (slotName.startsWith('date')) return 'date'
    if (slotName.startsWith('vector')) return 'vector'
    return 'jsonb'
  }

  // ── Get column map for a table ─────────────────────────────

  private async getColumnMap(sql: SqlClient, baseId: string, tableName: string): Promise<ColumnMap[]> {
    const rows = await sql.unsafe(
      `SELECT field_name, field_type, physical
       FROM ${this.ms('base_column_map')}
       WHERE base_id = $1 AND table_name = $2
       ORDER BY physical`,
      [baseId, tableName],
    ) as unknown as Record<string, unknown>[]
    return rows.map(r => ({
      field_name: r.field_name as string,
      physical: r.physical as string,
      field_type: r.field_type as FieldType,
    }))
  }

  // ── Convert data row to field/value pairs ──────────────────

  private splitFields(colMap: ColumnMap[], data: Record<string, unknown>): {
    slotValues: Record<string, unknown>
    extValues: Record<string, unknown>
  } {
    const slotValues: Record<string, unknown> = {}
    const extValues: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(data)) {
      if (key === 'id') continue
      if (value === undefined) continue
      const mapping = colMap.find(m => m.field_name === key)
      if (mapping && mapping.physical !== 'ext') {
        slotValues[mapping.physical] = value
      } else {
        extValues[key] = value
      }
    }

    return { slotValues, extValues }
  }

  // ── Convert row to field/value pairs (reverse) ─────────────

  private reconstructRow(colMap: ColumnMap[], row: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...row }

    // Map physical columns back to field names
    for (const m of colMap) {
      if (m.physical !== 'ext') {
        if (m.physical in result) {
          let val = result[m.physical]
          // Convert types back
          if (m.field_type === 'boolean') {
            val = val === 'true' || val === true
          } else if (m.field_type === 'number') {
            if (typeof val === 'string') val = parseFloat(val)
          }
          result[m.field_name] = val
          delete result[m.physical]
        }
      }
    }

    // Merge ext values (may be string from \$N::jsonb or parsed object)
    if (result.ext) {
      let extData = result.ext
      if (typeof extData === 'string') {
        try { extData = JSON.parse(extData as string) } catch { extData = {} }
      }
      if (typeof extData === 'object' && extData !== null) {
        for (const [k, v] of Object.entries(extData as Record<string, unknown>)) {
          result[k] = v
        }
      }
    }
    delete result.ext

    return result
  }

  // ── Build WHERE clause from filter ─────────────────────────

  private buildFilter(colMap: ColumnMap[], filter: Record<string, unknown>): {
    conditions: string[]
    values: unknown[]
  } {
    const conditions: string[] = []
    const values: unknown[] = []
    let idx = 1

    for (const [key, val] of Object.entries(filter)) {
      const mapping = colMap.find(m => m.field_name === key)
      if (mapping && mapping.physical !== 'ext') {
        conditions.push(`${q(mapping.physical)} = $${idx++}`)
        values.push(val)
      } else {
        conditions.push(`ext @> $${idx++}::jsonb`)
        values.push(JSON.stringify({ [key]: val }))
      }
    }

    return { conditions, values }
  }

  // ── Per-request bound API ──────────────────────────────────

  bind(ctx: Context): BaseAPI {
    const self = this
    const sql = getSql(ctx)

    if (!this.migrated) {
      this.migrate(sql).catch(() => {})
    }

    // ── Helpers ───────────────────────────────────────────

    async function ensureBase(baseId: string): Promise<Record<string, unknown>> {
      const [row] = await sql.unsafe(
        `SELECT * FROM ${self.ms('base_bases')} WHERE id = $1 LIMIT 1`, [baseId],
      ) as unknown as Record<string, unknown>[]
      if (!row) throw new Error('Base not found')
      return row
    }

    return {
      // ── Create ──────────────────────────────────────────

      async create(input: CreateBaseInput) {
        const userId = currentUserId(ctx)
        await self.ensureMigrated(sql)

        const slug = input.slug || slugify(input.name)

        // Insert base
        const tables = input.tables || []
        const [baseRow] = await sql.unsafe(`
          INSERT INTO ${self.ms('base_bases')} (name, slug, description, tables, created_by)
          VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING *
        `, [input.name, slug, input.description ?? null, JSON.stringify(tables), userId],
        ) as unknown as Record<string, unknown>[]

        // Create column maps for each table
        for (const table of tables) {
          for (const [fieldName, fieldSchema] of Object.entries(table.fields)) {
            const physical = await self.allocateSlot(sql, baseRow.id as string, table.name, fieldSchema.type)
            await sql.unsafe(`
              INSERT INTO ${self.ms('base_column_map')} (base_id, table_name, field_name, field_type, physical, config)
              VALUES ($1, $2, $3, $4, $5, $6::jsonb)
            `, [baseRow.id, table.name, fieldName, fieldSchema.type, physical, JSON.stringify(fieldSchema)])
          }
        }

        return toBaseDef(baseRow)
      },

      // ── List ────────────────────────────────────────────

      async list() {
        await self.ensureMigrated(sql)
        const rows = await sql.unsafe(
          `SELECT * FROM ${self.ms('base_bases')} ORDER BY created_at DESC`,
        ) as unknown as Record<string, unknown>[]
        return rows.map(toBaseDef)
      },

      // ── Get ─────────────────────────────────────────────

      async get(id: string) {
        await self.ensureMigrated(sql)
        const [row] = await sql.unsafe(
          `SELECT * FROM ${self.ms('base_bases')} WHERE id = $1 LIMIT 1`, [id],
        ) as unknown as Record<string, unknown>[]
        return row ? toBaseDef(row) : null
      },

      async getBySlug(slug: string) {
        await self.ensureMigrated(sql)
        const [row] = await sql.unsafe(
          `SELECT * FROM ${self.ms('base_bases')} WHERE slug = $1 LIMIT 1`, [slug],
        ) as unknown as Record<string, unknown>[]
        return row ? toBaseDef(row) : null
      },

      // ── Update ──────────────────────────────────────────

      async update(id: string, input: UpdateBaseInput) {
        await self.ensureMigrated(sql)
        const sets: string[] = []
        const values: unknown[] = []
        let idx = 1
        if (input.name !== undefined) { sets.push(`name = $${idx++}`); values.push(input.name) }
        if (input.description !== undefined) { sets.push(`description = $${idx++}`); values.push(input.description) }
        if (sets.length === 0) return null
        sets.push('updated_at = NOW()')
        values.push(id)
        const [row] = await sql.unsafe(
          `UPDATE ${self.ms('base_bases')} SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, values,
        ) as unknown as Record<string, unknown>[]
        return row ? toBaseDef(row) : null
      },

      // ── Delete ──────────────────────────────────────────

      async delete(id: string) {
        await self.ensureMigrated(sql)
        const [base] = await sql.unsafe(`SELECT id FROM ${self.ms('base_bases')} WHERE id = $1 LIMIT 1`, [id]) as unknown as Record<string, unknown>[]
        if (!base) return false
        // Clean up data, column maps, companion tables
        await sql.unsafe(`DELETE FROM ${self.ms('base_data')} WHERE base_id = $1`, [id])
        await sql.unsafe(`DELETE FROM ${self.ms('base_vectors')} WHERE base_id = $1`, [id])
        await sql.unsafe(`DELETE FROM ${self.ms('base_search')} WHERE base_id = $1`, [id])
        await sql.unsafe(`DELETE FROM ${self.ms('base_column_map')} WHERE base_id = $1`, [id])
        await sql.unsafe(`DELETE FROM ${self.ms('base_bases')} WHERE id = $1`, [id])
        return true
      },

      // ── Define table ─────────────────────────────────────

      async defineTable(baseId: string, schema: TableSchema) {
        await self.ensureMigrated(sql)
        const baseRow = await ensureBase(baseId)

        // Check for duplicate table name
        const tables: TableSchema[] = Array.isArray(baseRow.tables) ? baseRow.tables as TableSchema[] : []
        if (tables.some(t => t.name === schema.name)) {
          throw new Error(`Table "${schema.name}" already exists`)
        }

        // Create column maps
        for (const [fieldName, fieldSchema] of Object.entries(schema.fields)) {
          const physical = await self.allocateSlot(sql, baseId, schema.name, fieldSchema.type)
          await sql.unsafe(`
            INSERT INTO ${self.ms('base_column_map')} (base_id, table_name, field_name, field_type, physical, config)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          `, [baseId, schema.name, fieldName, fieldSchema.type, physical, JSON.stringify(fieldSchema)])
        }

        // Update base metadata
        const newTables = [...tables, schema]
        const [row] = await sql.unsafe(
          `UPDATE ${self.ms('base_bases')} SET tables = $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING *`,
          [JSON.stringify(newTables), baseId],
        ) as unknown as Record<string, unknown>[]

        return toBaseDef(row)
      },

      // ── Update table ─────────────────────────────────────

      async updateTable(baseId: string, tableName: string, schema: TableSchema) {
        await self.ensureMigrated(sql)
        const baseRow = await ensureBase(baseId)
        const tables: TableSchema[] = Array.isArray(baseRow.tables) ? baseRow.tables as TableSchema[] : []
        const idx = tables.findIndex(t => t.name === tableName)
        if (idx === -1) throw new Error(`Table "${tableName}" not found`)

        const existing = tables[idx]
        const existingFields = Object.keys(existing.fields)
        const newFields = Object.keys(schema.fields)

        // Add new fields
        for (const [fieldName, fieldSchema] of Object.entries(schema.fields)) {
          if (!existingFields.includes(fieldName)) {
            const physical = await self.allocateSlot(sql, baseId, tableName, fieldSchema.type)
            await sql.unsafe(`
              INSERT INTO ${self.ms('base_column_map')} (base_id, table_name, field_name, field_type, physical, config)
              VALUES ($1, $2, $3, $4, $5, $6::jsonb)
              ON CONFLICT (base_id, table_name, field_name) DO UPDATE SET field_type = $4, config = $6::jsonb
            `, [baseId, tableName, fieldName, fieldSchema.type, physical, JSON.stringify(fieldSchema)])
          }
        }

        // Update base metadata
        const newTables = [...tables]
        newTables[idx] = schema
        const [row] = await sql.unsafe(
          `UPDATE ${self.ms('base_bases')} SET tables = $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING *`,
          [JSON.stringify(newTables), baseId],
        ) as unknown as Record<string, unknown>[]

        return toBaseDef(row)
      },

      // ── Remove table ─────────────────────────────────────

      async removeTable(baseId: string, tableName: string) {
        await self.ensureMigrated(sql)
        const baseRow = await ensureBase(baseId)
        const tables: TableSchema[] = Array.isArray(baseRow.tables) ? baseRow.tables as TableSchema[] : []
        if (!tables.some(t => t.name === tableName)) return null

        // Delete data and metadata
        await sql.unsafe(`DELETE FROM ${self.ms('base_data')} WHERE base_id = $1 AND table_name = $2`, [baseId, tableName])
        await sql.unsafe(`DELETE FROM ${self.ms('base_vectors')} WHERE base_id = $1 AND table_name = $2`, [baseId, tableName])
        await sql.unsafe(`DELETE FROM ${self.ms('base_search')} WHERE base_id = $1 AND table_name = $2`, [baseId, tableName])
        await sql.unsafe(`DELETE FROM ${self.ms('base_column_map')} WHERE base_id = $1 AND table_name = $2`, [baseId, tableName])

        const newTables = tables.filter(t => t.name !== tableName)
        const [row] = await sql.unsafe(
          `UPDATE ${self.ms('base_bases')} SET tables = $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING *`,
          [JSON.stringify(newTables), baseId],
        ) as unknown as Record<string, unknown>[]

        return toBaseDef(row)
      },

      // ── Insert ──────────────────────────────────────────

      async insert(baseId, table, data) {
        await self.ensureMigrated(sql)
        await ensureBase(baseId)
        const colMap = await self.getColumnMap(sql, baseId, table)
        const { slotValues, extValues } = self.splitFields(colMap, data)

        // Build column list and values
        const cols: string[] = ['base_id', 'table_name']
        const vals: unknown[] = [baseId, table]
        let idx = 3

        for (const [phys, val] of Object.entries(slotValues)) {
          cols.push(q(phys))
          vals.push(normalizeValue(val))
        }

        cols.push('ext')
        vals.push(JSON.stringify(extValues))

        const placeholders = vals.map((_, i) => `$${i + 1}`)
        const [row] = await sql.unsafe(`
          INSERT INTO ${self.ms('base_data')} (${cols.join(', ')})
          VALUES (${placeholders.join(', ')})
          RETURNING *
        `, vals) as unknown as Record<string, unknown>[]

        // Handle companion writes
        for (const [fieldName, val] of Object.entries(data)) {
          if (fieldName === 'id') continue
          const mapping = colMap.find(m => m.field_name === fieldName)
          if (!mapping) continue

          if (mapping.field_type === 'vector' && Array.isArray(val) && self.hasVector) {
            await sql.unsafe(`
              INSERT INTO ${self.ms('base_vectors')} (base_id, table_name, field_name, row_id, embedding)
              VALUES ($1, $2, $3, $4, $5::vector)
              ON CONFLICT DO NOTHING
            `, [baseId, table, fieldName, row.id, JSON.stringify(val)])
          }

          if (mapping.field_type === 'search' && typeof val === 'string') {
            await sql.unsafe(`
              INSERT INTO ${self.ms('base_search')} (base_id, table_name, field_name, row_id, content, tsv)
              VALUES ($1, $2, $3, $4, $5, to_tsvector('simple', $5))
              ON CONFLICT DO NOTHING
            `, [baseId, table, fieldName, row.id, val])
          }
        }

        return self.reconstructRow(colMap, row) as Record<string, unknown> & { id: string }
      },

      // ── Get row ──────────────────────────────────────────

      async getRow(baseId, table, id) {
        await self.ensureMigrated(sql)
        const colMap = await self.getColumnMap(sql, baseId, table)
        const [row] = await sql.unsafe(
          `SELECT * FROM ${self.ms('base_data')} WHERE base_id = $1 AND table_name = $2 AND id = $3 LIMIT 1`,
          [baseId, table, id],
        ) as unknown as Record<string, unknown>[]
        if (!row) return null
        return self.reconstructRow(colMap, row) as Record<string, unknown> & { id: string }
      },

      // ── Update row ───────────────────────────────────────

      async updateRow(baseId, table, id, data) {
        await self.ensureMigrated(sql)
        const colMap = await self.getColumnMap(sql, baseId, table)
        const { slotValues, extValues } = self.splitFields(colMap, data)

        const sets: string[] = ['updated_at = NOW()']
        const vals: unknown[] = []
        let idx = 1

        for (const [phys, val] of Object.entries(slotValues)) {
          sets.push(`${q(phys)} = $${idx++}`)
          vals.push(normalizeValue(val))
        }

        if (Object.keys(extValues).length > 0) {
          // For ext, we merge with existing via jsonb concatenation
          sets.push(`ext = ext || $${idx++}::jsonb`)
          vals.push(JSON.stringify(extValues))
        }

        if (sets.length === 1) {
          // Nothing to update besides updated_at
          return null
        }

        vals.push(baseId, table, id)
        const [row] = await sql.unsafe(`
          UPDATE ${self.ms('base_data')} SET ${sets.join(', ')}
          WHERE base_id = $${idx} AND table_name = $${idx + 1} AND id = $${idx + 2}
          RETURNING *
        `, [...vals, baseId, table, id]) as unknown as Record<string, unknown>[]

        if (!row) return null
        return self.reconstructRow(colMap, row) as Record<string, unknown> & { id: string }
      },

      // ── Delete row ───────────────────────────────────────

      async deleteRow(baseId, table, id) {
        await self.ensureMigrated(sql)
        // Clean companion tables
        await sql.unsafe(`DELETE FROM ${self.ms('base_vectors')} WHERE base_id = $1 AND table_name = $2 AND row_id = $3`, [baseId, table, id])
        await sql.unsafe(`DELETE FROM ${self.ms('base_search')} WHERE base_id = $1 AND table_name = $2 AND row_id = $3`, [baseId, table, id])
        const [row] = await sql.unsafe(
          `DELETE FROM ${self.ms('base_data')} WHERE base_id = $1 AND table_name = $2 AND id = $3 RETURNING id`,
          [baseId, table, id],
        ) as unknown as Record<string, unknown>[]
        return !!row
      },

      // ── Query ────────────────────────────────────────────

      async query(baseId, table, opts) {
        await self.ensureMigrated(sql)
        const colMap = await self.getColumnMap(sql, baseId, table)
        const limit = Math.min(opts?.limit ?? DEFAULT_LIMIT, MAX_LIMIT)
        const offset = opts?.offset ?? 0
        const sortCol = opts?.sort ? (colMap.find(m => m.field_name === opts.sort)?.physical || opts.sort) : 'created_at'
        const sortOrder = opts?.order === 'desc' ? 'DESC' : 'ASC'

        const conditions: string[] = ['base_id = $1', 'table_name = $2']
        const values: unknown[] = [baseId, table]

        if (opts?.filter) {
          const { conditions: fc, values: fv } = self.buildFilter(colMap, opts.filter)
          conditions.push(...fc)
          values.push(...fv)
        }

        const where = conditions.join(' AND ')
        const paramIdx = values.length + 1
        const rows = await sql.unsafe(`
          SELECT * FROM ${self.ms('base_data')}
          WHERE ${where}
          ORDER BY ${q(sortCol)} ${sortOrder}
          LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
        `, [...values, limit, offset]) as unknown as Record<string, unknown>[]

        // Reconstruct rows
        const result = rows.map(r => self.reconstructRow(colMap, r))

        // Handle includes
        if (opts?.include && opts.include.length > 0) {
          // Collect relation IDs
          const relMap: Record<string, Set<string>> = {}
          for (const inc of opts.include) {
            relMap[inc] = new Set()
          }
          for (const row of result as Record<string, unknown>[]) {
            for (const inc of opts.include) {
              const val = row[inc]
              if (val && typeof val === 'string') relMap[inc].add(val)
            }
          }

          // Batch load relations
          for (const inc of opts.include) {
            const mapping = colMap.find(m => m.field_name === inc)
            if (!mapping || !mapping.field_type.startsWith('relation')) continue

            const ids = [...relMap[inc]]
            if (ids.length === 0) continue

            // The target table and optional field are encoded as 'relation:target_table:display_field'
            // Or from the config stored in column_map
            // Simpler approach: just store the target table in the field type
            // For now, we skip full relation resolution and just leave the IDs
          }
        }

        return result as (Record<string, unknown> & { id: string })[]
      },

      // ── Vector similarity search ─────────────────────────

      async similaritySearch(baseId, table, field, vector, opts) {
        await self.ensureMigrated(sql)
        if (!self.hasVector) throw new Error('pgvector extension is not installed')
        const limit = opts?.limit ?? 10

        const rows = await sql.unsafe(`
          SELECT bd.*, bv.embedding <=> $1::vector AS distance
          FROM ${self.ms('base_vectors')} bv
          JOIN ${self.ms('base_data')} bd ON bd.id = bv.row_id
          WHERE bv.base_id = $2 AND bv.table_name = $3 AND bv.field_name = $4
          ORDER BY distance ASC
          LIMIT $5
        `, [JSON.stringify(vector), baseId, table, field, limit]) as unknown as Record<string, unknown>[]

        const colMap = await self.getColumnMap(sql, baseId, table)
        return rows.map(r => ({
          ...self.reconstructRow(colMap, r),
          distance: r.distance as number,
        })) as (Record<string, unknown> & { id: string; distance: number })[]
      },

      // ── Full-text search ─────────────────────────────────

      async search(baseId, table, field, query, opts) {
        await self.ensureMigrated(sql)
        const limit = opts?.limit ?? 10
        const offset = opts?.offset ?? 0

        const rows = await sql.unsafe(`
          SELECT bd.*,
                 ts_rank(bs.tsv, plainto_tsquery('simple', $1)) AS rank,
                 ts_headline('simple', bs.content, plainto_tsquery('simple', $1),
                   'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20') AS headline
          FROM ${self.ms('base_search')} bs
          JOIN ${self.ms('base_data')} bd ON bd.id = bs.row_id
          WHERE bs.base_id = $2 AND bs.table_name = $3 AND bs.field_name = $4
            AND bs.tsv @@ plainto_tsquery('simple', $1)
          ORDER BY rank DESC
          LIMIT $5 OFFSET $6
        `, [query, baseId, table, field, limit, offset]) as unknown as Record<string, unknown>[]

        const colMap = await self.getColumnMap(sql, baseId, table)
        return rows.map(r => ({
          ...self.reconstructRow(colMap, r),
          rank: r.rank as number,
          headline: r.headline as string,
        })) as (Record<string, unknown> & { id: string; rank: number; headline?: string })[]
      },
    }
  }

  // ── Middleware ─────────────────────────────────────────────

  async middleware(req: Request, ctx: Context, next: Handler): Promise<Response> {
    ctx.base = this.bind(ctx)
    return next(req, ctx)
  }
}
