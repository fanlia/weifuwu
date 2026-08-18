/**
 * weifuwu/components/OfficeEditor/model/apply — ODES 折叠（fold）纯函数
 *
 * 核心不变量：snapshot = fold(全部事件)——apply 每个 op 得到新状态（不可变）。
 * - docx：委托 Editor applyEdit（EditEvent 全量复用——零新逻辑）
 * - xlsx/pptx：各自 apply（纯函数——Map 复制、数组复制）
 */

import { applyEdit } from '../../Editor/model/apply.ts'
import { EMPTY_DOC } from '../../Editor/model/types.ts'
import type { DocState, EditEvent } from '../../Editor/model/types.ts'
import type {
  DeckState, DocType, OfficeCheckpoint, OfficeOp, OfficeSnapshot,
  SheetCell, SheetOp, SheetState, SlideOp, SlideShape, SlideState, WorkbookState,
} from './types.ts'

// ── 空状态 ──────────────────────────────────────────────────────────────────

export function emptySnapshot(docType: DocType): OfficeSnapshot {
  if (docType === 'docx') return { docType, doc: EMPTY_DOC }
  if (docType === 'xlsx') {
    return {
      docType,
      workbook: { sheets: [{ name: 'Sheet1', cols: 1, cells: new Map() }], activeSheet: 0 },
    }
  }
  return {
    docType,
    deck: { slides: [{ shapes: [] }], activeSlide: 0, size: { w: 960, h: 540 } },
  }
}

// ── 引用工具（网格） ────────────────────────────────────────────────────────

/** 'A1' → { row: 0, col: 0 }（col 字母段、row 数字段） */
export function parseRef(ref: string): { row: number; col: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref.toUpperCase())
  if (!m) return { row: 0, col: 0 }
  let col = 0
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { row: Number(m[2]) - 1, col: col - 1 }
}

export function toRef(row: number, col: number): string {
  let c = ''
  let n = col + 1
  while (n > 0) { c = String.fromCharCode(65 + ((n - 1) % 26)) + c; n = Math.floor((n - 1) / 26) }
  return `${c}${row + 1}`
}

/** 行列插入后引用平移（单元格重定位；公式字符串不重算——裁剪登记） */
export function shiftCellRef(ref: string, atRow: number, atCol: number, dRow: number, dCol: number): string | null {
  const { row, col } = parseRef(ref)
  const r = row >= atRow ? row + dRow : row
  const c = col >= atCol ? col + dCol : col
  if (r < 0 || c < 0) return null
  return toRef(r, c)
}

// ── xlsx apply ──────────────────────────────────────────────────────────────

function cloneSheet(s: SheetState): SheetState {
  return { name: s.name, cols: s.cols, cells: new Map(s.cells) }
}

function applyCellOp(sheet: SheetState, op: Extract<SheetOp, { type: 'cell-set' | 'range-style' }>): SheetState {
  if (op.type === 'cell-set') {
    const next = cloneSheet(sheet)
    if (op.cell === null) next.cells.delete(op.ref.toUpperCase())
    else next.cells.set(op.ref.toUpperCase(), { ...op.cell, style: op.cell.style ? { ...op.cell.style } : undefined })
    const { col } = parseRef(op.ref)
    if (col + 1 > next.cols) next.cols = col + 1
    return next
  }
  const next = cloneSheet(sheet)
  const key = op.ref.toUpperCase()
  const cell = next.cells.get(key)
  if (cell) next.cells.set(key, { ...cell, style: op.style ? { ...op.style } : undefined })
  else next.cells.set(key, { kind: 's', value: '', style: op.style ? { ...op.style } : undefined })
  return next
}

function applyRows(sheet: SheetState, at: number, count: number, dir: 1 | -1): SheetState {
  const next = cloneSheet(sheet)
  const nextMap = new Map<string, SheetCell>()
  for (const [ref, cell] of next.cells) {
    const r = shiftCellRef(ref, at, 0, dir * count, 0)
    if (r) nextMap.set(r, cell)
  }
  next.cells = nextMap
  return next
}

