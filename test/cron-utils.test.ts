import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseField, parsePattern, matches, cronNext } from '../cron-utils.ts'

describe('cron-utils', () => {
  describe('parseField', () => {
    it('parses wildcard', () => {
      const r = parseField('*', 0, 59)
      assert.equal(r.size, 60)
      assert.ok(r.has(0))
      assert.ok(r.has(59))
    })

    it('parses single value', () => {
      const r = parseField('5', 0, 59)
      assert.equal(r.size, 1)
      assert.ok(r.has(5))
    })

    it('parses comma-separated values', () => {
      const r = parseField('1,3,5', 0, 59)
      assert.equal(r.size, 3)
      assert.ok(r.has(1) && r.has(3) && r.has(5))
    })

    it('parses range', () => {
      const r = parseField('10-15', 0, 59)
      assert.equal(r.size, 6)
      assert.ok(r.has(10) && r.has(15))
    })

    it('parses step with wildcard', () => {
      const r = parseField('*/5', 0, 59)
      assert.ok(r.has(0) && r.has(5) && r.has(55))
      assert.equal(r.size, 12)
    })

    it('parses step with range', () => {
      const r = parseField('10-20/5', 0, 59)
      assert.ok(r.has(10) && r.has(15) && r.has(20))
      assert.equal(r.size, 3)
    })

    it('filters out-of-range values', () => {
      const r = parseField('100', 0, 59)
      assert.equal(r.size, 0)
    })

    it('throws on invalid step', () => {
      assert.throws(() => parseField('*/0', 0, 59), /Invalid cron step/)
    })

    it('throws on invalid range', () => {
      assert.throws(() => parseField('a-b', 0, 59), /Invalid cron range/)
    })

    it('throws on invalid value', () => {
      assert.throws(() => parseField('abc', 0, 59), /Invalid cron value/)
    })
  })

  describe('parsePattern', () => {
    it('parses standard 5-field pattern', () => {
      const fields = parsePattern('*/5 9-17 * * 1-5')
      assert.equal(fields.length, 5)
      // minute: */5
      assert.ok(fields[0].has(0) && fields[0].has(5))
      // hour: 9-17
      assert.ok(fields[1].has(9) && fields[1].has(17))
      assert.ok(!fields[1].has(8))
      // day of month: *
      assert.equal(fields[2].size, 31)
      // month: *
      assert.equal(fields[3].size, 12)
      // day of week: 1-5
      assert.ok(fields[4].has(1) && fields[4].has(5))
      assert.ok(!fields[4].has(0) && !fields[4].has(6))
    })

    it('throws on wrong number of fields', () => {
      assert.throws(() => parsePattern('* * * *'), /expected 5 fields/)
      assert.throws(() => parsePattern('* * * * * *'), /expected 5 fields/)
    })

    it('handles every-minute pattern', () => {
      const fields = parsePattern('* * * * *')
      assert.equal(fields[0].size, 60)
      assert.equal(fields[1].size, 24)
    })
  })

  describe('matches', () => {
    function date(s: string): Date {
      // Format: "2026-06-13 14:30" in local timezone
      const [d, t] = s.split(' ')
      const [y, m, day] = d.split('-').map(Number)
      const [h, min] = t.split(':').map(Number)
      return new Date(y, m - 1, day, h, min)
    }

    it('matches at exact time', () => {
      const fields = parsePattern('30 14 * * *') // daily at 14:30
      assert.ok(matches(fields, date('2026-06-13 14:30')))
      assert.ok(!matches(fields, date('2026-06-13 14:31')))
    })

    it('matches weekly on weekdays', () => {
      const fields = parsePattern('0 9 * * 1-5') // weekdays at 09:00
      // 2026-06-15 is a Monday
      assert.ok(matches(fields, date('2026-06-15 09:00')))
      // 2026-06-14 is a Sunday
      assert.ok(!matches(fields, date('2026-06-14 09:00')))
    })

    it('matches every 5 minutes', () => {
      const fields = parsePattern('*/5 * * * *')
      assert.ok(matches(fields, date('2026-06-13 10:00')))
      assert.ok(matches(fields, date('2026-06-13 10:05')))
      assert.ok(!matches(fields, date('2026-06-13 10:01')))
    })
  })

  describe('cronNext', () => {
    it('returns next minute for * * * * *', () => {
      const from = new Date(2026, 5, 13, 10, 0) // June 13, 10:00 local
      const next = cronNext('* * * * *', from)
      // Should be 10:01
      const d = new Date(next)
      assert.equal(d.getHours(), 10)
      assert.equal(d.getMinutes(), 1)
    })

    it('returns next 15-min boundary', () => {
      const from = new Date(2026, 5, 13, 10, 7) // 10:07 local
      const next = cronNext('*/15 * * * *', from)
      // Should be 10:15
      const d = new Date(next)
      assert.equal(d.getHours(), 10)
      assert.equal(d.getMinutes(), 15)
    })

    it('returns next hour for specific minute', () => {
      const from = new Date(2026, 5, 13, 10, 30) // 10:30 local
      const next = cronNext('0 * * * *', from)
      // Should be 11:00
      const d = new Date(next)
      assert.equal(d.getHours(), 11)
      assert.equal(d.getMinutes(), 0)
    })

    it('returns next day for specific time', () => {
      const from = new Date(2026, 5, 13, 23, 30) // June 13, 23:30 local
      const next = cronNext('0 0 * * *', from)
      const d = new Date(next)
      assert.equal(d.getHours(), 0)
      assert.equal(d.getMinutes(), 0)
      // Should be next day (June 14)
      assert.equal(d.getDate(), 14)
      assert.ok(d.getTime() > from.getTime())
    })

    it('throws when no future date found (unreachable pattern)', () => {
      const from = new Date(2026, 5, 13, 10, 0) // June 13, 10:00 local
      assert.throws(() => cronNext('59 23 31 2 0', from), /No future date found/)
    })
  })
})
