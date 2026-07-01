/**
 * Cron expression parsing utilities (moved from cron-utils.ts).
 * Used internally by queue for scheduled job execution.
 *
 * All functions operate in local timezone.
 */

function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>()

  for (const part of field.split(',')) {
    if (part === '*') {
      for (let i = min; i <= max; i++) values.add(i)
    } else if (part.includes('/')) {
      const [range, stepStr] = part.split('/')
      const step = parseInt(stepStr, 10)
      if (isNaN(step) || step < 1) throw new Error(`Invalid cron step: ${part}`)
      let start = min
      let end = max
      if (range !== '*') {
        const rangeParts = range.split('-')
        start = parseInt(rangeParts[0], 10)
        end = rangeParts.length > 1 ? parseInt(rangeParts[1], 10) : max
      }
      for (let i = start; i <= end; i += step) values.add(i)
    } else if (part.includes('-')) {
      const [s, e] = part.split('-').map(Number)
      if (isNaN(s) || isNaN(e)) throw new Error(`Invalid cron range: ${part}`)
      for (let i = s; i <= e; i++) values.add(i)
    } else {
      const val = parseInt(part, 10)
      if (isNaN(val)) throw new Error(`Invalid cron value: ${part}`)
      values.add(val)
    }
  }

  const result = new Set<number>()
  for (const v of values) {
    if (v >= min && v <= max) result.add(v)
  }
  return result
}

const FIELD_RANGES: [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6],
]

export function parsePattern(pattern: string): Set<number>[] {
  const fields = pattern.trim().split(/\s+/)
  if (fields.length !== 5) {
    throw new Error(`Invalid cron pattern "${pattern}": expected 5 fields, got ${fields.length}`)
  }
  return fields.map((f, i) => parseField(f, FIELD_RANGES[i][0], FIELD_RANGES[i][1]))
}

export function matches(fields: Set<number>[], date: Date): boolean {
  return (
    fields[0].has(date.getMinutes()) &&
    fields[1].has(date.getHours()) &&
    fields[2].has(date.getDate()) &&
    fields[3].has(date.getMonth() + 1) &&
    fields[4].has(date.getDay())
  )
}

export function cronNext(expr: string, from: Date = new Date()): number {
  const fields = parsePattern(expr)

  const candidate = new Date(from.getTime() + 60_000)
  candidate.setSeconds(0, 0)

  for (let i = 0; i < 525600; i++) {
    if (
      fields[4].has(candidate.getDay()) &&
      fields[3].has(candidate.getMonth() + 1) &&
      fields[2].has(candidate.getDate()) &&
      fields[1].has(candidate.getHours()) &&
      fields[0].has(candidate.getMinutes())
    ) {
      return candidate.getTime()
    }
    candidate.setTime(candidate.getTime() + 60_000)
  }

  throw new Error(`No future date found for cron expression "${expr}"`)
}
