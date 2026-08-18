/**
 * ODES 协议层测试（design/office-events-plan.md 阶段 0）：
 * - fold 不变量：三模型 apply 折叠 = 快照
 * - checkpoint：snapshot + tail fold；tail 重打包（新快照 + 空 tail 等价）
 * - 事件流外壳：editEmit('office') → __edit_tail 审计
 * - 类型不匹配拒绝（诚实裁剪——跨 docType op 不静默应用）
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from '../../../test/client/setup.ts'
import {
  applyOfficeOp, emptySnapshot, foldOffice, opBelongsTo, parseRef, shiftCellRef, toRef,
} from './apply.ts'
import type { OfficeCheckpoint, OfficeOp, OfficeSnapshot, SheetCell } from './types.ts'
import { editEmit, editEvents, resetEditEvents } from '../../Editor/edit-events.ts'

describe('ODES 协议层（office 文档事件流标准）', () => {
  before(() => { setupJsdom() })

  test('ref 工具：parseRef/toRef 往返 + 列字母', () => {
    assert.deepEqual(parseRef('A1'), { row: 0, col: 0 })
    assert.deepEqual(parseRef('B2'), { row: 1, col: 1 })
    assert.deepEqual(parseRef('Z26'), { row: 25, col: 25 })
    assert.deepEqual(parseRef('AA27'), { row: 26, col: 26 })
    assert.equal(toRef(0, 0), 'A1')
    assert.equal(toRef(1, 1), 'B2')
    assert.equal(toRef(26, 26), 'AA27')
    assert.equal(toRef(27, 27), 'AB28')
  })

  test('xlsx fold：cell-set 稀疏网格 + 公式保留', () => {
    let s = emptySnapshot('xlsx')
    s = applyOfficeOp(s, { type: 'cell-set', sheet: 0, ref: 'A1', cell: { kind: 's', value: '名字' } })
    s = applyOfficeOp(s, { type: 'cell-set', sheet: 0, ref: 'B2', cell: { kind: 'n', value: 42 } })
    s = applyOfficeOp(s, { type: 'cell-set', sheet: 0, ref: 'C3', cell: { kind: 'f', value: '', formula: '=SUM(B2)' } })
    const wb = (s as { workbook: { sheets: { cells: Map<string, SheetCell> }[] } }).workbook
    const cells = wb.sheets[0].cells
    assert.equal(cells.get('A1')?.value, '名字')
    assert.equal(cells.get('B2')?.value, 42)
    assert.equal(cells.get('C3')?.formula, '=SUM(B2)', '公式字符串保留（不计算——裁剪）')
    assert.equal(wb.sheets[0].cols, 3, '已用列数随 cell-set 扩展')
  })

  test('xlsx fold：行列插入平移 + 删除收缩（引用重定位——公式不重算）', () => {
    let s = emptySnapshot('xlsx')
    s = applyOfficeOp(s, { type: 'cell-set', sheet: 0, ref: 'A1', cell: { kind: 's', value: 'x' } })
    s = applyOfficeOp(s, { type: 'cell-set', sheet: 0, ref: 'B2', cell: { kind: 's', value: 'y' } })
    // 行首插入 2 行：A1→A3, B2→B4
    s = applyOfficeOp(s, { type: 'insert-rows', sheet: 0, at: 0, count: 2 })
    const wb = (s as { workbook: { sheets: { cells: Map<string, SheetCell> }[] } }).workbook
    assert.equal(wb.sheets[0].cells.get('A3')?.value, 'x')
    assert.equal(wb.sheets[0].cells.get('B4')?.value, 'y')
    assert.equal(wb.sheets[0].cells.has('A1'), false)
    // 删除 2 行回退
    s = applyOfficeOp(s, { type: 'delete-rows', sheet: 0, at: 0, count: 2 })
    const wb2 = (s as { workbook: { sheets: { cells: Map<string, SheetCell> }[] } }).workbook
    assert.equal(wb2.sheets[0].cells.get('A1')?.value, 'x')
    assert.equal(wb2.sheets[0].cells.get('B2')?.value, 'y')
    // 列插入平移（A→B）
    s = applyOfficeOp(s, { type: 'insert-cols', sheet: 0, at: 0, count: 1 })
    const wb3 = (s as { workbook: { sheets: { cells: Map<string, SheetCell> }[] } }).workbook
    assert.equal(wb3.sheets[0].cells.get('B1')?.value, 'x')
  })

  test('xlsx fold：sheet 生命周期（add/rename/move/delete/active）', () => {
    let s = emptySnapshot('xlsx')
    s = applyOfficeOp(s, { type: 'sheet-add', name: '数据' })
    s = applyOfficeOp(s, { type: 'sheet-active', sheet: 1 })
    let wb = (s as { workbook: { sheets: { name: string }[]; activeSheet: number } }).workbook
    assert.equal(wb.sheets.length, 2)
    assert.equal(wb.sheets[1].name, '数据')
    assert.equal(wb.activeSheet, 1)
    s = applyOfficeOp(s, { type: 'sheet-rename', sheet: 0, name: '汇总' })
    s = applyOfficeOp(s, { type: 'sheet-move', sheet: 1, to: 0 })
    wb = (s as { workbook: { sheets: { name: string }[]; activeSheet: number } }).workbook
    assert.equal(wb.sheets[0].name, '数据')
    assert.equal(wb.sheets[1].name, '汇总')
    s = applyOfficeOp(s, { type: 'sheet-delete', sheet: 1 })
    wb = (s as { workbook: { sheets: { name: string }[] } }).workbook
    assert.equal(wb.sheets.length, 1)
    assert.equal(wb.sheets[0].name, '数据')
  })

  test('pptx fold：shape 生命周期（add/move/resize/set/remove + 层叠顺序）', () => {
    let s = emptySnapshot('pptx')
    s = applyOfficeOp(s, { type: 'slide-add', at: 0 })
    s = applyOfficeOp(s, {
      type: 'shape-add', slide: 0,
      shape: { id: 't1', kind: 'text', x: 10, y: 20, w: 200, h: 40, props: { text: '标题' } },
    })
    s = applyOfficeOp(s, {
      type: 'shape-add', slide: 0,
      shape: { id: 'r1', kind: 'rect', x: 0, y: 0, w: 100, h: 100, props: { fill: '#ff0000' } },
    })
    s = applyOfficeOp(s, { type: 'shape-move', slide: 0, shapeId: 't1', x: 50, y: 60 })
    s = applyOfficeOp(s, { type: 'shape-resize', slide: 0, shapeId: 't1', w: 300, h: 80 })
    s = applyOfficeOp(s, { type: 'shape-set', slide: 0, shapeId: 't1', props: { bold: true, text: '新标题' } })
    const deck = (s as { deck: { slides: { shapes: { id: string; kind: string; x: number; y: number; w: number; h: number; props?: Record<string, unknown> }[] }[] } }).deck
    const shapes = deck.slides[0].shapes
    assert.equal(shapes.length, 2, '层叠顺序保留')
    assert.equal(shapes[0].id, 't1')
    assert.equal(shapes[1].id, 'r1')
    assert.deepEqual(
      { x: shapes[0].x, y: shapes[0].y, w: shapes[0].w, h: shapes[0].h },
      { x: 50, y: 60, w: 300, h: 80 },
      'move/resize 生效',
    )
    assert.equal(shapes[0].props?.text, '新标题')
    assert.equal(shapes[0].props?.bold, true)
    assert.equal(shapes[1].props?.fill, '#ff0000', '其他 shape 不受影响')
    // remove
    s = applyOfficeOp(s, { type: 'shape-remove', slide: 0, shapeId: 't1' })
    const deck2 = (s as { deck: { slides: { shapes: { id: string }[] }[] } }).deck
    assert.equal(deck2.slides[0].shapes.length, 1)
    assert.equal(deck2.slides[0].shapes[0].id, 'r1')
  })

  test('pptx fold：slide 生命周期（add/delete/move/active）', () => {
    let s = emptySnapshot('pptx')
    s = applyOfficeOp(s, { type: 'slide-add', layout: 'title' })
    s = applyOfficeOp(s, { type: 'slide-add', layout: 'content' })
    s = applyOfficeOp(s, { type: 'slide-move', slide: 2, to: 0 })
    const deck = (s as { deck: { slides: { layout?: string }[] } }).deck
    assert.equal(deck.slides[0].layout, 'content')
    s = applyOfficeOp(s, { type: 'slide-active', slide: 1 })
    assert.equal((s as { deck: { activeSlide: number } }).deck.activeSlide, 1)
    s = applyOfficeOp(s, { type: 'slide-delete', slide: 1 })
    const deck2 = (s as { deck: { slides: unknown[]; activeSlide: number } }).deck
    assert.equal(deck2.slides.length, 2)
    // 删空兜底
    s = applyOfficeOp(s, { type: 'slide-delete', slide: 1 })
    s = applyOfficeOp(s, { type: 'slide-delete', slide: 0 })
    assert.equal((s as { deck: { slides: unknown[] } }).deck.slides.length, 1, '删空保留 1 张空 slide')
  })

  test('docx fold：EditEvent 全量复用（applyEdit 委托）', () => {
    let s = emptySnapshot('docx')
    s = applyOfficeOp(s, { type: 'text-insert', at: 0, text: '你好世界' })
    s = applyOfficeOp(s, { type: 'block-set', start: 0, kind: 'h1', prev: null })
    s = applyOfficeOp(s, { type: 'mark-apply', start: 0, end: 2, mark: 'b', on: true, prev: [] })
    const doc = (s as { doc: { text: string; blockProps: { kind: string }[]; marks: { type: string; start: number; end: number }[] } }).doc
    assert.equal(doc.text, '你好世界')
    assert.equal(doc.blockProps[0].kind, 'h1')
    assert.equal(doc.marks[0].type, 'b')
    assert.equal(doc.marks[0].end, 2)
  })

  test('checkpoint：snapshot + tail fold = 快照 + 增量；重打包等价', () => {
    let s = emptySnapshot('xlsx')
    s = applyOfficeOp(s, { type: 'cell-set', sheet: 0, ref: 'A1', cell: { kind: 's', value: 'base' } })
    const cp: OfficeCheckpoint = {
      docType: 'xlsx',
      snapshot: s,
      tail: [
        { type: 'cell-set', sheet: 0, ref: 'B2', cell: { kind: 'n', value: 7 } },
        { type: 'cell-set', sheet: 0, ref: 'C3', cell: { kind: 's', value: '增量' } },
      ],
    }
    const folded = foldOffice(cp)
    const wb = (folded as { workbook: { sheets: { cells: Map<string, SheetCell> }[] } }).workbook
    assert.equal(wb.sheets[0].cells.get('A1')?.value, 'base', '快照保留')
    assert.equal(wb.sheets[0].cells.get('B2')?.value, 7, 'tail 增量生效')
    assert.equal(wb.sheets[0].cells.get('C3')?.value, '增量')
    // 重打包：fold 结果作为新快照 + 空 tail——等价
    const repacked: OfficeCheckpoint = { docType: 'xlsx', snapshot: folded, tail: [] }
    const again = foldOffice(repacked)
    const wb2 = (again as { workbook: { sheets: { cells: Map<string, SheetCell> }[] } }).workbook
    assert.equal(wb2.sheets[0].cells.get('B2')?.value, 7, '重打包后状态等价')
    assert.equal(wb2.sheets[0].cells.size, 3)
  })

  test('类型不匹配拒绝：跨 docType op 不静默应用（CS-05）', () => {
    // xlsx snapshot 收到 slide op
    let s = emptySnapshot('xlsx')
    s = applyOfficeOp(s, { type: 'shape-add', slide: 0, shape: { id: 'x', kind: 'rect', x: 0, y: 0, w: 1, h: 1 } })
    assert.equal((s as { workbook: { sheets: unknown[] } }).workbook.sheets.length, 1, 'slide op 不作用于 xlsx')
    // docx snapshot 收到 sheet op
    let d = emptySnapshot('docx')
    d = applyOfficeOp(d, { type: 'cell-set', sheet: 0, ref: 'A1', cell: { kind: 's', value: 'x' } })
    assert.equal((d as { doc: { text: string } }).doc.text, '', 'sheet op 不作用于 docx')
    // opBelongsTo 判定
    assert.equal(opBelongsTo({ type: 'text-insert', at: 0, text: '' }, 'docx'), true)
    assert.equal(opBelongsTo({ type: 'cell-set', sheet: 0, ref: 'A1', cell: null }, 'docx'), false)
    assert.equal(opBelongsTo({ type: 'shape-add', slide: 0, shape: { id: 'x', kind: 'rect', x: 0, y: 0, w: 1, h: 1 } }, 'pptx'), true)
  })

  test('事件流外壳：editEmit(office) → __edit_tail 审计（与 Editor 同通道）', () => {
    resetEditEvents()
    editEmit('office', { docType: 'xlsx', op: { type: 'cell-set', sheet: 0, ref: 'A1', cell: { kind: 's', value: '审计' } } })
    editEmit('office', { docType: 'pptx', op: { type: 'shape-add', slide: 0, shape: { id: 's1', kind: 'text', x: 0, y: 0, w: 10, h: 10 } } })
    const all = editEvents(10)
    assert.equal(all.length, 2)
    assert.equal(all[0].action, 'office')
    assert.equal((all[0].payload as { docType: string }).docType, 'pptx', '最新在前')
    const filtered = editEvents(10, { action: 'office' })
    assert.equal(filtered.length, 2, '按 action 过滤')
    const tail = (globalThis as any).__edit_tail?.(10, 'office')
    assert.equal(tail?.length, 2, '全局调试工具可查 office 事件')
    resetEditEvents()
  })

  test('shiftCellRef：行列平移边界（删除到 0 行丢弃）', () => {
    assert.equal(shiftCellRef('A1', 0, 0, 2, 0), 'A3')
    assert.equal(shiftCellRef('B2', 0, 0, 2, 0), 'B4')
    assert.equal(shiftCellRef('A1', 1, 0, -1, 0), 'A1', 'at 之前的行不动')
    assert.equal(shiftCellRef('A2', 1, 0, -1, 0), 'A1', 'A2 删除首行后平移为 A1（合法）')
    assert.equal(shiftCellRef('A1', 0, 0, -1, 0), null, '删除首行中的行 → 行号 0 丢弃')
    assert.equal(shiftCellRef('A1', 0, 0, 0, 1), 'B1')
  })

  after(() => { resetEditEvents() })
})
