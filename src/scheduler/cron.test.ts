/**
 * cron 表达式解析器测试（纯函数，无外部依赖）
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseCron, nextRun } from './cron.ts'

/** 本地时区构造（cron 语义 = 服务器本地时区，经典 cron 行为） */
function local(y: number, mo: number, d: number, h = 0, mi = 0): Date {
  return new Date(y, mo - 1, d, h, mi)
}

/** 断言年月日时分 */
function assertAt(d: Date, y: number, mo: number, day: number, h: number, mi: number) {
  assert.equal(d.getFullYear(), y)
  assert.equal(d.getMonth() + 1, mo)
  assert.equal(d.getDate(), day)
  assert.equal(d.getHours(), h)
  assert.equal(d.getMinutes(), mi)
}

describe('cron parser', () => {
  it('每分钟：* * * * *', () => {
    const c = parseCron('* * * * *')
    assert.equal(c.fields[0].values, null)
    assert.equal(c.domExplicit, false)
    assert.equal(c.dowExplicit, false)
  })

  it('步进：*/5 * * * * → 0,5,10,...,55', () => {
    const c = parseCron('*/5 * * * *')
    const mins = c.fields[0].values!
    assert.equal(mins.size, 12)
    assert.ok(mins.has(0) && mins.has(5) && mins.has(55))
  })

  it('列表：0,30 * * * *', () => {
    const c = parseCron('0,30 * * * *')
    assert.deepEqual([...c.fields[0].values!].sort((a, b) => a - b), [0, 30])
  })

  it('范围：0 9 * * 1-5 → 工作日 9 点', () => {
    const c = parseCron('0 9 * * 1-5')
    assert.deepEqual([...c.fields[4].values!].sort((a, b) => a - b), [1, 2, 3, 4, 5])
    assert.equal(c.dowExplicit, true)
  })

  it('范围+步进：0 8-18/2 * * * → 偶数小时', () => {
    const c = parseCron('0 8-18/2 * * *')
    assert.deepEqual([...c.fields[1].values!].sort((a, b) => a - b), [8, 10, 12, 14, 16, 18])
  })

  it('非法：字段数不对（4 字段）', () => {
    assert.throws(() => parseCron('* * * *'), /expected 5 fields/)
  })

  it('非法：值超界（分 60）', () => {
    assert.throws(() => parseCron('60 * * * *'), /out of range/)
  })

  it('非法：步进 0（*/0）', () => {
    assert.throws(() => parseCron('*/0 * * * *'), /invalid step/)
  })

  it('非法：乱字符', () => {
    assert.throws(() => parseCron('abc * * * *'), /out of range|invalid/)
    assert.throws(() => parseCron('@daily'), /expected 5 fields/)
  })
})

describe('cron nextRun', () => {
  it('每分钟：10:00:30 → 10:01:00', () => {
    const c = parseCron('* * * * *')
    assertAt(nextRun(c, local(2026, 9, 1, 10, 0)), 2026, 9, 1, 10, 1)
  })

  it('每 5 分钟：10:02 → 10:05；10:56 → 11:00', () => {
    const c = parseCron('*/5 * * * *')
    assertAt(nextRun(c, local(2026, 9, 1, 10, 2)), 2026, 9, 1, 10, 5)
    assertAt(nextRun(c, local(2026, 9, 1, 10, 56)), 2026, 9, 1, 11, 0)
  })

  it('每天 9 点：08:00 → 当天 09:00；10:00 → 明天 09:00', () => {
    const c = parseCron('0 9 * * *')
    assertAt(nextRun(c, local(2026, 9, 1, 8, 0)), 2026, 9, 1, 9, 0)
    assertAt(nextRun(c, local(2026, 9, 1, 10, 0)), 2026, 9, 2, 9, 0)
  })

  it('每月 1 日：09-15 → 10-01', () => {
    const c = parseCron('0 0 1 * *')
    assertAt(nextRun(c, local(2026, 9, 15, 12, 0)), 2026, 10, 1, 0, 0)
  })

  it('工作日 9 点（周 1-5）：周六 12:00 → 周一 09:00', () => {
    const c = parseCron('0 9 * * 1-5')
    // 2026-09-05 是周六（本地）
    assertAt(nextRun(c, local(2026, 9, 5, 12, 0)), 2026, 9, 7, 9, 0)
  })

  it('周日 14:30', () => {
    const c = parseCron('30 14 * * 0')
    // 2026-09-06 是周日（本地）
    assertAt(nextRun(c, local(2026, 9, 5, 0, 0)), 2026, 9, 6, 14, 30)
  })

  it('分钟列表 0,30：10:45 → 11:00', () => {
    const c = parseCron('0,30 * * * *')
    assertAt(nextRun(c, local(2026, 9, 1, 10, 45)), 2026, 9, 1, 11, 0)
  })
})
