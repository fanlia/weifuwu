/**
 * weifuwu/components/OfficeEditor/model — ODES（office 文档事件流标准）协议层
 *
 * 设计（）：
 * - 文档状态 = fold(事件流)（与 Editor/ai/sandbox 四端同构）
 * - docx 的 IR = Editor DocState（op = EditEvent 全量复用——段落流同构）
 * - xlsx = 网格模型（稀疏 cells Map——`A1` 引用语义）
 * - pptx = 画布模型（slide → shape 集合——几何 + 层叠）
 * - checkpoint = 快照 + tail（导入 = 服务端转换出 snapshot；编辑 append op；
 *   导出 = fold → IR → 服务端渲染 OOXML——前端零依赖）
 */

import type { DocState, EditEvent } from '../../Editor/model/types.ts'

// ── 文档类型 ────────────────────────────────────────────────────────────────

export type DocType = 'docx' | 'xlsx' | 'pptx'

// ── xlsx：网格模型 ──────────────────────────────────────────────────────────

export type CellKind = 's' | 'n' | 'b' | 'f' // string / number / bool / formula

export interface CellStyle {
  bold?: boolean
  italic?: boolean
  align?: 'left' | 'center' | 'right'
  bg?: string
}

export interface SheetCell {
  kind: CellKind
  value: string | number | boolean
  /** kind='f' 时公式字符串（不计算——服务端导出时重算；裁剪：引用不自动调整） */
  formula?: string
  style?: CellStyle
}

export interface SheetState {
  name: string
  /** 已用列数（导出行列范围） */
  cols: number
  /** 'A1' → cell（稀疏） */
  cells: Map<string, SheetCell>
}

export interface WorkbookState {
  sheets: SheetState[]
  activeSheet: number
}

// ── pptx：画布模型 ──────────────────────────────────────────────────────────

export type ShapeKind = 'text' | 'image' | 'table' | 'rect' | 'line'

export interface ShapeProps {
  text?: string
  fontSize?: number
  bold?: boolean
  fill?: string
  imageUrl?: string
}

export interface SlideShape {
  id: string
  kind: ShapeKind
  x: number
  y: number
  w: number
  h: number
  props?: ShapeProps
}

export interface SlideState {
  shapes: SlideShape[]
  layout?: string
}

export interface DeckState {
  slides: SlideState[]
  activeSlide: number
  size: { w: number; h: number }
}

/** checkpoint 快照（三模型联合） */
export type OfficeSnapshot =
  | { docType: 'docx'; doc: DocState }
  | { docType: 'xlsx'; workbook: WorkbookState }
  | { docType: 'pptx'; deck: DeckState }

// ── 操作事件集（ODES ops） ──────────────────────────────────────────────────

export type SheetOp =
  | { type: 'cell-set'; sheet: number; ref: string; cell: SheetCell | null }
  | { type: 'range-style'; sheet: number; ref: string; style: CellStyle }
  | { type: 'insert-rows'; sheet: number; at: number; count: number }
  | { type: 'delete-rows'; sheet: number; at: number; count: number }
  | { type: 'insert-cols'; sheet: number; at: number; count: number }
  | { type: 'delete-cols'; sheet: number; at: number; count: number }
  | { type: 'sheet-add'; name: string }
  | { type: 'sheet-rename'; sheet: number; name: string }
  | { type: 'sheet-delete'; sheet: number }
  | { type: 'sheet-move'; sheet: number; to: number }
  | { type: 'sheet-active'; sheet: number }

export type SlideOp =
  | { type: 'slide-add'; at?: number; layout?: string }
  | { type: 'slide-delete'; slide: number }
  | { type: 'slide-move'; slide: number; to: number }
  | { type: 'slide-active'; slide: number }
  | { type: 'shape-add'; slide: number; shape: SlideShape }
  | { type: 'shape-remove'; slide: number; shapeId: string }
  | { type: 'shape-move'; slide: number; shapeId: string; x: number; y: number }
  | { type: 'shape-resize'; slide: number; shapeId: string; w: number; h: number }
  | { type: 'shape-set'; slide: number; shapeId: string; props: Partial<ShapeProps> }

export type OfficeOp = EditEvent | SheetOp | SlideOp

/** 事件流外壳（payload 直接进 edit 通道——action: 'office'） */
export interface OfficeStreamPayload {
  docType: DocType
  /** 编辑操作（AI 拒绝/状态记录时缺省——不产生 op） */
  op?: OfficeOp
  /** AI 关联（可选——跨端审计：editEvents ↔ aiEvents 一条链——messageId 关联键） */
  ai?: { messageId: string; status: 'suggested' | 'accepted' | 'rejected' }
}

/** OfficeEditor 的 AI 协作选项（与 Editor ai prop 同构——SSE wf: 协议） */
export interface OfficeAiOptions {
  url: string
  /** 上下文模式（docType 感知默认：docx→text / xlsx→formula / pptx→shape） */
  mode: 'text' | 'formula' | 'shape'
  /** 自定义解析（默认按 mode：公式/值/文本 → OfficeOp[]） */
  parse?: (text: string, ctx: AiContext) => OfficeOp[]
}

export interface AiContext {
  docType: DocType
  /** xlsx：活动单元格 ref（A1）或选区范围（A1:B5） */
  ref?: string
  /** pptx：选中 shapeId */
  shapeId?: string
  /** docx：选区文本（原文——提示词输入） */
  selectionText?: string
}

// ── 编辑事务（撤销单元——同 Editor Commit） ────────────────────────────────

export interface OfficeCommit {
  label: string
  ops: OfficeOp[]
  /** 操作前快照（undo 精确恢复；可逆 op 由逆操作覆盖——快照兜底） */
  before: OfficeSnapshot
  ts?: number
}

// ── checkpoint（持久化单元） ────────────────────────────────────────────────

export interface OfficeCheckpoint {
  docType: DocType
  /** 当前状态快照（fold 至此的起点） */
  snapshot: OfficeSnapshot
  /** 快照后增量事件（可裁剪重打包——tail 超阈值 → 重新生成 snapshot） */
  tail: OfficeOp[]
  /** 事件流起点 id（与 edit-events 关联审计） */
  baseEventId?: number
}

// ── 导入/导出服务端契约（零依赖——OOXML 在服务端） ─────────────────────────

export interface ImportWarning {
  path: string
  issue: string
}

export interface OfficeImportResult {
  docType: DocType
  snapshot: OfficeSnapshot
  warnings: ImportWarning[]
}

export interface OfficeExportRequest {
  docType: DocType
  snapshot: OfficeSnapshot
}
