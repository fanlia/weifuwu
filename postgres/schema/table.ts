import type { Sql } from '../../vendor.ts'
import { ColumnBuilder, toDDL, type PartitionByDef } from './columns.ts'
import { SQL } from './sql.ts'
import { and } from './where.ts'

/** Options for table index creation. */
export interface IndexOptions {
  /** Whether the index should be UNIQUE. */
  unique?: boolean
  /** Index type: btree (default), hnsw (pgvector), gin (JSONB). */
  type?: 'btree' | 'hnsw' | 'gin'
  /** Create index in DESC order. */
  desc?: boolean
  /** Custom operator class (e.g. `vector_cosine_ops`). */
  operator?: string
}

/** Options for CREATE TABLE. */
export interface CreateOptions {
  /** Partition by clause (RANGE, LIST, or HASH). */
  partitionBy?: PartitionByDef
}

/** Options for find/read queries. */
export interface FindOptions {
  /** ORDER BY clause: `{ column: 'asc' | 'desc' }`. */
  orderBy?: Record<string, 'asc' | 'desc'>
  /** LIMIT. */
  limit?: number
  /** OFFSET. */
  offset?: number
  /** Columns to SELECT (default: all). */
  select?: string[]
  /** Include soft-deleted rows (also sets `withDeleted` context). */
  withDeleted?: boolean
}

interface ColEntry {
  prop: string
  db: string
  auto: boolean
  column: ColumnBuilder<unknown>
}

/**
 * Type-safe table schema + CRUD operations.
 *
 * Create an instance with {@link pgTable}, then call `.bind(sql)` to get a
 * `BoundTable` for running queries.
 *
 * ```ts
 * const users = pgTable('users', {
 *   id: serial('id').primaryKey(),
 *   name: text('name').notNull(),
 *   email: text('email').unique(),
 * })
 *
 * const db = users.bind(sql)
 * await db.create()
 * await db.insert({ name: 'Alice', email: 'a@b.com' })
 * const row = await db.findBy({ email: 'a@b.com' })
 * ```
 */
export class Table<R extends Record<string, unknown>> {
  /** Database table name. */
  readonly tableName: string
  /** All column builders (order-preserving). */
  readonly columns: ColumnBuilder<unknown>[]
  /** Column builders keyed by property name. */
  readonly builders: Record<string, ColumnBuilder<unknown>>
  private colEntries: ColEntry[]

  constructor(tableName: string, builders: Record<string, ColumnBuilder<unknown>>) {
    this.tableName = tableName
    this.builders = builders
    this.columns = Object.values(builders)
    this.colEntries = Object.entries(builders).map(([prop, col]) => ({
      prop,
      db: col.name,
      auto: col.isAutoGenerate,
      column: col,
    }))
  }

  /** Check if the table has a column with the given DB name. */
  hasColumn(dbName: string): boolean {
    return this.colEntries.some(e => e.db === dbName)
  }

  /**
   * Bind this table schema to a SQL connection, returning a `BoundTable`
   * that can run queries without passing `sql` to every call.
   */
  bind(sql: Sql<{}>): BoundTable<R> {
    return new BoundTable(sql, this.tableName, this.builders)
  }

  /** Returns the primary key column name (DB name), or 'id' as fallback. */
  private get pkColumn(): string {
    const entry = this.colEntries.find(e => e.column.isPrimaryKey)
    return entry ? entry.db : 'id'
  }

  /** Adds `deleted_at IS NULL` condition if the table has soft delete and not explicitly excluded. */
  private _softDeleteFilter(where: unknown, opts?: FindOptions): string | null {
    if (!this.hasColumn('deleted_at')) return null
    if (opts?.withDeleted) return null
    // If user explicitly filters by deleted_at, don't add our own
    if (where && typeof where === 'object' && !Array.isArray(where) && !(where instanceof SQL)) {
      if ('deleted_at' in (where as Record<string, unknown>)) return null
    }
    return '"deleted_at" IS NULL'
  }

