/**
 * cron 解析器契约（零依赖 5 字段子集——语法：* a/N N N-M N,M 逗号列表）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCron, minuteKey } from './cron.ts'

test('cron: * * * * * 恒真', () => {
  const m = parseCron('* * * * *')
  for (const t of [new Date(2026, 0, 1, 0, 0), new Date(2026, 5, 15, 23, 59)]) assert.ok(m(t))
})

test('cron: */5 每 5 分钟', () => {
  const m = parseCron('*/5 * * * *')
  assert.ok(m(new Date(2026, 0, 1, 10, 0)))
  assert.ok(m(new Date(2026, 0, 1, 10, 55)))
  assert.ok(!m(new Date(2026, 0, 1, 10, 3)))
  assert.ok(!m(new Date(2026, 0, 1, 10, 59)))
})

test('cron: 0 9 * * 1-5 工作日 9 点整', () => {
  const m = parseCron('0 9 * * 1-5')
  assert.ok(m(new Date(2026, 0, 5, 9, 0))) // 周一
  assert.ok(!m(new Date(2026, 0, 3, 9, 0))) // 周六
  assert.ok(!m(new Date(2026, 0, 5, 9, 30))) // 分钟不符
  assert.ok(!m(new Date(2026, 0, 5, 10, 0))) // 小时不符
})

test('cron: 列表 30,0 与 范围-单值 组合', () => {
  const m = parseCron('30,0 * * * *')
  assert.ok(m(new Date(2026, 0, 1, 8, 0)))
  assert.ok(m(new Date(2026, 0, 1, 8, 30)))
  assert.ok(!m(new Date(2026, 0, 1, 8, 15)))
  const mon = parseCron('* * * 6 *')
  assert.ok(mon(new Date(2026, 5, 1, 12, 0)))
  assert.ok(!mon(new Date(2026, 0, 1, 12, 0)))
})

test('cron: 非法表达式抛错（越界/缺字段/未知语法）', () => {
  assert.throws(() => parseCron('* * * *'), /5 字段/)
  assert.throws(() => parseCron('60 * * * *'), /越界/)
  assert.throws(() => parseCron('* 24 * * *'), /越界/)
  assert.throws(() => parseCron('a * * * *'), /无法识别/)
  assert.throws(() => parseCron('5-1 * * * *'), /起大于止/)
  assert.throws(() => parseCron('* * 0 * *'), /越界/)
})

test('cron: minuteKey 幂等键格式', () => {
  assert.equal(minuteKey(new Date(2026, 0, 5, 9, 7)), '2026-01-05T09:07')
})
