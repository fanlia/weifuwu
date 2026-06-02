import type { Sql } from '../../vendor.ts'
import { ColumnBuilder, toDDL } from './columns.ts'
import { SQL } from './sql.ts'

export interface IndexOptions {
  unique?: boolean
  type?: 'btree' | 'hnsw' | 'gin'
  desc?: boolean
  operator?: string
}

export interface FindOptions {
  orderBy?: Record<string, 'asc' | 'desc'>
  limit?: number
  offset?: number
}

interface ColEntry {
  prop: string
  db: string
  auto: boolean
}

export class Table<R extends Record<string, unknown>> {
  readonly tableName: string
  readonly columns: ColumnBuilder<unknown>[]
  private colEntries: ColEntry[]

  constructor(tableName: string, builders: Record<string, ColumnBuilder<unknown>>) {
    this.tableName = tableName
    this.columns = Object.values(builders)
    this.colEntries = Object.entries(builders).map(([prop, col]) => ({
      prop,
      db: col.name,
      auto: col.isAutoGenerate,
    }))
  }

  async create(sql: Sql<{}>): Promise<void> {
    const colDDL = this.columns.map(toDDL)
    const ddl = `CREATE TABLE IF NOT EXISTS "${this.tableName}" (\n  ${colDDL.join(',\n  ')}\n)`
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

  // --- CRUD ---

  async insert(sql: Sql<{}>, data: Partial<R>): Promise<R> {
    const filtered: Record<string, unknown> = {}
    for (const { prop, db, auto } of this.colEntries) {
      if (auto) continue
      if (prop in (data as any)) {
        filtered[db] = (data as any)[prop]
      }
    }
    const [row] = await sql`
      INSERT INTO ${sql(this.tableName as any)} ${sql(filtered as any)} RETURNING *
    `
    return row as unknown as R
  }

  async findById(sql: Sql<{}>, id: string | number): Promise<R | undefined> {
    const [row] = await sql`
      SELECT * FROM ${sql(this.tableName as any)}
      WHERE ${sql('id' as any)} = ${id} LIMIT 1
    `
    return (row as unknown as R) ?? undefined
  }

  async find(sql: Sql<{}>, where?: Partial<R>, opts?: FindOptions): Promise<R[]> {
    const conditions: string[] = []
    const values: unknown[] = []
    for (const [prop, value] of Object.entries(where || {}) as [string, unknown][]) {
      if (value === undefined) continue
      const entry = this.colEntries.find(e => e.prop === prop)
      const db = entry ? entry.db : prop
      conditions.push(`"${db}" = $${conditions.length + 1}`)
      values.push(value)
    }

    let query = `SELECT * FROM "${this.tableName}"`
    if (conditions.length > 0) query += ` WHERE ${conditions.join(' AND ')}`

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

    if (conditions.length > 0 || opts?.orderBy || opts?.limit !== undefined || opts?.offset !== undefined) {
      const rows = await sql.unsafe(query, values as any[])
      return rows as unknown as R[]
    }

    const rows = await sql`SELECT * FROM ${sql(this.tableName as any)}`
    return rows as unknown as R[]
  }

  async update(sql: Sql<{}>, where: Partial<R>, data: Partial<R>): Promise<R | undefined> {
    const sets: string[] = []
    const setValues: unknown[] = []

    for (const { prop, db } of this.colEntries) {
      if (prop in (data as any) && (data as any)[prop] !== undefined) {
        const val = (data as any)[prop]
        if (val instanceof SQL) {
          sets.push(`"${db}" = ${val.toSQL()}`)
        } else {
          sets.push(`"${db}" = $${sets.length + 1}`)
          setValues.push(val)
        }
      }
    }

    const values: unknown[] = [...setValues]

    const wConditions: string[] = []
    for (const [prop, value] of Object.entries(where) as [string, unknown][]) {
      if (value === undefined) continue
      const entry = this.colEntries.find(e => e.prop === prop)
      const db = entry ? entry.db : prop
      wConditions.push(`"${db}" = $${values.length + 1}`)
      values.push(value)
    }

    if (sets.length === 0 || wConditions.length === 0) return undefined

    const query = `UPDATE "${this.tableName}" SET ${sets.join(', ')} WHERE ${wConditions.join(' AND ')} RETURNING *`
    const rows = await sql.unsafe(query, values as any[])
    return (rows as any[])[0] as unknown as R ?? undefined
  }

  async delete(sql: Sql<{}>, where: Partial<R>): Promise<boolean> {
    const conditions: string[] = []
    const values: unknown[] = []
    for (const [prop, value] of Object.entries(where) as [string, unknown][]) {
      if (value === undefined) continue
      const entry = this.colEntries.find(e => e.prop === prop)
      const db = entry ? entry.db : prop
      conditions.push(`"${db}" = $${conditions.length + 1}`)
      values.push(value)
    }

    if (conditions.length === 0) return false

    const query = `DELETE FROM "${this.tableName}" WHERE ${conditions.join(' AND ')} RETURNING 1`
    const rows = await sql.unsafe(query, values as any[])
    return rows.length > 0
  }
}

export class BoundTable<R extends Record<string, unknown>> {
  private inner: Table<R>
  private sql: Sql<{}>

  constructor(sql: Sql<{}>, tableName: string, builders: Record<string, ColumnBuilder<unknown>>) {
    this.inner = new Table<R>(tableName, builders)
    this.sql = sql
  }

  async create(): Promise<void> { await this.inner.create(this.sql) }
  async drop(opts?: { cascade?: boolean }): Promise<void> { await this.inner.drop(this.sql, opts) }
  async createIndex(columns: string | string[], opts?: IndexOptions): Promise<void> { await this.inner.createIndex(this.sql, columns, opts) }
  async createUniqueIndex(columns: string | string[]): Promise<void> { await this.inner.createUniqueIndex(this.sql, columns) }

  async insert(data: Partial<R>): Promise<R> { return await this.inner.insert(this.sql, data) }
  async findById(id: string | number): Promise<R | undefined> { return await this.inner.findById(this.sql, id) }
  async find(where?: Partial<R>, opts?: FindOptions): Promise<R[]> { return await this.inner.find(this.sql, where, opts) }
  async update(where: Partial<R>, data: Partial<R>): Promise<R | undefined> { return await this.inner.update(this.sql, where, data) }
  async delete(where: Partial<R>): Promise<boolean> { return await this.inner.delete(this.sql, where) }
}

export function pgTable<R extends Record<string, unknown>>(
  tableName: string,
  builders: { [K in keyof R]: ColumnBuilder<R[K]> },
): Table<R> {
  return new Table<R>(tableName, builders as unknown as Record<string, ColumnBuilder<unknown>>)
}
