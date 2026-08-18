/**
 * weifuwu/db/postgres — Schema 注册与写前校验
 *
 * 注册表结构后，insert 在写入前校验字段类型/必填/枚举——脏数据在源头拦截。
 * 这是元数据闭环的第一环（迁移/类型推断/缓存失效共享 schema 的起点）。
 */

import { ValidationError } from '../errors.ts'

export type ColumnType = 'text' | 'int' | 'jsonb' | 'enum'

export interface ColumnDef {
  type: ColumnType
  /** 必填（INSERT 时缺失报错） */
  required?: boolean
  /** enum 类型允许的值 */
  values?: string[]
}

export type Schema = Record<string, ColumnDef>

/** 校验单值；失败抛 ValidationError */
export function validateValue(def: ColumnDef, value: unknown, column: string): void {
  if (value === undefined || value === null) {
    if (def.required) {
      throw new ValidationError(`schema: '${column}' is required`)
    }
    return
  }
  switch (def.type) {
    case 'text':
      if (typeof value !== 'string') {
        throw new ValidationError(`schema: '${column}' must be a string, got ${typeof value}`)
      }
      break
    case 'int':
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new ValidationError(`schema: '${column}' must be an integer, got ${typeof value}`)
      }
      break
    case 'jsonb':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new ValidationError(`schema: '${column}' must be a JSON object`)
      }
      break
    case 'enum':
      if (!def.values?.includes(value as string)) {
        throw new ValidationError(
          `schema: '${column}' must be one of [${def.values?.join(', ')}], got ${String(value)}`,
        )
      }
      break
  }
}

/** 校验整个 row（必填 + 各列类型） */
export function validateRow(schema: Schema, row: Record<string, unknown>): void {
  // 必填检查
  for (const [col, def] of Object.entries(schema)) {
    if (def.required && (row[col] === undefined || row[col] === null)) {
      throw new ValidationError(`schema: '${col}' is required`)
    }
  }
  // 类型检查
  for (const [col, value] of Object.entries(row)) {
    const def = schema[col]
    if (!def) continue // 未注册列透传（由数据库约束兜底）
    validateValue(def, value, col)
  }
}
