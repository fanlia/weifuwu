import type { Sql } from '../../vendor.ts'
import { ColumnBuilder, toDDL, type PartitionByDef } from './columns.ts'
import { SQL } from './sql.ts'
import { and } from './where.ts'

export interface IndexOptions {
  unique?: boolean
  type?: 'btree' | 'hnsw' | 'gin'
  desc?: boolean
  operator?: string
}

export interface CreateOptions {
  partitionBy?: PartitionByDef
}

export interface FindOptions {
  orderBy?: Record<string, 'asc' | 'desc'>
  limit?: number
  offset?: number
  select?: string[]
  withDeleted?: boolean
}

interface ColEntry {
  prop: string
  db: string
  auto: boolean
}

export class Table<R extends Record<string, unknown>> {
  readonly tableName: string
  readonly columns: ColumnBuilder<unknown>[]
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
    }))
  }

  hasColumn(dbName: string): boolean {
    return this.colEntries.some(e => e.db === dbName)
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

    for (const { prop, db } of this.colEntries) {
      if (prop in (data as any) && (data as any)[prop] !== undefined) {
        const val = (data as any)[prop]
        if (val instanceof SQL) {
          sets.push(`"${db}" = ${val.toSQL()}`)
        } else {
          sets.push(`"${db}" = $${sets.length + 1}`)
          values.push(val)
        }
      }
    }

    if (this.hasColumn('updated_at') && !(data as any).updated_at) {
      sets.push('"updated_at" = NOW()')
    }

    return { sets, values }
  }

  // --- CRUD ---

  async insert(sql: Sql<{}>, data: Partial<R>): Promise<R> {
    const filtered: Record<string, unknown> = {}
    for (const { prop, db, auto } of this.colEntries) {
      if (auto) continue
      const val = (data as any)[prop]
      if (val !== undefined) {
        filtered[db] = val
      }
    }
    const [row] = await sql`
      INSERT INTO ${sql(this.tableName as any)} ${sql(filtered as any)} RETURNING *
    `
    return row as unknown as R
  }

  async insertMany(sql: Sql<{}>, data: Partial<R>[]): Promise<R[]> {
    const filtered: Record<string, unknown>[] = []
    for (const item of data) {
      const row: Record<string, unknown> = {}
      for (const { prop, db, auto } of this.colEntries) {
        if (auto) continue
        const val = (item as any)[prop]
        if (val !== undefined) {
          row[db] = val
        }
      }
      filtered.push(row)
    }
    const rows = await sql`
      INSERT INTO ${sql(this.tableName as any)} ${sql(filtered as any)} RETURNING *
    `
    return rows as unknown as R[]
  }

  async read(sql: Sql<{}>, id: string | number, opts?: Pick<FindOptions, 'select'>): Promise<R | undefined> {
    if (opts?.select?.length) {
      const columns = opts.select.map(c => `"${c}"`).join(', ')
      const [row] = await sql.unsafe(
        `SELECT ${columns} FROM "${this.tableName}" WHERE id = $1 LIMIT 1`,
        [id],
      )
      return (row as unknown as R) ?? undefined
    }
    const [row] = await sql`
      SELECT * FROM ${sql(this.tableName as any)}
      WHERE ${sql('id' as any)} = ${id} LIMIT 1
    `
    return (row as unknown as R) ?? undefined
  }

  async readMany(sql: Sql<{}>, where?: Partial<R> | SQL | SQL[], opts?: FindOptions): Promise<{ count: number; data: R[] }> {
    const { conditions, values } = this._buildConditions(where, 0)

    if (this.hasColumn('deleted_at') && !opts?.withDeleted) {
      if (!where || typeof where === 'object' && !Array.isArray(where) && !(where instanceof SQL) && !('deleted_at' in (where as any))) {
        conditions.push('"deleted_at" IS NULL')
      } else if (where instanceof SQL || Array.isArray(where)) {
        conditions.push('"deleted_at" IS NULL')
      }
    }

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''

    const [countRow] = await sql.unsafe(`SELECT COUNT(*) AS _total FROM "${this.tableName}"${whereClause}`, values as any[])
    const count = Number((countRow as any)._total)

    if (conditions.length === 0 && !opts?.orderBy && !opts?.limit && !opts?.offset && !opts?.select) {
      const rows = await sql`SELECT * FROM ${sql(this.tableName as any)}`
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

    const query = `UPDATE "${this.tableName}" AS t SET ${sets.join(', ')} FROM (SELECT ctid FROM "${this.tableName}" WHERE id = $${setValues.length + 1} LIMIT 1) AS sub WHERE t.ctid = sub.ctid RETURNING t.*`
    const rows = await sql.unsafe(query, [...setValues, id] as any[])
    return (rows as any[])[0] as unknown as R ?? undefined
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
    if (this.hasColumn('deleted_at')) {
      const [row] = await sql.unsafe(
        `UPDATE "${this.tableName}" SET "deleted_at" = NOW() WHERE id = $1 RETURNING *`,
        [id],
      )
      return (row as unknown as R) ?? undefined
    }
    const [row] = await sql`
      DELETE FROM ${sql(this.tableName as any)} WHERE ${sql('id' as any)} = ${id} RETURNING *
    `
    return (row as unknown as R) ?? undefined
  }

  async hardDelete(sql: Sql<{}>, id: string | number): Promise<R | undefined> {
    const [row] = await sql`
      DELETE FROM ${sql(this.tableName as any)} WHERE ${sql('id' as any)} = ${id} RETURNING *
    `
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
      const val = (data as any)[prop]
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
      return (row as unknown as R) ?? undefined as any
    }

    const [row] = await sql.unsafe(
      `INSERT INTO "${this.tableName}" (${dbCols.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (${conflictCols.map(c => `"${c}"`).join(', ')}) DO UPDATE SET ${updateSet} RETURNING *`,
      Object.values(filtered) as any[],
    )
    return row as unknown as R
  }

  async count(sql: Sql<{}>, where?: Partial<R> | SQL | SQL[]): Promise<number> {
    const { conditions, values } = this._buildConditions(where, 0)

    if (this.hasColumn('deleted_at')) {
      if (!where || typeof where === 'object' && !Array.isArray(where) && !(where instanceof SQL) && !('deleted_at' in (where as any))) {
        conditions.push('"deleted_at" IS NULL')
      } else if (where instanceof SQL || Array.isArray(where)) {
        conditions.push('"deleted_at" IS NULL')
      }
    }

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
    const [row] = await sql.unsafe(`SELECT COUNT(*) AS _total FROM "${this.tableName}"${whereClause}`, values as any[])
    return Number((row as any)._total)
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
  async read(id: string | number, opts?: Pick<FindOptions, 'select'>): Promise<R | undefined> { return await this.inner.read(this.sql, id, opts) }
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

export function pgTable<R extends Record<string, unknown>>(
  tableName: string,
  builders: { [K in keyof R]: ColumnBuilder<R[K]> },
): Table<R> {
  return new Table<R>(tableName, builders as unknown as Record<string, ColumnBuilder<unknown>>)
}
