import type { PostgresClient } from './types.ts'
import type { Sql } from '../vendor.ts'
import type { ColumnBuilder, BoundTable, Table } from './schema/index.ts'
import type { Closeable } from '../types.ts'

export class PgModule implements Closeable {
  protected sql: Sql<{}>
  protected pg: PostgresClient

  constructor(pg: PostgresClient) {
    this.pg = pg
    this.sql = pg.sql
  }

  table<R extends Record<string, unknown>>(
    tableOrSchema: string | Table<R>,
    builders?: { [K in keyof R]: ColumnBuilder<R[K]> },
  ): BoundTable<R> {
    return this.pg.table(tableOrSchema as any, builders as any)
  }

  async transaction<T>(
    fn: (sql: Sql<{}>) => Promise<T>,
    retryOpts?: { maxRetries?: number },
  ): Promise<T> {
    return await this.pg.transaction(fn, retryOpts)
  }

  async migrate(): Promise<void> {
    // override in subclasses
  }

  async close(): Promise<void> {
    await this.pg.close()
  }
}
