/**
 * CHAT-INTERACTION 波次 2：HITL 快捷确认按钮——解析层单测（services 契约）
 *
 * parseQuickReplies：AI 确认型提问末尾 [[choices:a|b|c]] 标记的剥离与提取。
 * 防御性约束（非信任 AI 输出格式）：上限 4 项 / 单项裁 20 字符 / 多标记取末次 /
 * 空项过滤 / 无标记透传（渐进增强——零影响）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQuickReplies } from '../src/services/chat.ts'

test('标记剥离：content 干净 + 选项提取（走查场景「请确认清理范围」）', () => {
  const r = parseQuickReplies('检测到磁盘不足，请确认清理范围。\n[[choices:清理 30 天前备份|全部清理|暂不清理]]')
  assert.equal(r.content, '检测到磁盘不足，请确认清理范围。')
  assert.deepEqual(r.quickReplies, ['清理 30 天前备份', '全部清理', '暂不清理'])
})

test('无标记 → 原文透传（渐进增强——普通回复零影响）', () => {
  const r = parseQuickReplies('正常的回复，没有任何标记。')
  assert.equal(r.content, '正常的回复，没有任何标记。')
  assert.deepEqual(r.quickReplies, [])
})

test('多标记取末次（AI 输出格式容错）+ 全部剥离', () => {
  const r = parseQuickReplies('先说 A[[choices:x|y]]再说 B\n[[choices:好|不好]]')
  assert.equal(r.content, '先说 A再说 B')
  assert.deepEqual(r.quickReplies, ['好', '不好'])
})

test('防御性约束：上限 4 项 / 单项裁 20 字符 / 空项过滤', () => {
  const long = '一'.repeat(30)
  const r = parseQuickReplies(`[[choices:||||a|${long}|b|c|d|e]]`)
  assert.ok(r.quickReplies.length <= 4, `上限 4（实际 ${r.quickReplies.length}）`)
  assert.equal(r.quickReplies[0], 'a')
  assert.ok(r.quickReplies.every((s) => s.length <= 20), '单项 ≤ 20 字符')
})

test('content 内多标记（正文中途出现）也全剥离——不残留给用户', () => {
  const r = parseQuickReplies('开头[[choices:a|b]]中间[[choices:c|d]]结尾')
  assert.equal(r.content, '开头中间结尾')
  assert.deepEqual(r.quickReplies, ['c', 'd'])
})
