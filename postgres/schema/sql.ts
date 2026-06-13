/**
 * A parameterized SQL fragment with template strings and bound values.
 * Used internally by the schema builder and where helpers.
 */
export class SQL {
  /** Template string parts (interleaved with values). */
  strings: TemplateStringsArray
  /** Bound parameter values. */
  values: unknown[]

  constructor(strings: TemplateStringsArray, values: unknown[]) {
    this.strings = strings
    this.values = values
  }

  /** Serialize to a raw SQL string (interpolating values inline for DDL use). */
  toSQL(): string {
    let result = ''
    for (let i = 0; i < this.strings.length; i++) {
      result += this.strings[i]
      if (i < this.values.length) {
        result += String(this.values[i])
      }
    }
    return result
  }
}

/**
 * Tagged template helper for creating parameterized SQL fragments.
 *
 * ```ts
 * sql`NOW()`
 * sql`${column} ILIKE ${'%' + search + '%'}`
 * ```
 */
export function sql(strings: TemplateStringsArray, ...values: unknown[]): SQL {
  return new SQL(strings, values)
}
