import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parsePattern, matches, cronNext } from '../queue/cron.ts'

describe('parsePattern', () => {
  it('parses wildcard pattern', () => {
    const f = parsePattern('* * * * *')
    assert.equal(f.length, 5)
    assert.equal(f[0].size, 60)  // minutes 0-59
    assert.equal(f[1].size, 24)  // hours 0-23
    assert.equal(f[2].size, 31)  // days 1-31
    assert.equal(f[3].size, 12)  // months 1-12
    assert.equal(f[4].size, 7)   // days of week 0-6
  })

  it('parses specific values', () => {
    const f = parsePattern('30 14 15 6 1')
    assert.ok(f[0].has(30))   // minute
    assert.ok(f[1].has(14))   // hour
    assert.ok(f[2].has(15))   // day
    assert.ok(f[3].has(6))    // month
    assert.ok(f[4].has(1))    // day of week (Monday)
  })

  it('parses ranges', () => {
    const f = parsePattern('0-10 9-17 1-5 * *')
    for (let i = 0; i <= 10; i++) assert.ok(f[0].has(i))
    assert.ok(!f[0].has(11))
    for (let i = 9; i <= 17; i++) assert.ok(f[1].has(i))
  })

  it('parses steps', () => {
    const f = parsePattern('*/15 * * * *')
    assert.ok(f[0].has(0))
    assert.ok(f[0].has(15))
    assert.ok(f[0].has(30))
    assert.ok(f[0].has(45))
    assert.ok(!f[0].has(1))
  })

  it('parses range with step', () => {
    const f = parsePattern('0-30/10 * * * *')
    assert.ok(f[0].has(0))
    assert.ok(f[0].has(10))
    assert.ok(f[0].has(20))
    assert.ok(f[0].has(30))
    assert.ok(!f[0].has(40))
  })

  it('parses lists', () => {
    const f = parsePattern('0,15,30,45 * * * *')
    assert.ok(f[0].has(0))
    assert.ok(f[0].has(15))
    assert.ok(f[0].has(45))
    assert.ok(!f[0].has(10))
  })

  it('parses combinations', () => {
    const f = parsePattern('0-5,10-15/5 8-18/2 * * *')
    assert.ok(f[0].has(0))
    assert.ok(f[0].has(10))
    assert.ok(f[0].has(15))
    assert.ok(f[1].has(8))
    assert.ok(f[1].has(12))
    assert.ok(f[1].has(18))
  })

  it('rejects invalid field count', () => {
    assert.throws(() => parsePattern('* * * *'))
    assert.throws(() => parsePattern('* * * * * *'))
  })

  it('out-of-range values produce empty sets', () => {
    // Values outside range are silently filtered (expression never matches)
    const f = parsePattern('60 * * * *')
    assert.equal(f[0].size, 0)
  })
})

describe('matches', () => {
  it('matches wildcard against any time', () => {
    const f = parsePattern('* * * * *')
    assert.ok(matches(f, new Date('2024-01-15T12:30:00')))
  })

  it('matches specific minute', () => {
    const f = parsePattern('30 * * * *')
    assert.ok(matches(f, new Date('2024-01-15T12:30:00')))
    assert.ok(!matches(f, new Date('2024-01-15T12:31:00')))
  })

  it('matches specific hour', () => {
    const f = parsePattern('* 14 * * *')
    assert.ok(matches(f, new Date('2024-01-15T14:00:00')))
    assert.ok(!matches(f, new Date('2024-01-15T15:00:00')))
  })

  it('matches specific day of month', () => {
    const f = parsePattern('* * 15 * *')
    assert.ok(matches(f, new Date('2024-01-15T00:00:00')))
    assert.ok(!matches(f, new Date('2024-01-16T00:00:00')))
  })

  it('matches specific month', () => {
    const f = parsePattern('* * * 6 *')
    assert.ok(matches(f, new Date('2024-06-01T00:00:00')))
    assert.ok(!matches(f, new Date('2024-07-01T00:00:00')))
  })

  it('matches specific day of week', () => {
    const f = parsePattern('* * * * 1') // Monday
    const monday = new Date('2024-01-15T00:00:00') // Monday
    const tuesday = new Date('2024-01-16T00:00:00') // Tuesday
    assert.ok(matches(f, monday))
    assert.ok(!matches(f, tuesday))
  })

  it('matches all fields together', () => {
    const f = parsePattern('30 14 15 6 1') // June 15, 14:30, must be Monday
    // June 15, 2024 is a Saturday (day 6), not Monday (day 1)
    // Let's find a Monday: June 3, 2024, or June 10, 2024
    // June 15, 2026 is a Monday!
    assert.ok(matches(f, new Date('2026-06-15T14:30:00')))
    assert.ok(!matches(f, new Date('2026-06-15T14:31:00')))
  })

  it('matches range', () => {
    const f = parsePattern('0-5 * * * *')
    assert.ok(matches(f, new Date('2024-01-01T00:03:00')))
    assert.ok(!matches(f, new Date('2024-01-01T00:06:00')))
  })
})

describe('cronNext', () => {
  it('finds next minute for wildcard', () => {
    const now = new Date('2024-01-01T12:00:00')
    const next = cronNext('* * * * *', now)
    const d = new Date(next)
    assert.equal(d.getMinutes(), 1)
    assert.equal(d.getHours(), 12)
  })

  it('finds next minute with step', () => {
    const now = new Date('2024-01-01T12:00:00')
    const next = cronNext('*/15 * * * *', now)
    const d = new Date(next)
    assert.equal(d.getMinutes(), 15)
  })

  it('rolls over to next hour', () => {
    const now = new Date('2024-01-01T12:59:00')
    const next = cronNext('* * * * *', now)
    const d = new Date(next)
    assert.equal(d.getMinutes(), 0)
    assert.equal(d.getHours(), 13)
  })

  it('finds next matching hour', () => {
    const now = new Date('2024-01-01T12:00:00')
    const next = cronNext('0 14 * * *', now)
    const d = new Date(next)
    assert.equal(d.getHours(), 14)
    assert.equal(d.getMinutes(), 0)
  })

  it('handles complex expression', () => {
    // Every 15 minutes, 9-17 on weekdays
    const now = new Date('2024-01-15T12:05:00') // Monday 12:05
    const next = cronNext('*/15 9-17 * * 1-5', now)
    const d = new Date(next)
    assert.equal(d.getMinutes(), 15)
    assert.equal(d.getHours(), 12)
  })

  it('throws for impossible expression', () => {
    // February 30 doesn't exist
    assert.throws(() => cronNext('* * 30 2 *'))
  })
})
