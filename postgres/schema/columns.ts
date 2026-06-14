import { SQL, sql } from './sql.ts'

/** Reference to another table's column (foreign key). */
export interface ColumnReference {
  /** Referenced table name. */
  table: string
  /** Referenced column name (default: `'id'`). */
  column: string
  /** `ON DELETE` action (e.g. `'cascade'`, `'set null'`). */
  onDelete?: string
}

/**
 * Fluent column builder for DDL generation.
 *
 * ```ts
 * text('name').notNull().unique()
 * integer('user_id').references('users')
 * timestamptz('created_at').default(sql`NOW()`)
 * ```
 */
// @ts-nocheck - T is used at type level
export class ColumnBuilder<T> {
  /** Column name. */
  name: string
  /** SQL type string (e.g. `'TEXT'`, `'INTEGER'`). */
  sqlType: string
  /** Whether this column is PRIMARY KEY. */
  isPrimaryKey = false
  /** Whether this column allows NULL. */
  isNullable = true
  /** Whether this column has a UNIQUE constraint. */
  isUnique = false
  /** Whether the value is auto-generated (e.g. SERIAL, UUID defaults). */
  isAutoGenerate = false
  /** DEFAULT expression as a raw SQL string. */
  defaultExpr: string | null = null
  /** Foreign key reference, if any. */
  ref: ColumnReference | null = null

  constructor(name: string, sqlType: string) {
    this.name = name
    this.sqlType = sqlType
  }

  /** Mark as PRIMARY KEY (implies NOT NULL). */
  primaryKey(): this {
    this.isPrimaryKey = true
    this.isNullable = false
    return this
  }

  /** Add NOT NULL constraint. */
  notNull(): this {
    this.isNullable = false
    return this
  }

  /** Allow NULL values (default). */
  nullable(): this {
    this.isNullable = true
    return this
  }

  /** Set a DEFAULT value. Accepts raw SQL, string, number, or boolean. */
  default(expr: SQL | string | number | boolean): this {
    if (expr instanceof SQL) {
      this.defaultExpr = expr.toSQL()
    } else if (typeof expr === 'string') {
      this.defaultExpr = `'${expr.replace(/'/g, "''")}'`
    } else {
      this.defaultExpr = String(expr)
    }
    return this
  }

  /** Add UNIQUE constraint. */
  unique(): this {
    this.isUnique = true
    return this
  }

  /** Add FOREIGN KEY reference to another table. */
  references(table: string, column = 'id', onDelete?: string): this {
    this.ref = { table, column, onDelete }
    return this
  }
}

function col<T>(name: string, sqlType: string): ColumnBuilder<T> {
  return new ColumnBuilder<T>(name, sqlType)
}

/** Auto-incrementing integer primary key (`SERIAL`). */
export function serial(name: string) {
  const c = col<number>(name, 'SERIAL')
  c.isAutoGenerate = true
  return c
}
/** UUID column. */
export function uuid(name: string) {
  return col<string>(name, 'UUID')
}
/** TEXT column. */
export function text(name: string) {
  return col<string>(name, 'TEXT')
}
/** INTEGER column. */
export function integer(name: string) {
  return col<number>(name, 'INTEGER')
}
/** BOOLEAN column (exported as `boolean`). */
export function boolean_(name: string) {
  return col<boolean>(name, 'BOOLEAN')
}
export { boolean_ as boolean }
/** TIMESTAMPTZ column (timestamp with time zone). */
export function timestamptz(name: string) {
  return col<string>(name, 'TIMESTAMPTZ')
}
/** JSONB column (stores arbitrary JSON data). */
export function jsonb<T = unknown>(name: string) {
  return col<T>(name, 'JSONB')
}
/** TEXT[] column (PostgreSQL array of text). */
export function textArray(name: string) {
  return col<string[]>(name, 'TEXT[]')
}
/** Vector column for pgvector (embedding storage). Requires `dimensions`. */
export function vector(name: string, dims: number) {
  return col<number[]>(name, `vector(${dims})`)
}

export interface PartitionByDef {
  type: 'RANGE' | 'LIST' | 'HASH'
  column: string
}

export function partitionBy(type: 'range' | 'list' | 'hash', column: string): PartitionByDef {
  return { type: type.toUpperCase() as 'RANGE' | 'LIST' | 'HASH', column }
}

/**
 * Create a pair of `created_at` / `updated_at` timestamp columns
 * that default to `NOW()` and are NOT NULL.
 *
 * ```ts
 * pgTable('users', {
 *   id: serial('id').primaryKey(),
 *   name: text('name'),
 *   ...timestamps(),
 * })
 * ```
 */
export function timestamps() {
  return {
    created_at: timestamptz('created_at')
      .notNull()
      .default(sql`NOW()`),
    updated_at: timestamptz('updated_at')
      .notNull()
      .default(sql`NOW()`),
  } as const
}

/**
 * Convert a ColumnBuilder into a DDL column definition string.
 *
 * ```ts
 * toDDL(text('name').notNull())
 * // '"name" TEXT NOT NULL'
 * ```
 */
export function toDDL(col: ColumnBuilder<unknown>): string {
  const parts = [`"${col.name}"`, col.sqlType]
  if (col.isPrimaryKey) parts.push('PRIMARY KEY')
  if (!col.isPrimaryKey && !col.isNullable) parts.push('NOT NULL')
  if (col.isUnique) parts.push('UNIQUE')
  if (col.defaultExpr) parts.push(`DEFAULT ${col.defaultExpr}`)
  if (col.ref) {
    parts.push(`REFERENCES "${col.ref.table}"("${col.ref.column}")`)
    if (col.ref.onDelete) parts.push(`ON DELETE ${col.ref.onDelete.toUpperCase()}`)
  }
  return parts.join(' ')
}
