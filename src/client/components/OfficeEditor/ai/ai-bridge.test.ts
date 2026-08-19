/**
 * ODES × AI 事件流对接测试（design/office-events-plan.md §9）：
 * - xlsx 默认解析：公式/数字/布尔/文本 → cell-set ops；ref 内嵌/活动单元格
 * - pptx 文本解析：shape-set
 * - 事件流桥接：payload.ai.messageId + target 关联（editEvents ↔ aiEvents 一条链）
 * - 拒绝不产生 op（状态记录）
 */

import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from '../../../vdom/setup.ts'
import {
  emitAiApply, emitAiReject, parseFormulaReply, parseReplyByMode, parseShapeTextReply,
} from './ai-bridge.ts'
import { editEvents, resetEditEvents } from '../../Editor/edit-events.ts'
import type { SheetCell } from '../model/types.ts'

describe('ODES × AI（公式/文本解析 + 事件流桥接）', () => {
  before(() => { setupJsdom() })

  test('parseFormulaReply：公式/数字/布尔/文本 → cell-set ops', () => {
    const r = parseFormulaReply('=SUM(A1:B5)', { docType: 'xlsx', ref: 'C1' })
    assert.equal(r.ops.length, 1)
    const op = r.ops[0] as Extract<SheetCell & { type: string }, any>
    assert.equal(op.type, 'cell-set')
    assert.equal(op.ref, 'C1', '活动单元格默认位置')
    assert.equal(op.cell.kind, 'f')
    assert.equal(op.cell.formula, '=SUM(A1:B5)')

    const r2 = parseFormulaReply('42', { docType: 'xlsx', ref: 'B2' })
    assert.equal((r2.ops[0] as any).cell.kind, 'n')
    assert.equal((r2.ops[0] as any).cell.value, 42)

    const r3 = parseFormulaReply('true', { docType: 'xlsx', ref: 'A1' })
    assert.equal((r3.ops[0] as any).cell.kind, 'b')

    const r4 = parseFormulaReply('合计', { docType: 'xlsx', ref: 'D4' })
    assert.equal((r4.ops[0] as any).cell.kind, 's')
    assert.equal((r4.ops[0] as any).cell.value, '合计')
  })

  test('parseFormulaReply：回复内嵌 ref（B2: 值 / B2=值）优先', () => {
    const r = parseFormulaReply('B2: 100\nC2: =B2*2', { docType: 'xlsx', ref: 'A1' })
    assert.equal(r.ops.length, 2)
    assert.equal((r.ops[0] as any).ref, 'B2')
    assert.equal((r.ops[0] as any).cell.value, 100)
    assert.equal((r.ops[1] as any).ref, 'C2')
    assert.equal((r.ops[1] as any).cell.formula, '=B2*2')
  })

  test('parseFormulaReply：不可解析 → 空 ops + note（诚实——不静默）', () => {
    const r = parseFormulaReply('对不起，这个问题我无法直接回答，请换一种方式提问', { docType: 'xlsx', ref: 'A1' })
    assert.equal(r.ops.length, 0)
    assert.ok(r.note, 'note 说明')
  })

  test('parseShapeTextReply：选中 shape → shape-set；未选中 → note', () => {
    const r = parseShapeTextReply('新的标题文本', { docType: 'pptx', shapeId: 's1' })
    assert.equal(r.ops.length, 1)
    const op = r.ops[0] as any
    assert.equal(op.type, 'shape-set')
    assert.equal(op.shapeId, 's1')
    assert.equal(op.props.text, '新的标题文本')

    const r2 = parseShapeTextReply('文本', { docType: 'pptx' })
    assert.equal(r2.ops.length, 0)
    assert.ok(r2.note)
  })

  test('parseReplyByMode：docType 分发（docx → Editor 层——不产生 op）', () => {
    const r = parseReplyByMode('润色后的段落', { docType: 'docx', selectionText: '原文' })
    assert.equal(r.ops.length, 0)
    assert.ok(r.note?.includes('Editor'), 'docx 走 Editor ai-apply')
  })

  test('事件流桥接：payload.ai + target=messageId（edit ↔ ai 一条链）', () => {
    resetEditEvents()
    emitAiApply('xlsx',
      { type: 'cell-set', sheet: 0, ref: 'A1', cell: { kind: 'f', value: '', formula: '=SUM(1,2)' } },
      'msg-123',
    )
    emitAiReject('pptx', 'msg-456')
    const all = editEvents(10, { action: 'office' })
    assert.equal(all.length, 2)
    // 关联键：target = messageId
    assert.equal(all[0].target, 'msg-456', '拒绝事件的 target = messageId')
    assert.equal(all[1].target, 'msg-123')
    const p1 = all[1].payload as any
    assert.equal(p1.docType, 'xlsx')
    assert.equal(p1.op.type, 'cell-set')
    assert.equal(p1.ai.status, 'accepted')
    // 拒绝：无 op（不产生编辑——诚实）
    const p0 = all[0].payload as any
    assert.equal(p0.op, undefined)
    assert.equal(p0.ai.status, 'rejected')
    // 过滤审计：__edit_tail(50, 'office')
    const tail = (globalThis as any).__edit_tail?.(10, 'office')
    assert.equal(tail?.length, 2)
    resetEditEvents()
  })
})