  async create(sql: Sql<{}>, opts?: CreateOptions): Promise<void> {
    const colDDL = this.columns.map(toDDL)
    let ddl = `CREATE TABLE IF NOT EXISTS "${this.tableName}" (\n  ${colDDL.join(',\n  ')}\n)`
    if (opts?.partitionBy) {
      ddl += ` PARTITION BY ${opts.partitionBy.type} ("${opts.partitionBy.column}")`
    }
    await sql.unsafe(ddl)
  }

  async drop(sql: Sql<{}>, opts?: { cascade?: boolean }): Promise<void> {
    const cascade = opts?.cascade ? ' CASCADE' : ''
    await sql.unsafe(`DROP TABLE IF EXISTS "${this.tableName}"${cascade}`)
  }

  async createIndex(sql: Sql<{}>, columns: string | string[], opts?: IndexOptions): Promise<void> {
    const cols = Array.isArray(columns) ? columns : [columns]
    const name = `"${this.tableName}_${cols.join('_')}${opts?.unique ? '_uidx' : '_idx'}"`
    const unique = opts?.unique ? 'UNIQUE' : ''
    const using = opts?.type ? `USING ${opts.type.toUpperCase()}` : ''
    const colList = cols.map(c => opts?.desc ? `"${c}" DESC` : `"${c}"`).join(', ')
    const operator = opts?.operator ? ` ${opts.operator}` : ''

    const ddl = `CREATE ${unique} INDEX IF NOT EXISTS ${name} ON "${this.tableName}" ${using} (${colList}${operator})`.replace(/\s+/g, ' ')
    await sql.unsafe(ddl)
  }

  async createUniqueIndex(sql: Sql<{}>, columns: string | string[]): Promise<void> {
    await this.createIndex(sql, columns, { unique: true })
  }

  // --- Private helpers ---

  private _buildConditions(where: Partial<R> | SQL | SQL[] | undefined, startIndex: number): { conditions: string[]; values: unknown[] } {
    const conditions: string[] = []
    const values: unknown[] = []

    let w = where
    if (Array.isArray(w)) {
      w = w.length > 0 ? and(...w) : undefined
    }

    if (w instanceof SQL) {
      let fragment = ''
      for (let i = 0; i < w.strings.length; i++) {
        fragment += w.strings[i]
        if (i < w.values.length) {
          fragment += `$${startIndex + values.length + 1}`
          values.push(w.values[i])
        }
      }
      conditions.push(fragment)
    } else {
      for (const [prop, value] of Object.entries(w || {}) as [string, unknown][]) {
        if (value === undefined) continue
        const entry = this.colEntries.find(e => e.prop === prop)
        const db = entry ? entry.db : prop
        conditions.push(`"${db}" = $${startIndex + values.length + 1}`)
        values.push(value)
      }
    }

    return { conditions, values }
  }

  private _buildSET(data: Partial<R>): { sets: string[]; values: unknown[] } {
    const sets: string[] = []
    const values: unknown[] = []

    const d = data as Record<string, unknown>
    for (const { prop, db } of this.colEntries) {
      if (prop in d && d[prop] !== undefined) {
        const val = d[prop]
        if (val instanceof SQL) {
          sets.push(`"${db}" = ${val.toSQL()}`)
        } else {
          sets.push(`"${db}" = $${sets.length + 1}`)
          values.push(val)
        }
      }
    }

    if (this.hasColumn('updated_at') && !d.updated_at) {
      sets.push('"updated_at" = NOW()')
    }

    return { sets, values }
  }

  // --- CRUD ---