function applyCols(sheet: SheetState, at: number, count: number, dir: 1 | -1): SheetState {
  const next = cloneSheet(sheet)
  const nextMap = new Map<string, SheetCell>()
  for (const [ref, cell] of next.cells) {
    const c = shiftCellRef(ref, 0, at, 0, dir * count)
    if (c) nextMap.set(c, cell)
  }
  next.cells = nextMap
  next.cols = Math.max(next.cols + dir * count, 1)
  return next
}

export function applySheetOp(wb: WorkbookState, op: SheetOp): WorkbookState {
  const sheets = wb.sheets.map(cloneSheet)
  switch (op.type) {
    case 'cell-set':
    case 'range-style': {
      if (op.sheet >= sheets.length) return wb
      sheets[op.sheet] = applyCellOp(sheets[op.sheet], op as Extract<SheetOp, { type: 'cell-set' | 'range-style' }>)
      return { ...wb, sheets }
    }
    case 'insert-rows':
      if (op.sheet >= sheets.length) return wb
      sheets[op.sheet] = applyRows(sheets[op.sheet], op.at, op.count, 1)
      return { ...wb, sheets }
    case 'delete-rows':
      if (op.sheet >= sheets.length) return wb
      sheets[op.sheet] = applyRows(sheets[op.sheet], op.at, op.count, -1)
      return { ...wb, sheets }
    case 'insert-cols':
      if (op.sheet >= sheets.length) return wb
      sheets[op.sheet] = applyCols(sheets[op.sheet], op.at, op.count, 1)
      return { ...wb, sheets }
    case 'delete-cols':
      if (op.sheet >= sheets.length) return wb
      sheets[op.sheet] = applyCols(sheets[op.sheet], op.at, op.count, -1)
      return { ...wb, sheets }
    case 'sheet-add': {
      const s: SheetState = { name: op.name, cols: 1, cells: new Map() }
      return { ...wb, sheets: [...sheets, s], activeSheet: sheets.length }
    }
    case 'sheet-rename':
      if (op.sheet >= sheets.length) return wb
      sheets[op.sheet] = { ...sheets[op.sheet], name: op.name }
      return { ...wb, sheets }
    case 'sheet-delete': {
      if (op.sheet >= sheets.length) return wb
      const next = sheets.filter((_, i) => i !== op.sheet)
      if (next.length === 0) next.push({ name: 'Sheet1', cols: 1, cells: new Map() })
      return { ...wb, sheets: next, activeSheet: Math.min(wb.activeSheet, next.length - 1) }
    }
    case 'sheet-move': {
      if (op.sheet >= sheets.length || op.to >= sheets.length) return wb
      const next = [...sheets]
      const [s] = next.splice(op.sheet, 1)
      next.splice(op.to, 0, s)
      return { ...wb, sheets: next }
    }
    case 'sheet-active':
      return op.sheet < sheets.length ? { ...wb, activeSheet: op.sheet } : wb
  }
}

// ── pptx apply ──────────────────────────────────────────────────────────────

function cloneShape(s: SlideShape): SlideShape {
  return { ...s, props: s.props ? { ...s.props } : undefined }
}

