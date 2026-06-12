import type { PostgresClient } from './types.ts'
import type { Sql } from '../vendor.ts'
import type { ColumnBuilder, BoundTable } from './schema/index.ts'

export class PgModule {
  protected sql: Sql<{}>
  protected pg: PostgresClient

  constructor(pg: PostgresClient) {
    this.pg = pg
    this.sql = pg.sql
  }

  table<R extends Record<string, unknown>>(
    tableName: string,
    builders: { [K in keyof R]: ColumnBuilder<R[K]> },
  ): BoundTable<R> {
    return this.pg.table(tableName, builders)
  }

  async transaction<T>(fn: (sql: Sql<{}>) => Promise<T>, retryOpts?: { maxRetries?: number }): Promise<T> {
    return await this.pg.transaction(fn, retryOpts)
  }

  async migrate(): Promise<void> {
    // override in subclasses
  }

  async close(): Promise<void> {
    await this.pg.close()
  }
}
