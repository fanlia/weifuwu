import type { Sql } from 'postgres'
import type { ColumnDef, TableDef } from './types.ts'

function toDDL(col: ColumnDef): string {
  const parts = [`"${col.name}"`, col.sqlType]
  if (col.isPrimaryKey) parts.push('PRIMARY KEY')
  if (!col.isPrimaryKey && !col.nullable) parts.push('NOT NULL')
  if (col.defaultExpr) parts.push(`DEFAULT ${col.defaultExpr}`)
  return parts.join(' ')
}

function createTableSQL(name: string, columns: ColumnDef[]): string {
  const cols = columns.map(toDDL)
  return `CREATE TABLE IF NOT EXISTS "${name}" (\n  ${cols.join(',\n  ')}\n)`
}

function addColumnSQL(name: string, col: ColumnDef): string {
  return `ALTER TABLE "${name}" ADD COLUMN IF NOT EXISTS ${toDDL(col)}`
}

export async function runMigrations(sql: Sql<{}>, tables: TableDef[]): Promise<void> {
  for (const table of tables) {
    const existing = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table.name}
    `

    if (existing.length === 0) {
      await sql.unsafe(createTableSQL(table.name, table.columns))
    } else {
      const colNames = new Set(existing.map((r: any) => r.column_name))
      for (const col of table.columns) {
        if (!colNames.has(col.name)) {
          await sql.unsafe(addColumnSQL(table.name, col))
        }
      }
    }
  }
}
