import type { Sql } from '../../vendor.ts'
import { ColumnBuilder, toDDL } from './columns.ts'

export interface IndexOptions {
  unique?: boolean
  type?: 'btree' | 'hnsw' | 'gin'
  desc?: boolean
  operator?: string
}

export class Table<R extends Record<string, unknown>> {
  readonly tableName: string
  readonly columns: ColumnBuilder<unknown>[]

  constructor(tableName: string, builders: Record<string, ColumnBuilder<unknown>>) {
    this.tableName = tableName
    this.columns = Object.values(builders)
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
}

export function pgTable<R extends Record<string, unknown>>(
  tableName: string,
  builders: { [K in keyof R]: ColumnBuilder<R[K]> },
): Table<R> {
  return new Table<R>(tableName, builders as unknown as Record<string, ColumnBuilder<unknown>>)
}