  async insert(sql: Sql<{}>, data: Partial<R>): Promise<R> {
    const filtered: Record<string, unknown> = {}
    for (const { prop, db, auto } of this.colEntries) {
      if (auto) continue
      const val = (data as Record<string, unknown>)[prop]
      if (val !== undefined) {
        filtered[db] = val
      }
    }
    const [row] = await sql`
      INSERT INTO ${sql(this.tableName as string)} ${sql(filtered as any)} RETURNING *
    `
    return row as unknown as R
  }

  async insertMany(sql: Sql<{}>, data: Partial<R>[]): Promise<R[]> {
    const filtered: Record<string, unknown>[] = []
    for (const item of data) {
      const row: Record<string, unknown> = {}
      for (const { prop, db, auto } of this.colEntries) {
        if (auto) continue
        const val = (item as Record<string, unknown>)[prop]
        if (val !== undefined) {
          row[db] = val
        }
      }
      filtered.push(row)
    }
    const rows = await sql`
      INSERT INTO ${sql(this.tableName as string)} ${sql(filtered as any)} RETURNING *
    `
    return rows as unknown as R[]
  }

  async read(sql: Sql<{}>, id: string | number, opts?: Pick<FindOptions, 'select' | 'withDeleted'>): Promise<R | undefined> {
    const pk = this.pkColumn
    const columns = opts?.select?.length ? opts.select.map(c => `"${c}"`).join(', ') : '*'
    const softDel = this._softDeleteFilter(null, opts)
    const extraAnd = softDel ? ` AND ${softDel}` : ''

    const [row] = await sql.unsafe(
      `SELECT ${columns} FROM "${this.tableName}" WHERE "${pk}" = $1${extraAnd} LIMIT 1`,
      [id],
    )
    return (row as unknown as R) ?? undefined
  }

  async readMany(sql: Sql<{}>, where?: Partial<R> | SQL | SQL[], opts?: FindOptions): Promise<{ count: number; data: R[] }> {
    const { conditions, values } = this._buildConditions(where, 0)

    const softDel = this._softDeleteFilter(where, opts)
    if (softDel) conditions.push(softDel)

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''

    const [countRow] = await sql.unsafe(`SELECT COUNT(*) AS _total FROM "${this.tableName}"${whereClause}`, values as any[])
    const count = Number((countRow as Record<string, number>)._total)

    if (conditions.length === 0 && !opts?.orderBy && !opts?.limit && !opts?.offset && !opts?.select) {
      const rows = await sql`SELECT * FROM ${sql(this.tableName as string)}`
      return { count, data: rows as unknown as R[] }
    }

    const columns = opts?.select?.length ? opts.select.map(c => `"${c}"`).join(', ') : '*'
    let query = `SELECT ${columns} FROM "${this.tableName}"${whereClause}`
    if (opts?.orderBy) {
      const orders = Object.entries(opts.orderBy)
        .map(([prop, dir]) => {
          const entry = this.colEntries.find(e => e.prop === prop)
          return `"${entry?.db || prop}" ${dir.toUpperCase()}`
        })
        .join(', ')
      query += ` ORDER BY ${orders}`
    }
    if (opts?.limit) query += ` LIMIT ${opts.limit}`
    if (opts?.offset) query += ` OFFSET ${opts.offset}`

    const rows = await sql.unsafe(query, values as any[])
    return { count, data: rows as unknown as R[] }
  }

  async update(sql: Sql<{}>, id: string | number, data: Partial<R>): Promise<R | undefined> {
    const { sets, values: setValues } = this._buildSET(data)
    if (sets.length === 0) return undefined

    const pk = this.pkColumn
    const [row] = await sql.unsafe(
      `UPDATE "${this.tableName}" SET ${sets.join(', ')} WHERE "${pk}" = $${setValues.length + 1} RETURNING *`,
      [...setValues, id] as any[],
    )
    return (row as unknown as R) ?? undefined
  }

