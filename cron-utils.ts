/**
 * Shared cron expression parsing utilities.
 * Used by both queue (Redis-backed) and in-memory scheduler.
 *
 * All functions operate in **local timezone**.
 *
 * ```ts
 * import { cronNext } from 'weifuwu'
 *
 * // Get next weekday at 09:00
 * const next = cronNext('0 9 * * 1-5')
 * console.log(new Date(next))
 * ```
 */

// ── Parse a single cron field ───────────────────────────────────────────────

/**
 * Parse a single cron field (e.g. `"* /5"`, `"1-10"`, `"1,3,5"`) into a set
 * of matching integer values within `[min, max]`.
 *
 * @param field - The cron field expression.
 * @param min - Minimum valid value (inclusive).
 * @param max - Maximum valid value (inclusive).
 * @returns Set of matching integer values.
 * @throws If the field contains an invalid expression (step of 0, NaN, etc.).
 *
 * ```ts
 * parseField('1-5', 1, 31)  // Set { 1, 2, 3, 4, 5 }
 * ```
 */
export function parseField(field: string, min: number, max: number): Set<number> {
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

  // Filter out-of-range values
  const result = new Set<number>()
  for (const v of values) {
    if (v >= min && v <= max) result.add(v)
  }
  return result
}

// ── Parse full 5-field pattern ─────────────────────────────────────────────

const FIELD_RANGES: [number, number][] = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week (0=Sunday)
]

/**
 * Parse a full 5-field cron expression into an array of 5 Sets.
 *
 * @param pattern - Standard cron expression: `minute hour day month weekday`
 * @returns Array of 5 Sets (minute, hour, day, month, weekday).
 * @throws If the pattern does not contain exactly 5 fields.
 *
 * ```ts
 * const fields = parsePattern('0 9 * * 1-5')
 * fields[1] // hour: { 9 }
 * fields[4] // weekday: { 1, 2, 3, 4, 5 }
 * ```
 */
export function parsePattern(pattern: string): Set<number>[] {
  const fields = pattern.trim().split(/\s+/)
  if (fields.length !== 5) {
    throw new Error(`Invalid cron pattern "${pattern}": expected 5 fields, got ${fields.length}`)
  }
  return fields.map((f, i) => parseField(f, FIELD_RANGES[i][0], FIELD_RANGES[i][1]))
}

// ── Check if a date matches a parsed pattern ────────────────────────────────

/**
 * Check whether a given date matches a parsed cron pattern.
 * Uses local timezone methods (getMinutes, getHours, etc.).
 *
 * @param fields - Parsed pattern from {@link parsePattern}.
 * @param date - Date to check.
 * @returns `true` if the date matches the pattern.
 *
 * ```ts
 * const fields = parsePattern('0 9 * * 1-5') // weekdays at 09:00
 * matches(fields, new Date('2026-06-15T09:00:00')) // true (Monday)
 * ```
 */
export function matches(fields: Set<number>[], date: Date): boolean {
  return (
    fields[0].has(date.getMinutes()) &&
    fields[1].has(date.getHours()) &&
    fields[2].has(date.getDate()) &&
    fields[3].has(date.getMonth() + 1) &&
    fields[4].has(date.getDay())
  )
}

// ── Calculate next future timestamp matching a cron expression ──────────────

/**
 * Calculate the next future timestamp (ms since epoch) matching a cron expression.
 * Scans forward minute by minute, up to 1 year ahead.
 * Uses local timezone.
 *
 * @param expr - Standard 5-field cron expression.
 * @param from - Starting point (default: now). The result is always > `from`.
 * @returns Unix timestamp (ms) of the next matching time.
 * @throws If no matching time is found within 1 year.
 *
 * ```ts
 * const next = cronNext('30 14 * * *') // next 14:30
 * console.log(new Date(next).toISOString())
 * ```
 */
export function cronNext(expr: string, from: Date = new Date()): number {
  const fields = parsePattern(expr)

  const candidate = new Date(from.getTime() + 60_000)
  candidate.setSeconds(0, 0)

  // Scan up to 1 year ahead
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
