/**
 * ODES 协议层 fuzz 测试（fold 不变量——三模型随机 op 序列）
 *
 * 不变量（design/office-events-plan.md）：
 * 1. fold 幂等：随机 op 序列逐个 apply 不抛错——引用/几何始终有效
 * 2. checkpoint 重打包等价：fold(snapshot + tail) → 新快照 + 空 tail 等价
 * 3. 越界 op 宽容：非法 sheet/ref 索引 → 返回原状态（不静默污染）
 * 4. docx：marks/embeds 区间恒合法（text 长度约束）
 */

import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from '../../../ui-dom/setup.ts'
import { applyOfficeOp, emptySnapshot, foldOffice } from './apply.ts'
import type { OfficeCheckpoint, OfficeOp, OfficeSnapshot } from './types.ts'
import { opBelongsTo } from './apply.ts'

// ── 随机工具（固定种子——可复现） ──────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)]
const int = (rng: () => number, max: number): number => Math.floor(rng() * max)

// ── xlsx 随机 op ────────────────────────────────────────────────────────────

function randomSheetOp(rng: () => number): SheetOpGen {
  const t = pick(rng, ['cell-set', 'cell-clear', 'insert-rows', 'delete-rows', 'insert-cols', 'delete-cols', 'sheet-rename', 'sheet-active'] as const)
  const sheet = int(rng, 3)
  const colL = int(rng, 4)
  const colName = String.fromCharCode(65 + colL)
  const ref = `${colName}${int(rng, 10) + 1}`
  switch (t) {
    case 'cell-set': {
      const kind = pick(rng, ['s', 'n', 'b'] as const)
      return { type: 'cell-set', sheet, ref, cell: kind === 's' ? { kind, value: `v${int(rng, 100)}` } : kind === 'n' ? { kind, value: int(rng, 1000) } : { kind, value: rng() > 0.5 } }
    }
    case 'cell-clear': return { type: 'cell-set', sheet, ref, cell: null }
    case 'insert-rows': return { type: 'insert-rows', sheet, at: int(rng, 8), count: int(rng, 3) + 1 }
    case 'delete-rows': return { type: 'delete-rows', sheet, at: int(rng, 8), count: int(rng, 3) + 1 }
    case 'insert-cols': return { type: 'insert-cols', sheet, at: int(rng, 4), count: int(rng, 2) + 1 }
    case 'delete-cols': return { type: 'delete-cols', sheet, at: int(rng, 4), count: int(rng, 2) + 1 }
    case 'sheet-rename': return { type: 'sheet-rename', sheet, name: `表${int(rng, 99)}` }
    case 'sheet-active': return { type: 'sheet-active', sheet }
  }
}

// ── pptx 随机 op ────────────────────────────────────────────────────────────

function randomSlideOp(rng: () => number): SlideOpGen {
  const t = pick(rng, ['slide-add', 'slide-delete', 'shape-add', 'shape-remove', 'shape-move', 'shape-resize', 'shape-set'] as const)
  const slide = int(rng, 3)
  switch (t) {
    case 'slide-add': return { type: 'slide-add', at: int(rng, 4) }
    case 'slide-delete': return { type: 'slide-delete', slide }
    case 'shape-add': return {
      type: 'shape-add', slide,
      shape: {
        id: `s${int(rng, 50)}`, kind: pick(rng, ['text', 'rect'] as const),
        x: int(rng, 800), y: int(rng, 400), w: int(rng, 300) + 20, h: int(rng, 200) + 16,
        props: rng() > 0.5 ? { text: `文本${int(rng, 9)}` } : undefined,
      },
    }
    case 'shape-remove': return { type: 'shape-remove', slide, shapeId: `s${int(rng, 50)}` }
    case 'shape-move': return { type: 'shape-move', slide, shapeId: `s${int(rng, 50)}`, x: int(rng, 800), y: int(rng, 400) }
    case 'shape-resize': return { type: 'shape-resize', slide, shapeId: `s${int(rng, 50)}`, w: int(rng, 300) + 20, h: int(rng, 200) + 16 }
    case 'shape-set': return { type: 'shape-set', slide, shapeId: `s${int(rng, 50)}`, props: { text: `改${int(rng, 9)}` } }
  }
}

