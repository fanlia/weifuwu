/**
 * CHANGELOG 域分组契约（docs-可学习性 W2——release.mjs 生成逻辑可测面）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCommitLine, parseCommits, formatEntry } from './changelog-format.mjs'

test('W2：scope 提取——feat(orm): xxx → 域 orm', () => {
  const p = parseCommitLine('1234567 feat(orm): bodyOf 输入面')
  assert.deepEqual(p, { type: 'feat', scope: 'orm', title: 'bodyOf 输入面' })
})

test('W2：无 scope → 核心层（域标签诚实——不猜测）', () => {
  const { groups } = parseCommits('abc feat: serve 修正')
  assert.equal(groups.feat[0], 'core：serve 修正')
})

test('W2：多域聚合 + 域统计 + 无平铺 Other', () => {
  const log = ['a feat(orm): x', 'b feat(api): y', 'c fix(orm): z', 'd chore: w', 'e 非 conventional 行']
  const { groups, scopes } = parseCommits(log.join('\n'))
  assert.equal(groups.feat.length, 2)
  assert.match(groups.feat[0], /^orm：x$/)
  assert.match(groups.feat[1], /^api：y$/)
  assert.match(groups.fix[0], /^orm：z$/)
  assert.match(groups.chore[0], /^core：w$/)
  assert.match(groups.other[0], /非 conventional 行/)
  const entry = formatEntry('0.92.0', '2027-01-01', groups, scopes)
  assert.match(entry, /按域统计：orm 2 · api 1 · core 2/)
  assert.match(entry, /### Other（未分类——人工补域）/)
})

test('W2：非 conventional 归 other——不丢真实提交（Other 组保留）', () => {
  const { groups } = parseCommits('xyz 手动提交（无类型前缀）')
  assert.equal(groups.other.length, 1)
})