  async updateMany(sql: Sql<{}>, where: Partial<R> | SQL | SQL[], data: Partial<R>): Promise<number> {
    const { sets, values: setValues } = this._buildSET(data)
    if (sets.length === 0) return 0

    const { conditions: wConditions, values: wValues } = this._buildConditions(where, setValues.length)
    if (wConditions.length === 0) return 0

    const rows = await sql.unsafe(
      `UPDATE "${this.tableName}" SET ${sets.join(', ')} WHERE ${wConditions.join(' AND ')} RETURNING 1`,
      [...setValues, ...wValues] as any[],
    )
    return rows.length
  }

  async delete(sql: Sql<{}>, id: string | number): Promise<R | undefined> {
    const pk = this.pkColumn
    if (this.hasColumn('deleted_at')) {
      const [row] = await sql.unsafe(
        `UPDATE "${this.tableName}" SET "deleted_at" = NOW() WHERE "${pk}" = $1 RETURNING *`,
        [id],
      )
      return (row as unknown as R) ?? undefined
    }
    const [row] = await sql.unsafe(
      `DELETE FROM "${this.tableName}" WHERE "${pk}" = $1 RETURNING *`,
      [id],
    )
    return (row as unknown as R) ?? undefined
  }

  async hardDelete(sql: Sql<{}>, id: string | number): Promise<R | undefined> {
    const pk = this.pkColumn
    const [row] = await sql.unsafe(
      `DELETE FROM "${this.tableName}" WHERE "${pk}" = $1 RETURNING *`,
      [id],
    )
    return (row as unknown as R) ?? undefined
  }

  async deleteMany(sql: Sql<{}>, where: Partial<R> | SQL | SQL[]): Promise<number> {
    const { conditions, values } = this._buildConditions(where, 0)
    if (conditions.length === 0) return 0

    if (this.hasColumn('deleted_at')) {
      const rows = await sql.unsafe(
        `UPDATE "${this.tableName}" SET "deleted_at" = NOW() WHERE ${conditions.join(' AND ')} RETURNING 1`,
        values as any[],
      )
      return rows.length
    }

    const rows = await sql.unsafe(
      `DELETE FROM "${this.tableName}" WHERE ${conditions.join(' AND ')} RETURNING 1`,
      values as any[],
    )
    return rows.length
  }

  async hardDeleteMany(sql: Sql<{}>, where: Partial<R> | SQL | SQL[]): Promise<number> {
    const { conditions, values } = this._buildConditions(where, 0)
    if (conditions.length === 0) return 0

    const rows = await sql.unsafe(
      `DELETE FROM "${this.tableName}" WHERE ${conditions.join(' AND ')} RETURNING 1`,
      values as any[],
    )
    return rows.length
  }

  async upsert(sql: Sql<{}>, data: Partial<R>, conflict: string | string[]): Promise<R> {
    const filtered: Record<string, unknown> = {}
    for (const { prop, db, auto } of this.colEntries) {
      if (auto) continue
      const val = (data as Record<string, unknown>)[prop]
      if (val !== undefined) {
        filtered[db] = val
      }
    }

    const keys = Object.keys(filtered)
    if (keys.length === 0) throw new Error('upsert: no data to insert')

    const conflictCols = Array.isArray(conflict) ? conflict : [conflict]
    const dbCols = keys.map(c => `"${c}"`)
    const placeholders = keys.map((_, i) => `$${i + 1}`)
    const updateSet = keys
      .filter(k => !conflictCols.includes(k))
      .map(k => `"${k}" = EXCLUDED."${k}"`)
      .join(', ')

    if (!updateSet) {
      const [row] = await sql.unsafe(
        `INSERT INTO "${this.tableName}" (${dbCols.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (${conflictCols.map(c => `"${c}"`).join(', ')}) DO NOTHING RETURNING *`,
        Object.values(filtered) as any[],
      )
      return (row as unknown as R) ?? undefined as unknown as R
    }

    const [row] = await sql.unsafe(
      `INSERT INTO "${this.tableName}" (${dbCols.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (${conflictCols.map(c => `"${c}"`).join(', ')}) DO UPDATE SET ${updateSet} RETURNING *`,
      Object.values(filtered) as any[],
    )
    return row as unknown as R
  }

