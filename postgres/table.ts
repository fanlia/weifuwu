import type { Sql } from '../vendor.ts'
import { z } from 'zod'
import type { ColumnDef, TableDef, TableProxy, ListOptions } from './types.ts'

function unwrap(field: z.ZodTypeAny): z.ZodTypeAny {
  let inner = field
  while (
    inner instanceof z.ZodOptional ||
    inner instanceof z.ZodNullable ||
    inner instanceof z.ZodDefault ||
    (inner.constructor.name === 'ZodTransform' || (inner as any)._def?.type === 'transform')
  ) {
    if ((inner as any)._def?.innerType) {
      inner = (inner as any)._def.innerType
    } else {
      break
    }
  }
  return inner
}

function isOptional(field: z.ZodTypeAny): boolean {
  let inner = field
  while (true) {
    if (inner instanceof z.ZodOptional) return true
    if (inner instanceof z.ZodNullable) return true
    if (inner instanceof z.ZodDefault) {
      inner = (inner as any)._def.innerType
      continue
    }
    if ((inner as any)._def?.type === 'transform') {
      inner = (inner as any)._def.innerType
      continue
    }
    break
  }
  return false
}

function hasDefault(field: z.ZodTypeAny): boolean {
  let inner = field
  while (true) {
    if (inner instanceof z.ZodDefault) return true
    if ((inner as any)._def?.type === 'transform') {
      inner = (inner as any)._def.innerType
      continue
    }
    break
  }
  return false
}

function hasUUIDCheck(field: z.ZodTypeAny): boolean {
  const checks: Array<{ type: string; def?: { format?: string } }> = (field as any)._def?.checks ?? []
  return checks.some((c) => c.type === 'string' && c.def?.format === 'uuid')
}

function detectSqlType(name: string, field: z.ZodTypeAny, isPk: boolean) {
  const inner = unwrap(field)
  const nullable = isOptional(field)
  const autoGenerate = isPk && name === 'id'

  if (isPk && name === 'id' && inner instanceof z.ZodNumber) {
    return { sqlType: 'SERIAL', nullable: false, defaultExpr: null as string | null, autoGenerate: true }
  }

  if (isPk && name === 'id' && typeof BigInt !== 'undefined' && inner instanceof (z as any).ZodBigInt) {
    return { sqlType: 'BIGSERIAL', nullable: false, defaultExpr: null as string | null, autoGenerate: true }
  }

  if (isPk && name === 'id' && inner instanceof z.ZodString) {
    if (hasUUIDCheck(inner)) {
      return { sqlType: 'UUID', nullable: false, defaultExpr: 'gen_random_uuid()' as string | null, autoGenerate: true }
    }
    return { sqlType: 'TEXT', nullable: false, defaultExpr: null as string | null, autoGenerate: false }
  }

  let sqlType: string
  if (inner instanceof z.ZodNumber) {
    sqlType = 'INTEGER'
  } else if (inner instanceof z.ZodString) {
    sqlType = 'TEXT'
  } else if (inner instanceof z.ZodBoolean) {
    sqlType = 'BOOLEAN'
  } else if (inner instanceof z.ZodDate) {
    sqlType = 'TIMESTAMPTZ'
  } else if (inner instanceof z.ZodEnum) {
    sqlType = 'TEXT'
  } else if (inner instanceof z.ZodArray) {
    sqlType = 'JSONB'
  } else if (inner instanceof z.ZodObject) {
    sqlType = 'JSONB'
  } else {
    sqlType = 'TEXT'
  }

  return { sqlType, nullable: nullable || autoGenerate, defaultExpr: null as string | null, autoGenerate }
}

function parseColumns(schema: Record<string, z.ZodTypeAny>): ColumnDef[] {
  const pkField = Object.keys(schema).find((k) => k === 'id')

  return Object.entries(schema).map(([name, field]) => {
    const isPk = name === pkField
    const { sqlType, nullable, defaultExpr, autoGenerate } = detectSqlType(name, field, isPk)
    return { name, sqlType, nullable: nullable || autoGenerate, isPrimaryKey: isPk, defaultExpr, autoGenerate }
  })
}

function buildGet(sql: Sql<{}>, name: string, pk: ColumnDef | undefined) {
  return async function get(id: number | string): Promise<any | undefined> {
    if (!pk) throw new Error(`Table "${name}" has no primary key`)
    const [row] = await sql`SELECT * FROM ${sql(name as any)} WHERE ${sql(pk.name as any)} = ${id} LIMIT 1`
    return row ?? undefined
  }
}

