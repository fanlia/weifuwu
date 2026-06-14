/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  serial,
  text,
  timestamptz,
  jsonb,
  sql as schemaSql,
  partitionBy,
} from '../postgres/schema/index.ts'
import { Router } from '../router.ts'
import { createHandler, listHandler, getHandler } from './rest.ts'
import type { LogdbOptions, LogEntry, LogEntryInput, LogdbModule } from './types.ts'
import type { Sql } from '../vendor.ts'

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1)
}

function formatYM(d: Date): string {
  return `${d.getFullYear()}_${pad(d.getMonth() + 1)}`
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 19) + '+00:00'
}

async function ensurePartitions(sql: Sql<{}>, tableName: string): Promise<void> {
  const now = new Date()
  for (let i = 0; i < 13; i++) {
    const start = startOfMonth(now.getFullYear(), now.getMonth() + i)
    const end = startOfMonth(now.getFullYear(), now.getMonth() + i + 1)
    const partName = `${tableName}_${formatYM(start)}`
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "${partName}"
      PARTITION OF "${tableName}"
      FOR VALUES FROM ('${toISO(start)}') TO ('${toISO(end)}')
    `)
  }
}

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

    const partitions = (await sql.unsafe(`
      SELECT relid::regclass::text AS name
      FROM pg_partition_tree('"${tableName}"'::regclass)
      WHERE relid IS DISTINCT FROM '"${tableName}"'::regclass
    `)) as { name: string }[]

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

  async function migrate(): Promise<void> {
    await entries.create({ partitionBy: partitionBy('range', 'created_at') })
    await entries.createIndex(['created_at', 'id'])
    await entries.createIndex(['level'])
    await entries.createIndex(['source'])
    await entries.createIndex(['level', 'created_at'])
    await ensurePartitions(sql, tableName)
  }

  const r = router()
  const mod = r as LogdbModule
  mod.log = log
  mod.migrate = migrate
  mod.clean = clean
  mod.close = async () => {}
  return mod
}
