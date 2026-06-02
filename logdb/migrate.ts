import type { Sql } from '../vendor.ts'
import { pgTable, serial, text, timestamptz, jsonb, sql, partitionBy } from '../postgres/schema/index.ts'

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

export async function ensurePartitions(sql: Sql<{}>, tableName: string): Promise<void> {
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

export async function migrate(pg: { sql: Sql<{}> }, tableName: string): Promise<void> {
  const entries = pgTable(tableName, {
    id: serial('id'),
    level: text('level').notNull(),
    source: text('source').notNull(),
    message: text('message').notNull(),
    metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
    created_at: timestamptz('created_at').default(sql`NOW()`),
  })

  await entries.create(pg.sql, { partitionBy: partitionBy('range', 'created_at') })

  await entries.createIndex(pg.sql, ['created_at', 'id'])
  await entries.createIndex(pg.sql, ['level'])
  await entries.createIndex(pg.sql, ['source'])
  await entries.createIndex(pg.sql, ['level', 'created_at'])

  await ensurePartitions(pg.sql, tableName)
}