export function applySlideOp(deck: DeckState, op: SlideOp): DeckState {
  const slides = deck.slides.map((sl) => ({ ...sl, shapes: sl.shapes.map(cloneShape) }))
  switch (op.type) {
    case 'slide-add': {
      const s: SlideState = { shapes: [], layout: op.layout }
      const at = op.at ?? slides.length
      slides.splice(Math.min(at, slides.length), 0, s)
      return { ...deck, slides, activeSlide: Math.min(at, slides.length - 1) }
    }
    case 'slide-delete': {
      if (op.slide >= slides.length) return deck
      slides.splice(op.slide, 1)
      if (slides.length === 0) slides.push({ shapes: [] })
      return { ...deck, slides, activeSlide: Math.min(deck.activeSlide, slides.length - 1) }
    }
    case 'slide-move': {
      if (op.slide >= slides.length || op.to >= slides.length) return deck
      const [s] = slides.splice(op.slide, 1)
      slides.splice(op.to, 0, s)
      return { ...deck, slides }
    }
    case 'slide-active':
      return op.slide < slides.length ? { ...deck, activeSlide: op.slide } : deck
    case 'shape-add': {
      if (op.slide >= slides.length) return deck
      const shapes = [...slides[op.slide].shapes, cloneShape(op.shape)]
      slides[op.slide] = { ...slides[op.slide], shapes }
      return { ...deck, slides }
    }
    case 'shape-remove': {
      if (op.slide >= slides.length) return deck
      const shapes = slides[op.slide].shapes.filter((s) => s.id !== op.shapeId)
      slides[op.slide] = { ...slides[op.slide], shapes }
      return { ...deck, slides }
    }
    case 'shape-move': {
      if (op.slide >= slides.length) return deck
      const shapes = slides[op.slide].shapes.map((s) =>
        s.id === op.shapeId ? { ...s, x: op.x, y: op.y } : s,
      )
      slides[op.slide] = { ...slides[op.slide], shapes }
      return { ...deck, slides }
    }
    case 'shape-resize': {
      if (op.slide >= slides.length) return deck
      const shapes = slides[op.slide].shapes.map((s) =>
        s.id === op.shapeId ? { ...s, w: op.w, h: op.h } : s,
      )
      slides[op.slide] = { ...slides[op.slide], shapes }
      return { ...deck, slides }
    }
    case 'shape-set': {
      if (op.slide >= slides.length) return deck
      const shapes = slides[op.slide].shapes.map((s) =>
        s.id === op.shapeId ? { ...s, props: { ...(s.props ?? {}), ...op.props } } : s,
      )
      slides[op.slide] = { ...slides[op.slide], shapes }
      return { ...deck, slides }
    }
  }
}

// ── 统一折叠 ────────────────────────────────────────────────────────────────

/** 单 op 应用（docx 委托 applyEdit——EditEvent 全量复用） */
export function applyOfficeOp(snapshot: OfficeSnapshot, op: OfficeOp): OfficeSnapshot {
  if (snapshot.docType === 'docx' && isEditEvent(op)) {
    return { docType: 'docx', doc: applyEdit(snapshot.doc, op) }
  }
  if (snapshot.docType === 'xlsx' && isSheetOp(op)) {
    return { docType: 'xlsx', workbook: applySheetOp(snapshot.workbook, op) }
  }
  if (snapshot.docType === 'pptx' && isSlideOp(op)) {
    return { docType: 'pptx', deck: applySlideOp(snapshot.deck, op as SlideOp) }
  }
  // 类型不匹配（docx 收到 sheet op 等）——不可静默（CS-05）：原样返回 + 上层拒绝
  return snapshot
}

function isEditEvent(op: OfficeOp): op is EditEvent {
  const t = (op as { type: string }).type
  return t === 'text-insert' || t === 'text-delete' || t === 'mark-apply' || t === 'mark-restore'
    || t === 'block-set' || t === 'embed-insert' || t === 'embed-delete' || t === 'ai-apply'
}

function isSheetOp(op: OfficeOp): op is SheetOp {
  const t = (op as { type: string }).type
  return t === 'cell-set' || t === 'range-style' || t === 'insert-rows' || t === 'delete-rows'
    || t === 'insert-cols' || t === 'delete-cols' || t === 'sheet-add' || t === 'sheet-rename'
    || t === 'sheet-delete' || t === 'sheet-move' || t === 'sheet-active'
}

function isSlideOp(op: OfficeOp): op is SlideOp {
  const t = (op as { type: string }).type
  return t === 'slide-add' || t === 'slide-delete' || t === 'slide-move' || t === 'slide-active'
    || t === 'shape-add' || t === 'shape-remove' || t === 'shape-move' || t === 'shape-resize'
    || t === 'shape-set'
}

/** checkpoint 折叠：snapshot + apply tail 全部 op（不变量：结果 = 全部事件 fold） */
export function foldOffice(cp: OfficeCheckpoint): OfficeSnapshot {
  let s = cp.snapshot
  for (const op of cp.tail) s = applyOfficeOp(s, op)
  return s
}

/** 校验 op 是否属于 docType 命名空间（跨类型 op 拒绝——诚实裁剪） */
export function opBelongsTo(op: OfficeOp, docType: DocType): boolean {
  if (docType === 'docx') return isEditEvent(op)
  if (docType === 'xlsx') return isSheetOp(op)
  return isSlideOp(op)
}