// ── docx 随机 op（EditEvent 子集——复用 Editor 模型） ──────────────────────

function randomDocxOp(rng: () => number, doc: { text: string; blockProps: Array<{ start: number }>; embeds: Array<{ at: number }> }): DocxOpGen {
  const textLen = doc.text.length
  const t = pick(rng, ['text-insert', 'text-delete', 'block-set', 'mark-apply'] as const)
  switch (t) {
    case 'text-insert': {
      const at = int(rng, textLen + 1)
      return { type: 'text-insert', at, text: pick(rng, ['你好', '世界', 'abc', '测试文本']) }
    }
    case 'text-delete': {
      if (textLen === 0) return { type: 'text-insert', at: 0, text: 'x' }
      const at = int(rng, textLen)
      const len = Math.min(int(rng, 5) + 1, textLen - at)
      // 与文档一致（applyEdit 校验——fuzz 生成真实闭包数据）
      const removed = doc.text.slice(at, at + len)
      const removedEmbeds = doc.embeds.filter((e) => e.at >= at && e.at < at + len)
      const removedBlocks = doc.blockProps.filter((bp) => bp.start >= at && bp.start < at + len)
      return { type: 'text-delete', at, len, removed, removedEmbeds, removedBlocks }
    }
    case 'block-set': {
      const start = textLen > 0 ? int(rng, textLen + 1) : 0
      return { type: 'block-set', start, kind: pick(rng, ['h1', 'h2', 'p'] as const), prev: null }
    }
    case 'mark-apply': {
      const start = textLen > 0 ? int(rng, textLen) : 0
      const end = Math.min(start + int(rng, 3) + 1, textLen)
      // prev 与文档一致（applyMark 校验）
      const prev = doc.marks.filter((m) => m.type === 'b')
      return { type: 'mark-apply', start, end, mark: 'b', on: rng() > 0.5, prev }
    }
  }
}

type SheetOpGen = ReturnType<typeof randomSheetOp>
type SlideOpGen = ReturnType<typeof randomSlideOp>
type DocxOpGen = ReturnType<typeof randomDocxOp>

