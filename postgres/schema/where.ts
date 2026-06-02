import { SQL } from './sql.ts'

function op(col: string, sqlOp: string, val: unknown): SQL {
  return new SQL([`"${col}" ${sqlOp} `, ''] as any, [val])
}

export function eq(col: string, val: unknown): SQL { return op(col, '=', val) }
export function ne(col: string, val: unknown): SQL { return op(col, '!=', val) }
export function gt(col: string, val: unknown): SQL { return op(col, '>', val) }
export function gte(col: string, val: unknown): SQL { return op(col, '>=', val) }
export function lt(col: string, val: unknown): SQL { return op(col, '<', val) }
export function lte(col: string, val: unknown): SQL { return op(col, '<=', val) }

export function contains(col: string, val: Record<string, unknown>): SQL {
  return new SQL([`"${col}" @> `, ''] as any, [val])
}

export function in_(col: string, val: unknown[]): SQL {
  const close = ')'
  return new SQL([`"${col}" = ANY(`, close] as any, [val])
}

function combine(conditions: SQL[], joiner: string): SQL {
  if (conditions.length === 0) return new SQL([''] as any, [])
  const strings: string[] = ['(']
  const values: unknown[] = []
  for (let i = 0; i < conditions.length; i++) {
    if (i > 0) strings[strings.length - 1] += ` ${joiner} `
    const s = conditions[i]
    for (let j = 0; j < s.strings.length; j++) {
      strings[strings.length - 1] += s.strings[j]
      if (j < s.values.length) {
        strings.push('')
        values.push(s.values[j])
      }
    }
  }
  strings[strings.length - 1] += ')'
  return new SQL(strings as any, values)
}

export function and(...conditions: SQL[]): SQL { return combine(conditions, 'AND') }
export function or(...conditions: SQL[]): SQL { return combine(conditions, 'OR') }
