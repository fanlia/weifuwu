export class SQL {
  strings: TemplateStringsArray
  values: unknown[]

  constructor(strings: TemplateStringsArray, values: unknown[]) {
    this.strings = strings
    this.values = values
  }

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

export function sql(strings: TemplateStringsArray, ...values: unknown[]): SQL {
  return new SQL(strings, values)
}
