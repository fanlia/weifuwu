/**
 * weifuwu/components/Editor/model — 文档模型（事件流底座）
 *
 * 核心不变量（design/editor-events-plan.md）：文档状态 = fold(edit 事件流)。
 * 本文档模型是纯 TS 数据结构 + 纯函数（无 DOM、无 UI）——阶段 0 验收：
 * 折叠不变量（fuzz）/ 逆操作 / HTML 往返。
 *
 * 模型设计：
 * - text 为全文纯文本，`\n` 为段落分隔符（offset 连续——选区/diff/提示词天然）
 * - blockProps：非默认块属性（按段起点 offset 记录；段结构由 text 派生）
 * - marks：内联格式区间（左闭右开；b/i/u/link 可重叠）
 * - embeds：img/table/hr 用占位符 `\uFFFC` 占 1 个字符位（标准对象替换字符）
 */

/** 块类型（p 为默认——不记录） */
export type BlockKind = 'p' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'quote'
export type Align = 'left' | 'center' | 'right'
export type MarkType = 'b' | 'i' | 'u' | 'link'

/** 非默认块属性（段起点 offset → 块格式） */
export interface BlockProp {
  start: number
  kind: BlockKind
  align?: Align
}

/** 内联格式区间 */
export interface MarkSpan {
  start: number
  end: number
  type: MarkType
  href?: string
}

/** 嵌入（占位符 \uFFFC 占据 text 1 字符位；id 唯一——删除按 id 精确匹配） */
export interface EmbedSpan {
  id: string
  at: number
  type: 'img' | 'table' | 'hr' | 'pre'
  html: string
}

/** 文档状态（不可变——applyEdit 返回新对象；undo/redo 快照对比免费） */
export interface DocState {
  text: string
  blockProps: BlockProp[]
  marks: MarkSpan[]
  embeds: EmbedSpan[]
}

export const EMPTY_DOC: DocState = { text: '', blockProps: [], marks: [], embeds: [] }

/** 嵌入占位符（OBJECT REPLACEMENT CHARACTER——业界标准） */
export const EMBED_CHAR = '\uFFFC'

// ── 编辑事件集（entity: edit——action = type；逆操作见 inverse.ts） ─────────

export type EditEvent =
  | { type: 'text-insert'; at: number; text: string }
  | {
    type: 'text-delete'; at: number; len: number; removed: string
    removedEmbeds: EmbedSpan[]
    /** 被完整删除的段属性（起点在区间内）——逆操作恢复段格式（合并段继承丢失） */
    removedBlocks: BlockProp[]
  }
  | { type: 'mark-apply'; start: number; end: number; mark: MarkType; on: boolean; href?: string; prev: MarkSpan[] }
  /** 绝对恢复（mark 逆操作——区间表示不可逆，undo 用快照精确还原） */
  | { type: 'mark-restore'; mark: MarkType; spans: MarkSpan[]; prev: MarkSpan[] }
  | { type: 'block-set'; start: number; kind: BlockKind; align?: Align | null; prev: BlockProp | null }
  | { type: 'embed-insert'; at: number; embed: EmbedSpan }
  | { type: 'embed-delete'; at: number; embed: EmbedSpan }
  /** 快照式：AI 替换（original 由创建者提供——diff 面板直接读；原子撤销一步；
   *  removedEmbeds/removedBlocks：区间内嵌入与被删段属性——逆操作恢复） */
  | { type: 'ai-apply'; start: number; end: number; original: string; revised: string; removedEmbeds: EmbedSpan[]; removedBlocks: BlockProp[] }

/** 事务边界：N 个事件 = 1 个撤销步（AI 流式接受 = 1 个 commit）
 *  before：操作前状态快照——undo 精确恢复（mark 区间表示不可逆——
 *  收缩/合并后无法从逆事件还原；快照 + 重放混合：undo=恢复 before，
 *  redo=从 before 重放 events——vdom3 remove 逆操作存快照同款先例） */
export interface Commit {
  label: string
  events: EditEvent[]
  before: DocState
  /** 操作时间（历史面板显示；缺省 = 记录时） */
  ts?: number
  /** 操作前光标（undo 恢复位置；可选——默认不恢复） */
  caret?: { start: number; end: number }
}
