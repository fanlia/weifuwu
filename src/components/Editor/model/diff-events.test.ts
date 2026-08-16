/**
 * Editor 模型 diff 测试 + 事件流本体测试
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { textDiff, diffStats, DIFF_MAX_LEN } from './diff.ts'
import { editEmit, editEvents, subscribeEditEvents, resetEditEvents } from '../edit-events.ts'

// ── diff ──────────────────────────────────────────────────────────────

function flatten(ops: { type: string; text: string }[]): string {
  return ops.map((o) => (o.type === 'equal' ? `=${o.text}` : o.type === 'insert' ? `+${o.text}` : `-${o.text}`)).join('')
}

function checkDiff(a: string, b: string): void {
  const ops = textDiff(a, b)
  // 重放校验：delete/equal 从 a 消费，insert/equal 产出 b
  let ia = 0
  let out = ''
  for (const op of ops) {
    if (op.type === 'equal') { assert.equal(a.slice(ia, ia + op.text.length), op.text); ia += op.text.length; out += op.text }
    else if (op.type === 'delete') { assert.equal(a.slice(ia, ia + op.text.length), op.text); ia += op.text.length }
    else out += op.text
  }
  assert.equal(ia, a.length, `a 消费完: ${flatten(ops)}`)
  assert.equal(out, b, `产出 b: ${flatten(ops)}`)
}

test('diff：相同文本', () => {
  assert.deepEqual(textDiff('abc', 'abc'), [{ type: 'equal', text: 'abc' }])
})

test('diff：纯插入/删除/替换', () => {
  checkDiff('hello world', 'hello beautiful world')
  checkDiff('hello world', 'hello')
  checkDiff('hello', 'world')
  checkDiff('', 'abc')
  checkDiff('abc', '')
  checkDiff('', '')
})

test('diff：中段修改（公共前后缀剪枝）', () => {
  checkDiff('这是一个测试文本', '这是一个润色后的测试文本')
  checkDiff('今天天气很好', '今天天气很差')
})

test('diff：中文与多行', () => {
  checkDiff('第一行\n第二行\n第三行', '第一行\n第二行（修改）\n第三行')
  checkDiff('你好世界', '你好，世界！')
})

test('diff：大文本裁剪（整体替换）', () => {
  const a = 'x'.repeat(DIFF_MAX_LEN)
  const b = 'y'.repeat(DIFF_MAX_LEN)
  const ops = textDiff(a, b)
  assert.equal(ops.length, 2)
  assert.equal(ops[0].type, 'delete')
  assert.equal(ops[1].type, 'insert')
})

test('diffStats：增删统计', () => {
  const ops = textDiff('hello', 'hello world')
  const s = diffStats(ops)
  assert.equal(s.added, 6)
  assert.equal(s.removed, 0)
})

// ── 事件流本体（与 ai/sandbox 同构） ─────────────────────────────────

test('editEvents：环形缓冲 + 查询过滤 + 订阅 + 隔离', () => {
  resetEditEvents()
  const seen: string[] = []
  const off = subscribeEditEvents((e) => seen.push(e.action))
  editEmit('text-insert', { at: 0 })
  editEmit('commit', { label: 'AI 润色' })
  editEmit('undo', {})
  assert.deepEqual(seen, ['text-insert', 'commit', 'undo'], '订阅同步回调')
  const all = editEvents()
  assert.equal(all.length, 3, '查询全部')
  assert.equal(all[0].action, 'undo', '倒序（最新在前）')
  const commits = editEvents(10, { action: 'commit' })
  assert.equal(commits.length, 1)
  assert.equal(commits[0].payload?.label, 'AI 润色')
  off()
  editEmit('redo', {})
  assert.deepEqual(seen, ['text-insert', 'commit', 'undo'], '退订后不再收到')
  resetEditEvents()
  assert.equal(editEvents().length, 0, '隔离')
})

test('editEvents：溢出覆盖（容量 2000）', () => {
  resetEditEvents()
  for (let i = 0; i < 2100; i++) editEmit('text-insert', { i })
  const all = editEvents()
  assert.equal(all.length, 2000)
  assert.equal(all[0].payload?.i, 2099, '最新保留')
  assert.equal(all[all.length - 1].payload?.i, 100, '最旧溢出')
  resetEditEvents()
})

test('__edit_tail 全局调试工具', () => {
  resetEditEvents()
  editEmit('ai-apply', { messageId: 'm1' })
  const w = globalThis as any
  assert.equal(typeof w.__edit_tail, 'function')
  const tail = w.__edit_tail(10)
  assert.equal(tail[0].action, 'ai-apply')
  assert.equal(tail[0].payload?.messageId, 'm1')
  resetEditEvents()
})
