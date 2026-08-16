/**
 * weifuwu/components/OfficeEditor/ai — ODES × AI 事件流对接
 *
 * 设计（design/office-events-plan.md §9）：AI 落地 = 普通 op + ai 元数据。
 * 本模块：AI 回复 → OfficeOp[] 默认解析（按 mode）+ 事件流桥接发射。
 *
 * xlsx formula 模式解析：
 * - 回复含 `=...` → 公式单元格（kind:'f'——值 + formula 字符串保留——不计算）
 * - 纯数字 → kind:'n'；true/false → kind:'b'；其余 → kind:'s'
 * - 位置：回复内嵌 ref（`A1:` 前缀 / `B2=...`）优先，否则 ctx.ref（活动单元格）
 */

import type { AiContext, OfficeOp, OfficeStreamPayload } from '../model/types.ts'
import type { SheetCell } from '../model/types.ts'
import { editEmit } from '../../Editor/edit-events.ts'
import type { DocType } from '../model/types.ts'

// ── 回复解析（默认——按 mode） ─────────────────────────────────────────────

export interface ParseResult {
  ops: OfficeOp[]
  /** 解析说明（UI 展示；不可解析时建议） */
  note?: string
}

/** AI 回复 → cell-set ops（formula 模式） */
export function parseFormulaReply(text: string, ctx: AiContext): ParseResult {
  const clean = text.trim()
  // 单行或多行——每行一个单元格写入；行内 `ref=value` 或 `ref: value`
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean)
  const ops: OfficeOp[] = []
  const sheet = 0
  let used = false
  for (const line of lines) {
    const m = /^([A-Z]+\d+)\s*[:=]\s*(.*)$/.exec(line)
    if (m) {
      const cell = parseCellValue(m[2].trim())
      ops.push({ type: 'cell-set', sheet, ref: m[1], cell })
      used = true
      continue
    }
    // 无 ref——整行作为活动单元格内容（文本限短值——长文本是自然语言回复）
    if (!used && lines.length === 1) {
      const cell = parseCellValue(line)
      if (cell.kind === 's' && line.length > 16) continue
      ops.push({ type: 'cell-set', sheet, ref: ctx.ref ?? 'A1', cell })
      used = true
    }
  }
  if (!used) {
    return { ops: [], note: '回复无法解析为单元格内容（期望公式/值或 `A1: 值` 格式）' }
  }
  return { ops }
}

function parseCellValue(v: string): SheetCell {
  if (v.startsWith('=')) return { kind: 'f', value: '', formula: v }
  if (/^-?\d+(\.\d+)?$/.test(v)) return { kind: 'n', value: Number(v) }
  if (v === 'true' || v === 'false') return { kind: 'b', value: v === 'true' }
  return { kind: 's', value: v }
}

/** AI 回复 → shape-set op（pptx text 模式——选中 shape 文本替换） */
export function parseShapeTextReply(text: string, ctx: AiContext): ParseResult {
  if (!ctx.shapeId) return { ops: [], note: '未选中形状（先点选文本框再触发 AI）' }
  const clean = text.trim()
  if (!clean) return { ops: [], note: 'AI 回复为空' }
  return {
    ops: [{ type: 'shape-set', slide: 0, shapeId: ctx.shapeId, props: { text: clean } }],
  }
}

/** docx/text 模式：回复即正文——Editor ai-apply 语义由 Editor 层处理（本模块不产生 op） */
export function parseTextReply(_text: string, _ctx: AiContext): ParseResult {
  return { ops: [], note: 'docx 文本 AI 走 Editor ai-apply（选区替换——Editor 层处理）' }
}

export function parseReplyByMode(text: string, ctx: AiContext): ParseResult {
  if (ctx.docType === 'xlsx') return parseFormulaReply(text, ctx)
  if (ctx.docType === 'pptx') return parseShapeTextReply(text, ctx)
  return parseTextReply(text, ctx)
}

// ── 事件流桥接（edit ↔ ai 关联审计） ───────────────────────────────────────

/**
 * 发射 office 事件（AI 关联——payload.ai.messageId + target = messageId——
 * editEvents ↔ aiEvents 一条链：`__edit_tail(50,'office')` ↔ `__ai_events(n,{messageId})`）
 */
export function officeAiEmit(
  payload: Omit<OfficeStreamPayload, 'ai'> & { ai: { messageId: string; status: 'suggested' | 'accepted' | 'rejected' } },
): void {
  editEmit('office', payload as unknown as Record<string, unknown>, payload.ai.messageId)
}

/** 便捷：AI 建议接受 = 普通 op 落地（ai 元数据——接受状态） */
export function emitAiApply(docType: DocType, op: OfficeOp, messageId: string): void {
  officeAiEmit({ docType, op, ai: { messageId, status: 'accepted' } })
}

/** 便捷：AI 建议拒绝（不产生 op——状态记录审计） */
export function emitAiReject(docType: DocType, messageId: string, reason?: string): void {
  editEmit('office', { docType, ai: { messageId, status: 'rejected' }, reason } as unknown as Record<string, unknown>, messageId)
}
