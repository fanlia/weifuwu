import type { SqlClient, Closeable } from '../types.ts'
import type { PostgresClient } from './types.ts'

export class PgModule implements Closeable {
  protected sql: SqlClient
  protected pg: PostgresClient

  constructor(pg: PostgresClient) {
    this.pg = pg
    this.sql = pg.sql
  }

  async transaction<T>(
    fn: (sql: SqlClient) => Promise<T>,
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
