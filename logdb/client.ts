import { serial, text, timestamptz, jsonb, sql as schemaSql } from '../postgres/schema/index.ts'
import { Router } from '../router.ts'
import { migrate } from './migrate.ts'
import { createHandler, listHandler, getHandler } from './rest.ts'
import type { LogdbOptions, LogEntry, LogEntryInput, LogdbModule } from './types.ts'
import type { Sql } from '../vendor.ts'

export function logdb(options: LogdbOptions): LogdbModule {
  const pg = options.pg
  const sql = pg.sql
  const tableName = options.table ?? '_log_entries'
  const entries = pg.table(tableName, {
    id: serial('id'),
    level: text('level').notNull(),
    source: text('source').notNull(),
    message: text('message').notNull(),
    metadata: jsonb('metadata').default(schemaSql`'{}'::jsonb`),
    created_at: timestamptz('created_at').default(schemaSql`NOW()`),
  })

  async function log(input: LogEntryInput): Promise<LogEntry> {
    const row = await entries.insert({
      level: input.level,
      source: input.source,
      message: input.message,
      metadata: input.metadata ?? {},
    } as any)
    return row as unknown as LogEntry
  }

  function router(): Router {
    const r = new Router()
    r.post('/', createHandler(entries))
    r.get('/', listHandler(entries))
    r.get('/:id', getHandler(entries))
    return r
  }

  async function clean(retentionMonths: number): Promise<number> {
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - retentionMonths)

    const partitions = await sql.unsafe(`
      SELECT relid::regclass::text AS name
      FROM pg_partition_tree('"${tableName}"'::regclass)
      WHERE relid IS DISTINCT FROM '"${tableName}"'::regclass
    `) as { name: string }[]

    let dropped = 0
    for (const { name } of partitions) {
      const match = name.match(/_(\d{4})_(\d{2})$/)
      if (!match) continue
      const partDate = new Date(parseInt(match[1]), parseInt(match[2]) - 1)
      if (partDate < cutoff) {
        await sql.unsafe(`DROP TABLE IF EXISTS "${name}"`)
        dropped++
      }
    }
    return dropped
  }

  return {
    log,
    router,
    migrate: () => migrate(pg, tableName),
    clean,
    close: () => pg.close(),
  }
}
