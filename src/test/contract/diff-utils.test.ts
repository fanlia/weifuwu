/**
 * 契约测试——DiffView 纯函数（diffLines + groupDiffLines）
 * 背景：2027-XX 组件验证批次 3 实证——groupDiffLines 从未分段（全部行进同一 run、
 * 末尾 flush 一次），整个 diff 被当成首行 kind 的单组（same:12 覆盖 remove/add——
 * 折叠/展开全错）。修复后锁定分段契约：kind 切换即断段（AGENTS §3 修复归类纪律）。
 * 运行：node --env-file=.env --test src/test/contract/diff-utils.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffLines, groupDiffLines } from '../../client/components/DiffView/diff-utils.ts'

test('diffLines：LCS 对账——old/new 消费行数精确相等', () => {
  // 纯增
  const r2 = diffLines('a\nc', 'a\nb\nc')
  assert.deepEqual(r2.map((l) => l.type), ['same', 'add', 'same'])
  // 纯删
  const r3 = diffLines('a\nb\nc', 'a\nc')
  assert.deepEqual(r3.map((l) => l.type), ['same', 'remove', 'same'])
  // 混合
  const r1 = diffLines('a\nb\nc', 'a\nB\nc')
  assert.equal(r1.filter((l) => l.type !== 'add').length, 3, 'old 消费 3 行')
  assert.equal(r1.filter((l) => l.type !== 'remove').length, 3, 'new 消费 3 行')
})

test('groupDiffLines：kind 切换即断段（same/change 交替分段——修复回归）', () => {
  const lines = diffLines('a\nb\nc\nd', 'a\nX\nc\nd')
  // same(a),remove(b),add(X),same(c),same(d) → 3 组：same:1 | change | same:2
  const groups = groupDiffLines(lines)
  assert.deepEqual(
    groups.map((g) => `${g.kind}${g.sameCount != null ? ':' + g.sameCount : ''}`),
    ['same:1', 'change', 'same:2'],
    `分段结果 ${groups.map((g) => g.kind).join('|')}`,
  )
})

test('groupDiffLines：连读 change 不按 add/remove 断段（单 change 组）', () => {
  const lines = diffLines('a\nb\nc', 'a\nX\nY\nc')
  // same, remove, remove, add, same —— remove 与 add 相邻不 break（同属 change 组）
  const groups = groupDiffLines(lines)
  assert.deepEqual(
    groups.map((g) => `${g.kind}${g.sameCount != null ? ':' + g.sameCount : ''}`),
    ['same:1', 'change', 'same:1'],
  )
  assert.equal(groups[1].lines.length, 3, 'change 组含 2 remove + 1 add')
})

test('groupDiffLines：全 same 输入 → 单 same 组；空输入 → 空组', () => {
  const allSame = groupDiffLines(diffLines('a\nb', 'a\nb'))
  assert.equal(allSame.length, 1)
  assert.equal(allSame[0].kind, 'same')
  assert.equal(allSame[0].sameCount, 2)
  assert.deepEqual(groupDiffLines([]), [], '空输入 → 空组')
})
