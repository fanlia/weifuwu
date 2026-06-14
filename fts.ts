/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Sql } from './vendor.ts'
import type { BoundTable } from './postgres/schema/index.ts'

// ── Types ───────────────────────────────────────────────────────────────────

export interface FTSSearchResult {
  /** Primary key value */
  id: unknown
  /** Relevance score (0–1) */
  rank: number
  /** The row data (all columns) */
  row: Record<string, unknown>
  /** ts_headline highlighted snippet, if requested */
  headline?: string
}

export interface FTSCreateIndexOptions {
  language?: string
  indexName?: string
  indexType?: 'gin' | 'gist'
}

export interface FTSSearchOptions {
  fields?: string[]
  limit?: number
  offset?: number
  headline?: boolean
  language?: string
  rankColumn?: string
  minRank?: number
}

// ── SQL helpers ─────────────────────────────────────────────────────────────

function resolveTableName(table: BoundTable<any>): string {
  return table.tableName
}

function escapeIdent(s: string): string {
  return `"${s.replace(/"/g, '""')}"`
}

function sqlLit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

// ── Core functions ──────────────────────────────────────────────────────────

export async function createIndex(
  sql: Sql<{}>,
  table: BoundTable<any>,
  fields: string[],
  options?: FTSCreateIndexOptions,
): Promise<void> {
  const language = options?.language ?? 'english'
  const tableName = resolveTableName(table)
  const indexName = options?.indexName ?? `${tableName}_fts_idx`
  const vectorExpr = fields.map((f) => `coalesce(${escapeIdent(f)}, '')`).join(` || ' ' || `)
  const indexType = options?.indexType ?? 'gin'

  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS ${escapeIdent(indexName)}
    ON ${escapeIdent(tableName)}
    USING ${indexType}
    (to_tsvector(${sqlLit(language)}, ${vectorExpr}))
  `)
}

export async function dropIndex(
  sql: Sql<{}>,
  table: BoundTable<any>,
  options?: { indexName?: string },
): Promise<void> {
  const tableName = resolveTableName(table)
  const indexName = options?.indexName ?? `${tableName}_fts_idx`
  await sql.unsafe(`DROP INDEX IF EXISTS ${escapeIdent(indexName)}`)
}

export async function search<T extends Record<string, unknown>>(
  sql: Sql<{}>,
  table: BoundTable<T>,
  query: string,
  options?: FTSSearchOptions,
): Promise<FTSSearchResult[]> {
  const tableName = resolveTableName(table)
  const language = options?.language ?? 'english'
  const searchFields = options?.fields
  const limit = options?.limit ?? 20
  const offset = options?.offset ?? 0
  const rankCol = options?.rankColumn ?? '_rank'

  if (!searchFields?.length) {
    throw new Error('fts.search: `fields` option is required. Specify which columns to search.')
  }

  // Preserve dots, hyphens, and other characters that tsvector may include in lexemes.
  // websearch_to_tsquery handles these naturally without splitting into separate terms.
  const sanitized = query.trim()
  if (!sanitized) return []

  const vectorExpr = searchFields.map((f) => `coalesce(${escapeIdent(f)}, '')`).join(` || ' ' || `)
  const langLit = sqlLit(language)
  const queryLit = sqlLit(sanitized)
  const rankColId = escapeIdent(rankCol)
  const tableId = escapeIdent(tableName)

  const headlineExpr = options?.headline
    ? searchFields
        .map(
          (f) =>
            `ts_headline(${langLit}, ${escapeIdent(f)}, websearch_to_tsquery(${langLit}, ${queryLit}), 'MaxWords=30,MinWords=15') as ${escapeIdent(f + '_headline')}`,
        )
        .join(',\n      ')
    : ''

  const sql_query = `
    SELECT
      *,
      ts_rank(
        to_tsvector(${langLit}, ${vectorExpr}),
        websearch_to_tsquery(${langLit}, ${queryLit})
      ) as ${rankColId}
      ${headlineExpr ? ',' + headlineExpr : ''}
    FROM ${tableId}
    WHERE to_tsvector(${langLit}, ${vectorExpr}) @@ websearch_to_tsquery(${langLit}, ${queryLit})
    ORDER BY ${rankColId} DESC
    LIMIT ${limit} OFFSET ${offset}
  `

  const rows = await sql.unsafe(sql_query)

  return rows.map((row) => {
    const result: FTSSearchResult = {
      id: row.id,
      rank: Number(row[rankCol]) || 0,
      row: row,
    }

    if (options?.headline && searchFields) {
      const snippets = searchFields.map((f) => row[`${f}_headline`]).filter(Boolean)
      result.headline = snippets.join(' ... ')
    }

    return result
  })
}

export async function suggest(
  sql: Sql<{}>,
  table: BoundTable<any>,
  prefix: string,
  options?: { field?: string; language?: string; limit?: number },
): Promise<string[]> {
  const tableName = resolveTableName(table)
  const field = options?.field
  const language = options?.language ?? 'english'
  const limit = options?.limit ?? 10

  if (!field) throw new Error('fts.suggest: `field` option is required')

  const sanitized = prefix.replace(/[^\w\s-]/g, ' ').trim()
  if (!sanitized) return []

  const rows = await sql.unsafe(`
    SELECT DISTINCT ts_lexize(${sqlLit(language)}, word) as tokens
    FROM (
      SELECT regexp_split_to_table(lower(${escapeIdent(field)}), E'\\W+') as word
      FROM ${escapeIdent(tableName)}
    ) words
    WHERE word LIKE ${sqlLit(sanitized + '%')}
    LIMIT ${limit}
  `)

  return rows.map((r) => r.tokens?.[0] ?? '').filter(Boolean)
}
