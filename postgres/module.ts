import type { PostgresClient } from './types.ts'
import type { Sql } from '../vendor.ts'

export class PgModule {
  protected sql: Sql<{}>
  protected pg: PostgresClient

  constructor(pg: PostgresClient) {
    this.pg = pg
    this.sql = pg.sql
  }

  async migrate(): Promise<void> {
    // override in subclasses
  }

  async close(): Promise<void> {
    await this.pg.close()
  }
}