  async count(sql: Sql<{}>, where?: Partial<R> | SQL | SQL[]): Promise<number> {
    const { conditions, values } = this._buildConditions(where, 0)

    const softDel = this._softDeleteFilter(where)
    if (softDel) conditions.push(softDel)

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
    const [row] = await sql.unsafe(`SELECT COUNT(*) AS _total FROM "${this.tableName}"${whereClause}`, values as any[])
    return Number((row as Record<string, number>)._total)
  }
}

export class BoundTable<R extends Record<string, unknown>> {
  private inner: Table<R>
  private sql: Sql<{}>

  constructor(sql: Sql<{}>, tableName: string, builders: Record<string, ColumnBuilder<unknown>>) {
    this.inner = new Table<R>(tableName, builders)
    this.sql = sql
  }

  async create(opts?: CreateOptions): Promise<void> { await this.inner.create(this.sql, opts) }
  async drop(opts?: { cascade?: boolean }): Promise<void> { await this.inner.drop(this.sql, opts) }
  async createIndex(columns: string | string[], opts?: IndexOptions): Promise<void> { await this.inner.createIndex(this.sql, columns, opts) }
  async createUniqueIndex(columns: string | string[]): Promise<void> { await this.inner.createUniqueIndex(this.sql, columns) }

  async insert(data: Partial<R>): Promise<R> { return await this.inner.insert(this.sql, data) }
  async insertMany(data: Partial<R>[]): Promise<R[]> { return await this.inner.insertMany(this.sql, data) }
  async read(id: string | number, opts?: Pick<FindOptions, 'select' | 'withDeleted'>): Promise<R | undefined> { return await this.inner.read(this.sql, id, opts) }
  async readMany(where?: Partial<R> | SQL | SQL[], opts?: FindOptions): Promise<{ count: number; data: R[] }> { return await this.inner.readMany(this.sql, where, opts) }
  async update(id: string | number, data: Partial<R>): Promise<R | undefined> { return await this.inner.update(this.sql, id, data) }
  async updateMany(where: Partial<R> | SQL | SQL[], data: Partial<R>): Promise<number> { return await this.inner.updateMany(this.sql, where, data) }
  async delete(id: string | number): Promise<R | undefined> { return await this.inner.delete(this.sql, id) }
  async hardDelete(id: string | number): Promise<R | undefined> { return await this.inner.hardDelete(this.sql, id) }
  async deleteMany(where: Partial<R> | SQL | SQL[]): Promise<number> { return await this.inner.deleteMany(this.sql, where) }
  async hardDeleteMany(where: Partial<R> | SQL | SQL[]): Promise<number> { return await this.inner.hardDeleteMany(this.sql, where) }
  async upsert(data: Partial<R>, conflict: string | string[]): Promise<R> { return await this.inner.upsert(this.sql, data, conflict) }
  async count(where?: Partial<R> | SQL | SQL[]): Promise<number> { return await this.inner.count(this.sql, where) }

  withSql(sql: Sql<{}>): BoundTable<R> {
    return new BoundTable(sql, this.inner.tableName, this.inner.builders)
  }
}

/**
 * Define a type-safe table schema.
 *
 * ```ts
 * const users = pgTable('users', {
 *   id: serial('id').primaryKey(),
 *   name: text('name').notNull(),
 *   email: text('email').unique(),
 * })
 *
 * // The generic type R preserves the column types:
 * // Table<{ id: number; name: string; email: string }>
 * ```
 */
export function pgTable<R extends Record<string, unknown>>(
  tableName: string,
  builders: { [K in keyof R]: ColumnBuilder<R[K]> },
): Table<R> {
  return new Table<R>(tableName, builders as unknown as Record<string, ColumnBuilder<unknown>>)
}
