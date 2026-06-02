import { SQL } from './sql.ts'

export interface ColumnReference {
  table: string
  column: string
  onDelete?: string
}

export class ColumnBuilder<T> {
  name: string
  sqlType: string
  isPrimaryKey = false
  isNullable = true
  isUnique = false
  defaultExpr: string | null = null
  ref: ColumnReference | null = null

  constructor(name: string, sqlType: string) {
    this.name = name
    this.sqlType = sqlType
  }

  primaryKey(): this {
    this.isPrimaryKey = true
    this.isNullable = false
    return this
  }

  notNull(): this {
    this.isNullable = false
    return this
  }

  nullable(): this {
    this.isNullable = true
    return this
  }

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

  unique(): this {
    this.isUnique = true
    return this
  }

  references(table: string, column = 'id', onDelete?: string): this {
    this.ref = { table, column, onDelete }
    return this
  }
}

function col<T>(name: string, sqlType: string): ColumnBuilder<T> {
  return new ColumnBuilder<T>(name, sqlType)
}

export function serial(name: string) { return col<number>(name, 'SERIAL') }
export function uuid(name: string) { return col<string>(name, 'UUID') }
export function text(name: string) { return col<string>(name, 'TEXT') }
export function integer(name: string) { return col<number>(name, 'INTEGER') }
export function boolean_(name: string) { return col<boolean>(name, 'BOOLEAN') }
export { boolean_ as boolean }
export function timestamptz(name: string) { return col<string>(name, 'TIMESTAMPTZ') }
export function jsonb<T = unknown>(name: string) { return col<T>(name, 'JSONB') }
export function textArray(name: string) { return col<string[]>(name, 'TEXT[]') }
export function vector(name: string, dims: number) { return col<number[]>(name, `vector(${dims})`) }

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