function buildList(sql: Sql<{}>, name: string, columns: ColumnDef[]) {
  return async function list(filter: Record<string, unknown> = {}, opts: ListOptions = {}): Promise<{ rows: any[]; count: number }> {
    const colNames = new Set(columns.map((c) => c.name))
    const whereClauses: string[] = []
    const whereValues: unknown[] = []

    for (const [key, value] of Object.entries(filter)) {
      if (colNames.has(key)) {
        whereClauses.push(`"${key}" = $${whereValues.length + 1}`)
        whereValues.push(value)
      }
    }

    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

    const sortClauses: string[] = []
    if (opts.sort) {
      for (const [key, dir] of Object.entries(opts.sort)) {
        if (colNames.has(key)) {
          sortClauses.push(`"${key}" ${dir.toUpperCase()}`)
        }
      }
    }
    const orderBy = sortClauses.length > 0 ? `ORDER BY ${sortClauses.join(', ')}` : ''

    const limitClause = opts.limit != null ? `LIMIT ${opts.limit}` : ''
    const offsetClause = opts.offset != null ? `OFFSET ${opts.offset}` : ''

    const [rows, countResult] = await Promise.all([
      sql.unsafe(`SELECT * FROM "${name}" ${where} ${orderBy} ${limitClause} ${offsetClause}`.trim(), whereValues as any[]),
      sql.unsafe(`SELECT count(*) as count FROM "${name}" ${where}`.trim(), whereValues as any[]),
    ])

    return { rows: rows as any[], count: Number((countResult as any[])[0]?.count ?? 0) }
  }
}

function buildCreate(sql: Sql<{}>, name: string, pk: ColumnDef | undefined, zodSchema: z.ZodObject<any>) {
  return async function create(data: any): Promise<any> {
    const validated = zodSchema.parse(data) as Record<string, unknown>

    if (pk?.autoGenerate) {
      delete validated[pk.name]
    }

    const [row] = await sql`INSERT INTO ${sql(name as any)} ${sql(validated as any)} RETURNING *`
    return row
  }
}

function buildPatch(sql: Sql<{}>, name: string, pk: ColumnDef | undefined, zodSchema: z.ZodObject<any>) {
  return async function patch(id: number | string, data: any): Promise<any | undefined> {
    if (!pk) throw new Error(`Table "${name}" has no primary key`)

    const validated = zodSchema.partial().parse(data) as Record<string, unknown>
    delete validated[pk.name]

    if (Object.keys(validated).length === 0) {
      const [row] = await sql`SELECT * FROM ${sql(name as any)} WHERE ${sql(pk.name as any)} = ${id} LIMIT 1`
      return row ?? undefined
    }

    const [row] = await sql`UPDATE ${sql(name as any)} SET ${sql(validated as any)} WHERE ${sql(pk.name as any)} = ${id} RETURNING *`
    return row ?? undefined
  }
}

function buildRemove(sql: Sql<{}>, name: string, pk: ColumnDef | undefined) {
  return async function remove(id: number | string): Promise<boolean> {
    if (!pk) throw new Error(`Table "${name}" has no primary key`)
    const rows = await sql`DELETE FROM ${sql(name as any)} WHERE ${sql(pk.name as any)} = ${id} RETURNING 1`
    return rows.length > 0
  }
}

export function buildTable(sql: Sql<{}>, tables: TableDef[]) {
  return function table<T extends Record<string, z.ZodTypeAny>>(
    name: string,
    schema: T,
  ): TableProxy<z.output<z.ZodObject<T>>, z.input<z.ZodObject<T>>> {
    const zodSchema = z.object(schema)
    const columns = parseColumns(schema)
    const pk = columns.find((c) => c.isPrimaryKey) ?? undefined

    tables.push({ name, columns })

    return {
      $type: undefined as unknown as z.output<z.ZodObject<T>>,
      $insert: undefined as unknown as z.input<z.ZodObject<T>>,
      get: buildGet(sql, name, pk),
      list: buildList(sql, name, columns),
      create: buildCreate(sql, name, pk, zodSchema),
      patch: buildPatch(sql, name, pk, zodSchema),
      remove: buildRemove(sql, name, pk),
    }
  }
}