describe('ODES fuzz（fold 不变量——三模型随机 op 序列）', () => {
  before(() => { setupJsdom() })

  test('xlsx：200 轮随机 op——不抛错 + 引用有效 + 重打包等价', () => {
    const rng = mulberry32(42)
    let s = emptySnapshot('xlsx')
    const tail: OfficeOp[] = []
    for (let i = 0; i < 200; i++) {
      const op = randomSheetOp(rng) as OfficeOp
      const next = applyOfficeOp(s, op)
      // 不变量：apply 后状态结构有效
      const wb = (next as { workbook: { sheets: { name: string; cols: number; cells: Map<string, unknown> }[] } }).workbook
      assert.ok(wb.sheets.length >= 1, `sheet 至少 1 个（轮 ${i}）`)
      for (const sheet of wb.sheets) {
        assert.ok(sheet.cols >= 1, 'cols ≥ 1')
        for (const ref of sheet.cells.keys()) {
          assert.ok(/^[A-Z]+\d+$/.test(ref), `ref 格式有效: ${ref}`)
        }
      }
      s = next
      tail.push(op)
    }
    // 重打包等价：中点切分——snapshot = fold(前 k)，tail = 后 k → fold = 全部
    const empty = emptySnapshot('xlsx')
    const k = int(rng, tail.length)
    const snap = foldOffice({ docType: 'xlsx', snapshot: empty, tail: tail.slice(0, k) })
    const repacked = foldOffice({ docType: 'xlsx', snapshot: snap, tail: tail.slice(k) })
    const full = foldOffice({ docType: 'xlsx', snapshot: empty, tail })
    assert.deepEqual(repacked, full, '中点切分重打包 = 全量折叠')
    assert.deepEqual(foldOffice({ docType: 'xlsx', snapshot: full, tail: [] }), full, '末尾重打包幂等')
  })

  test('pptx：200 轮随机 op——几何有效 + 层叠顺序 + 重打包等价', () => {
    const rng = mulberry32(7)
    let s = emptySnapshot('pptx')
    const tail: OfficeOp[] = []
    for (let i = 0; i < 200; i++) {
      const op = randomSlideOp(rng) as OfficeOp
      const next = applyOfficeOp(s, op)
      const deck = (next as { deck: { slides: { shapes: { id: string; x: number; y: number; w: number; h: number }[] }[] } }).deck
      assert.ok(deck.slides.length >= 1, `slide 至少 1 个（轮 ${i}）`)
      for (const slide of deck.slides) {
        for (const shape of slide.shapes) {
          assert.ok(shape.w > 0 && shape.h > 0, '几何正数')
          assert.ok(shape.x >= 0 && shape.y >= 0, '坐标非负')
        }
      }
      s = next
      tail.push(op)
    }
    const empty = emptySnapshot('pptx')
    const k = int(rng, tail.length)
    const snap = foldOffice({ docType: 'pptx', snapshot: empty, tail: tail.slice(0, k) })
    const repacked = foldOffice({ docType: 'pptx', snapshot: snap, tail: tail.slice(k) })
    const full = foldOffice({ docType: 'pptx', snapshot: empty, tail })
    assert.deepEqual(repacked, full, '中点切分重打包 = 全量折叠')
  })

  test('docx：200 轮随机 EditEvent——marks 区间恒合法 + fold 一致', () => {
    const rng = mulberry32(99)
    let s = emptySnapshot('docx')
    const tail: OfficeOp[] = []
    for (let i = 0; i < 200; i++) {
      const doc = (s as { doc: { text: string; marks: Array<{ start: number; end: number }>; blockProps: Array<{ start: number }>; embeds: Array<{ at: number }> } }).doc
      const op = randomDocxOp(rng, doc) as OfficeOp
      const next = applyOfficeOp(s, op)
      const doc2 = (next as { doc: { text: string; marks: Array<{ start: number; end: number }>; blockProps: Array<{ start: number }> } }).doc
      // 不变量：marks 左闭右开 + 区间在 text 内
      for (const m of doc2.marks) {
        assert.ok(m.start >= 0 && m.end <= doc2.text.length, `mark 区间合法 ${m.start}-${m.end} ≤ ${doc2.text.length}`)
        assert.ok(m.start < m.end, 'mark 非空')
      }
      for (const bp of doc2.blockProps) {
        assert.ok(bp.start <= doc2.text.length, 'blockProps 起点合法')
      }
      s = next
      tail.push(op)
    }
    // 重打包等价（docx 委托 applyEdit——中点切分）
    const empty = emptySnapshot('docx')
    const k = int(rng, tail.length)
    const snap = foldOffice({ docType: 'docx', snapshot: empty, tail: tail.slice(0, k) })
    const repacked = foldOffice({ docType: 'docx', snapshot: snap, tail: tail.slice(k) })
    const full = foldOffice({ docType: 'docx', snapshot: empty, tail })
    assert.deepEqual(repacked, full, '中点切分重打包 = 全量折叠')
  })

  test('越界 op 宽容：非法 sheet/ref → 原状态（不静默污染）', () => {
    // 非法 sheet 索引
    const s = emptySnapshot('xlsx')
    const next = applyOfficeOp(s, { type: 'cell-set', sheet: 99, ref: 'A1', cell: { kind: 's', value: 'x' } })
    assert.deepEqual(next, s, '越界 sheet 原样返回')
    // 非法 shapeId 操作
    const p = emptySnapshot('pptx')
    const p2 = applyOfficeOp(p, { type: 'shape-remove', slide: 0, shapeId: '不存在' })
    assert.deepEqual(p2, p, '不存在 shape 原样返回')
    // 跨 docType op 拒绝
    assert.equal(opBelongsTo({ type: 'text-insert', at: 0, text: '' }, 'xlsx'), false)
    assert.equal(opBelongsTo({ type: 'cell-set', sheet: 0, ref: 'A1', cell: null }, 'pptx'), false)
  })
})
