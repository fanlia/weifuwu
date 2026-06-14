import type { FieldDef } from './types.ts'
import { internalTableName, sqlTypeForField, formatDefault } from './utils.ts'

export function createTableSQL(tenantId: string, slug: string, fields: FieldDef[]): string {
  const name = internalTableName(tenantId, slug)
  const cols = fields.map((f) => buildColumnDDL(tenantId, f)).join(',\n  ')
  return `CREATE TABLE "${name}" (\n  "id" SERIAL PRIMARY KEY,\n  "tenant_id" TEXT NOT NULL,\n  ${cols}\n)`
}

export function addColumnSQL(tenantId: string, slug: string, field: FieldDef): string {
  const name = internalTableName(tenantId, slug)
  return `ALTER TABLE "${name}" ADD COLUMN IF NOT EXISTS ${buildColumnDDL(tenantId, field)}`
}

export function dropTableSQL(tenantId: string, slug: string): string {
  const name = internalTableName(tenantId, slug)
  return `DROP TABLE IF EXISTS "${name}" CASCADE`
}

export function createIndexesSQL(tenantId: string, slug: string, fields: FieldDef[]): string[] {
  const name = internalTableName(tenantId, slug)
  const statements: string[] = []

  statements.push(`CREATE INDEX IF NOT EXISTS "${name}_tenant_idx" ON "${name}" ("tenant_id")`)
  statements.push(
    `CREATE INDEX IF NOT EXISTS "${name}_tenant_id_idx" ON "${name}" ("tenant_id", "id")`,
  )

  for (const f of fields) {
    if (f.unique) {
      statements.push(
        `CREATE UNIQUE INDEX IF NOT EXISTS "${name}_${f.name}_uidx" ON "${name}" ("${f.name}")`,
      )
    } else if (f.index === 'hnsw') {
      statements.push(
        `CREATE INDEX IF NOT EXISTS "${name}_${f.name}_hnsw_idx" ON "${name}" USING hnsw ("${f.name}" vector_cosine_ops)`,
      )
    } else if (f.index === 'gin') {
      statements.push(
        `CREATE INDEX IF NOT EXISTS "${name}_${f.name}_gin_idx" ON "${name}" USING GIN ("${f.name}")`,
      )
    } else if (f.index === 'desc') {
      statements.push(
        `CREATE INDEX IF NOT EXISTS "${name}_${f.name}_desc_idx" ON "${name}" ("${f.name}" DESC)`,
      )
    } else if (f.index) {
      statements.push(
        `CREATE INDEX IF NOT EXISTS "${name}_${f.name}_idx" ON "${name}" ("${f.name}")`,
      )
    }
    if (f.relation) {
      statements.push(
        `CREATE INDEX IF NOT EXISTS "${name}_${f.name}_rel_idx" ON "${name}" ("${f.name}")`,
      )
    }
  }

  return statements
}

function buildColumnDDL(tenantId: string, field: FieldDef): string {
  const sqlType = sqlTypeForField(field)
  const parts: string[] = [`"${field.name}"`, sqlType]
  if (field.unique) parts.push('UNIQUE')
  if (field.required) parts.push('NOT NULL')
  const def = formatDefault(field)
  if (def) parts.push(`DEFAULT ${def}`)
  if (field.relation) {
    const refTable = internalTableName(tenantId, field.relation.table)
    const refCol = field.relation.field || 'id'
    const onDelete = (field.relation.onDelete || 'restrict').toUpperCase()
    parts.push(`REFERENCES "${refTable}"("${refCol}") ON DELETE ${onDelete}`)
  }
  return parts.join(' ')
}
