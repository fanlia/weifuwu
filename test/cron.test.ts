import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { cron, startCron, stopCron, cronJobCount } from '../cron.ts'

describe('cron', () => {
  after(() => {
    stopCron()
  })

  // ── Pattern parsing ──

  it('rejects invalid pattern with wrong field count', () => {
    assert.throws(() => cron('* * * *', () => {}), /expected 5 fields/)
    assert.throws(() => cron('* * * * * *', () => {}), /expected 5 fields/)
  })

  it('accepts valid patterns', () => {
    cron('* * * * *', () => {}, { name: 'accept-all' })
    cron('0 * * * *', () => {}, { name: 'accept-every-hour' })
    cron('*/5 * * * *', () => {}, { name: 'accept-every-5' })
    cron('0 9 * * 1-5', () => {}, { name: 'accept-weekdays-9' })
    cron('30 8 * * 1,3,5', () => {}, { name: 'accept-mwf-830' })
    cron('0 0 1 * *', () => {}, { name: 'accept-first-day' })
  })

  it('rejects jobs with duplicate keys', () => {
    cron('0 0 * * *', () => {}, { name: 'dup-test' })
    assert.throws(
      () => cron('0 0 * * *', () => {}, { name: 'dup-test' }),
      /already registered/,
    )
  })

  it('runs after stop then start again', () => {
    stopCron()
    startCron()
    assert.ok(true)  // no crash
  })

  // ── Run behavior ──

  it('runs handler when pattern matches current time', async () => {
    const now = new Date()
    const pattern = `${now.getMinutes()} ${now.getHours()} ${now.getDate()} ${now.getMonth() + 1} *`

    let ran = false
    const j = cron(pattern, () => { ran = true }, { name: 'match-test-' + Date.now() })

    // Start scheduler — will run immediately
    stopCron()
    startCron()

    // Wait briefly for the tick
    await new Promise(r => setTimeout(r, 100))
    assert.ok(ran, 'handler should have run for matching pattern')

    j.stop()
  })

  it('does not run handler when pattern does not match', async () => {
    // A pattern that will never match: minute=99 (impossible)
    const pattern = '99 99 99 99 99'

    let ran = false
    const j = cron(pattern, () => { ran = true }, { name: 'no-match-' + Date.now() })

    await new Promise(r => setTimeout(r, 100))
    assert.ok(!ran, 'handler should not run for impossible pattern')

    j.stop()
  })

  it('running job does not block other jobs', async () => {
    const now = new Date()
    const pattern = `${now.getMinutes()} ${now.getHours()} ${now.getDate()} ${now.getMonth() + 1} *`

    let order: string[] = []
    const j1 = cron(pattern, async () => {
      order.push('slow-start')
      await new Promise(r => setTimeout(r, 50))
      order.push('slow-end')
    }, { name: 'block-test-slow-' + Date.now() })

    const j2 = cron(pattern, () => {
      order.push('fast')
    }, { name: 'block-test-fast-' + Date.now() })

    // Restart scheduler to trigger immediate tick
    stopCron()
    startCron()

    await new Promise(r => setTimeout(r, 200))
    assert.ok(order.includes('fast'), 'fast job should run even if slow is still running')
    assert.ok(order.includes('slow-start'), 'slow job should have started')
    assert.ok(order.includes('slow-end'), 'slow job should have completed')

    j1.stop()
    j2.stop()
  })

  it('job.stop() removes the job', () => {
    const j = cron('0 0 * * *', () => {})
    const countBefore = cronJobCount()
    j.stop()
    const countAfter = cronJobCount()
    assert.equal(countAfter, countBefore - 1)
  })

  // ── Start/stop lifecycle ──

  it('startCron is idempotent', () => {
    startCron()
    startCron()
    startCron()
    // Should not crash or create multiple intervals
  })

  it('stopCron is idempotent', () => {
    stopCron()
    stopCron()
    stopCron()
  })

  it('cronJobCount returns non-negative number', () => {
    const count = cronJobCount()
    assert.ok(typeof count === 'number')
    assert.ok(count >= 0)
  })

  // ── Pattern parsing edge cases ──

  it('handles */minute patterns', () => {
    cron('*/10 * * * *', () => {}, { name: 'every-10-min' })
    cron('*/30 * * * *', () => {}, { name: 'edge-every-30' })
  })

  it('handles range patterns', () => {
    cron('0 9-17 * * *', () => {}, { name: 'edge-work-hours' })
    cron('0 0 * * 0-6', () => {}, { name: 'every-day' })
  })

  it('handles list patterns', () => {
    cron('0 0 * * 1,3,5', () => {}, { name: 'm-w-f' })
  })
})
