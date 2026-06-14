import { SQL } from './sql.ts'

function op(col: string, sqlOp: string, val: unknown): SQL {
  return new SQL([`"${col}" ${sqlOp} `, ''] as any, [val])
}

/** Column equals value: `col = val`. */
export function eq(col: string, val: unknown): SQL {
  return op(col, '=', val)
}
/** Column not equals value: `col != val`. */
export function ne(col: string, val: unknown): SQL {
  return op(col, '!=', val)
}
/** Column greater than value: `col > val`. */
export function gt(col: string, val: unknown): SQL {
  return op(col, '>', val)
}
/** Column greater than or equal value: `col >= val`. */
export function gte(col: string, val: unknown): SQL {
  return op(col, '>=', val)
}
/** Column less than value: `col < val`. */
export function lt(col: string, val: unknown): SQL {
  return op(col, '<', val)
}
/** Column less than or equal value: `col <= val`. */
export function lte(col: string, val: unknown): SQL {
  return op(col, '<=', val)
}

/** Column IS NULL. */
export function isNull(col: string): SQL {
  return new SQL([`"${col}" IS NULL`] as any, [])
}

/** Column IS NOT NULL. */
export function isNotNull(col: string): SQL {
  return new SQL([`"${col}" IS NOT NULL`] as any, [])
}

/** Column LIKE pattern. */
export function like(col: string, pattern: string): SQL {
  return op(col, 'LIKE', pattern)
}

/** Negate a condition: `NOT (condition)`. */
export function not(condition: SQL): SQL {
  const strings = condition.strings
  const values = condition.values
  if (strings.length === 1 && strings[0] === '') return new SQL(['NOT ()'] as any, [])
  const result: string[] = ['NOT (']
  for (let i = 0; i < strings.length; i++) {
    if (i > 0) result.push(strings[i])
    else result[0] += strings[i]
  }
  result[result.length - 1] += ')'
  return new SQL(result as any, [...values])
}

/** JSONB containment: `col @> val` (does `col` contain `val`?). */
export function contains(col: string, val: Record<string, unknown>): SQL {
  return new SQL([`"${col}" @> `, ''] as any, [val])
}

/** Column value is in array: `col = ANY(val)`. */
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

/** Combine conditions with AND. */
export function and(...conditions: SQL[]): SQL {
  return combine(conditions, 'AND')
}
/** Combine conditions with OR. */
export function or(...conditions: SQL[]): SQL {
  return combine(conditions, 'OR')
}
