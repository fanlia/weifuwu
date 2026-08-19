/**
 * weifuwu/components/SheetGrid — xlsx 网格编辑器（ODES 事件流底座）
 *
 * 设计（design/office-events-plan.md）：文档 = fold(事件流)——SheetGrid 的每个
 * 编辑操作 = OfficeOp（cell-set/insert-rows/...）→ editEmit('office') → commit
 * （before 快照 + ops——撤销一步）。
 *
 * - 单元格编辑：点击进入编辑 → Enter/Blur 提交 → cell-set op
 * - 行列增删：工具条按钮（作用于活动单元格）→ insert/delete op
 * - 撤销：Ctrl+Z（undo 栈——恢复 before 快照——同 Editor）
 * - AI 公式：选中单元格 → AI（SSE wf:）→ 回复解析（parseFormulaReply——
 *   公式/数字/文本）→ 浮层确认 → cell-set commit（原子撤销；拒绝不落 op）
 * - sheet 标签切换（activeSheet op——只读切换 v1）
 */

import { h } from '../../vdom/index.ts'
import { aiStream } from '../../vdom/hooks/ai-stream.ts'
import { editEmit } from '../Editor/edit-events.ts'
import { applySheetOp } from '../OfficeEditor/model/apply.ts'
import type { OfficeOp, SheetCell, SheetState, WorkbookState } from '../OfficeEditor/model/types.ts'
import { parseReplyByMode } from '../OfficeEditor/ai/ai-bridge.ts'
import type { AiContext } from '../OfficeEditor/model/types.ts'
import type { Component, VNode } from '../../vdom/index.ts'

export interface SheetGridProps {
  /** 受控工作簿（FilePreview 传入——编辑经 onChange 回写） */
  workbook: WorkbookState
  onChange?: (wb: WorkbookState) => void
  /** AI 公式（SSE wf: 协议——选中单元格 → 建议 → 接受 commit） */
  ai?: { url: string; headers?: Record<string, string> }
  height?: string
  /** 关闭编辑（只读展示） */
  readonly?: boolean
}

interface UndoEntry {
  label: string
  ops: OfficeOp[]
  before: WorkbookState
}

const colName = (col: number): string => {
  let c = ''
  let n = col + 1
  while (n > 0) { c = String.fromCharCode(65 + ((n - 1) % 26)) + c; n = Math.floor((n - 1) / 26) }
  return c
}

export const SheetGrid: Component<SheetGridProps> = async (_init, ctx) => {
  const i18n = ctx.i18n?.components?.SheetGrid ?? {}
  // ── mount（只一次） ──
  let wb: WorkbookState = _init.workbook
  /** 外部受控标记（仅 props 变化时同步——内部 commit 不覆盖） */
  let lastPropsWb = _init.workbook
  let activeRef: string | null = null
  let editing: { ref: string; value: string } | null = null
  let editingEl: HTMLInputElement | null = null
  const editingInputRef = (el: unknown): void => { editingEl = el as HTMLInputElement }
  const undo: UndoEntry[] = []
  // AI 状态（选中格 → 建议浮层——接受 = cell-set commit）
  let aiPending: { revised: string; streaming: boolean; error: string | null; ref: string; messageId: string } | null = null
  let anchorEl: HTMLElement | null = null
  const aiAnchorRef = (el: unknown): void => { anchorEl = el as HTMLElement }

  const aiPopup = ctx.ui.usePopup({
    trigger: 'manual',
    placement: 'bottom',
    gap: 8,
    el: () => anchorEl,
    isOpen: () => !!aiPending,
    setOpen: (v) => {
      if (!v) { aiPending = null; ctx.render() }
    },
  })

  // ── 事件流：commit（N op = 1 撤销步——同 Editor） ──
  const commit = (label: string, ops: OfficeOp[], before: WorkbookState): void => {
    let next = before
    for (const op of ops) next = applySheetOp(next, op as never) as WorkbookState
    wb = next
    for (const op of ops) editEmit('office', { docType: 'xlsx', op } as never)
    undo.push({ label, ops, before })
    ctx.render()
    _init.onChange?.(wb)
  }

  // ── 单元格操作 ──
  const cellSet = (ref: string, cell: SheetCell | null): void => {
    commit(`单元格 ${ref}`, [{ type: 'cell-set', sheet: wb.activeSheet, ref, cell }], wb)
  }
  const insertRows = (): void => {
    editing = null
    const { row } = refRC(activeRef ?? 'A1')
    commit('插入行', [{ type: 'insert-rows', sheet: wb.activeSheet, at: row, count: 1 }], wb)
  }
  const deleteRows = (): void => {
    editing = null
    const { row } = refRC(activeRef ?? 'A1')
    commit('删除行', [{ type: 'delete-rows', sheet: wb.activeSheet, at: row, count: 1 }], wb)
  }
  const insertCols = (): void => {
    editing = null
    const { col } = refRC(activeRef ?? 'A1')
    commit('插入列', [{ type: 'insert-cols', sheet: wb.activeSheet, at: col, count: 1 }], wb)
  }
  const deleteCols = (): void => {
    editing = null
    const { col } = refRC(activeRef ?? 'A1')
    commit('删除列', [{ type: 'delete-cols', sheet: wb.activeSheet, at: col, count: 1 }], wb)
  }
  const undoLast = (): void => {
    editing = null
    const u = undo.pop()
    if (!u) return
    wb = u.before
    editEmit('undo', { entity: 'sheet', label: u.label } as never)
    ctx.render()
    _init.onChange?.(wb)
  }

  // ── AI 公式（选中格 → 提示 → wf: 流式 → 浮层确认 → commit） ──
  const runAi = (): void => {
    if (!_init.ai || !activeRef) return
    const ref = activeRef
    const sheet = wb.sheets[wb.activeSheet]
    const ctxText = nearbyCells(sheet, ref, 8)
    const prompt = `你是电子表格助手。请为单元格 ${ref} 生成内容。\n\n` +
      `当前工作表「${sheet.name}」附近单元格数据：\n${ctxText}\n\n` +
      '输出规则：\n' +
      '- 若是公式：直接输出 = 开头的公式（如 =SUM(A1:B5)），不要解释\n' +
      '- 若是数值/文本：直接输出值\n' +
      '- 若单元格是表头/汇总类，输出合适的值或公式'
    aiPending = { revised: '', streaming: true, error: null, ref, messageId: `sheet-ai-${Date.now()}` }
    ctx.render()
    editEmit('office', { docType: 'xlsx', ai: { messageId: aiPending.messageId, status: 'suggested' } } as never)
    aiStream(_init.ai.url, {
      messages: [{ role: 'user', content: prompt }],
    }, {
      headers: _init.ai.headers,
      onToken: (text) => {
        if (!aiPending) return
        aiPending.revised += text
        ctx.render()
      },
      onDone: () => {
        if (!aiPending) return
        aiPending.streaming = false
        ctx.render()
      },
      onError: (e) => {
        if (!aiPending) return
        aiPending.streaming = false
        aiPending.error = e?.message ?? 'AI 请求失败'
        ctx.render()
      },
    })
  }
  const acceptAi = (): void => {
    if (!aiPending) return
    editing = null // 编辑态与 AI 提交互斥（input 覆盖 td 文本）
    const ctxInfo: AiContext = { docType: 'xlsx', ref: aiPending.ref }
    const parsed = parseReplyByMode(aiPending.revised, ctxInfo)
    if (parsed.ops.length === 0) { aiPending.error = parsed.note ?? '无法解析'; ctx.render(); return }
    const before = wb
    let next = before
    for (const op of parsed.ops) next = applySheetOp(next, op as never) as WorkbookState
    wb = next
    for (const op of parsed.ops) {
      editEmit('office', { docType: 'xlsx', op, ai: { messageId: aiPending.messageId, status: 'accepted' } } as never, aiPending.messageId)
    }
    undo.push({ label: `AI 公式 ${aiPending.ref}`, ops: parsed.ops as never[], before })
    aiPending = null
    ctx.render()
    _init.onChange?.(wb)
  }
  const rejectAi = (): void => {
    if (!aiPending) return
    editing = null
    editEmit('office', { docType: 'xlsx', ai: { messageId: aiPending.messageId, status: 'rejected' } } as never)
    aiPending = null
    ctx.render()
  }

  // ── 渲染 ──
  return async (props: SheetGridProps) => {
    if (props.workbook !== lastPropsWb) {
      // 外部受控同步（内部 commit 后 props 未变——不覆盖）
      lastPropsWb = props.workbook
      wb = props.workbook
    }
    const sheet = wb.sheets[Math.min(wb.activeSheet, wb.sheets.length - 1)] ?? { name: 'Sheet1', cols: 1, cells: new Map<string, SheetCell>() }
    const readonly = !!props.readonly

    // 行列范围
    let maxRow = 1
    let maxCol = sheet.cols
    for (const ref of sheet.cells.keys()) {
      const { row, col } = refRC(ref)
      if (row + 1 > maxRow) maxRow = row + 1
      if (col + 1 > maxCol) maxCol = col + 1
    }
    maxRow = Math.min(maxRow, 200) // 裁剪：超大表只渲染前 200 行
    maxCol = Math.min(maxCol, 52)

    const cellVal = (ref: string): string => {
      const c = sheet.cells.get(ref)
      if (!c) return ''
      if (c.kind === 'f') return c.formula ?? ''
      return String(c.value)
    }

    const cells: VNode[] = []
    for (let r = 0; r < maxRow; r++) {
      const tds: VNode[] = []
      for (let c = 0; c < maxCol; c++) {
        const ref = `${colName(c)}${r + 1}`
        const isEditing = editing?.ref === ref
        const isActive = activeRef === ref
        tds.push(h('td', {
          key: ref,
          class: ['wf-sheet-cell', isActive ? 'wf-sheet-cell--active' : ''].filter(Boolean).join(' '),
          onClick: () => {
            if (readonly) return
            activeRef = ref
            editing = { ref, value: cellVal(ref) }
            ctx.render()
          },
          onKeyDown: (e: KeyboardEvent) => {
            if (readonly) return
            if (e.key === 'Enter' && editing?.ref === ref) { e.preventDefault(); commitEdit(); ctx.render() }
            if (e.key === 'Escape' && editing?.ref === ref) { editing = null; ctx.render() }
          },
        }, isEditing
          ? h('input', {
            ref: editingInputRef,
            class: 'wf-sheet-input',
            value: editing?.value ?? '',
            onInput: (e: Event) => { editing = { ref, value: (e.target as HTMLInputElement).value } },
            onBlur: () => { commitEdit() },
            onClick: (e: Event) => e.stopPropagation(),
          })
          : cellVal(ref)))
      }
      cells.push(h('tr', { key: `r${r}` },
        h('th', { class: 'wf-sheet-rowhead', key: 'rh' }, String(r + 1)),
        ...tds,
      ))
    }

    const head: VNode[] = []
    for (let c = 0; c < maxCol; c++) head.push(h('th', { key: `c${c}`, class: 'wf-sheet-colhead' }, colName(c)))

    const commitEdit = (): void => {
      if (!editing) return
      const { ref, value } = editing
      editing = null
      const cur = sheet.cells.get(ref)
      const next: SheetCell | null = parseCellValue(value)
      if (cur && cur.kind === next?.kind && cur.value === next.value && cur.formula === next.formula) return
      cellSet(ref, next)
    }

    // AI 浮层（建议确认——接受 = commit 原子撤销；拒绝不落 op）
    const aiPanel = aiPending
      ? h('div', { class: 'wf-sheet-ai-panel' }, [
        h('div', { class: 'wf-sheet-ai-title' }, `${i18n.aiTitle ?? 'AI 建议'} ${aiPending.ref}`),
        aiPending.error
          ? h('div', { class: 'wf-sheet-ai-error' }, aiPending.error)
          : h('pre', { class: 'wf-sheet-ai-body' }, aiPending.revised || (aiPending.streaming ? (i18n.aiThinking ?? '思考中…') : '')),
        h('div', { class: 'wf-sheet-ai-actions' }, [
          h('button', {
            class: 'wf-btn wf-btn--primary wf-btn--sm', type: 'button', key: 'ok',
            disabled: aiPending.streaming,
            onClick: () => acceptAi(),
          }, i18n.accept ?? '应用'),
          h('button', {
            class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', key: 'no',
            onClick: () => rejectAi(),
          }, i18n.reject ?? '拒绝'),
        ]),
      ])
      : null

    return h('div', {
      class: 'wf-sheet',
      onKeyDown: (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undoLast() }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'enter' && _init.ai && activeRef) { e.preventDefault(); runAi() }
      },
      style: { height: props.height },
    }, [
      // 工具条
      h('div', { class: 'wf-sheet-toolbar' }, [
        h('div', { class: 'wf-sheet-tabs', key: 'tabs' },
          ...wb.sheets.map((s, i) =>
            h('button', {
              key: `tab${i}`,
              class: ['wf-sheet-tab', i === wb.activeSheet ? 'wf-sheet-tab--active' : ''].filter(Boolean).join(' '),
              type: 'button',
              onClick: () => { if (i !== wb.activeSheet) { wb = { ...wb, activeSheet: i }; ctx.render() } },
            }, s.name))),
        h('div', { class: 'wf-sheet-tools', key: 'tools' }, [
          h('button', { class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', key: 'ir', onClick: () => insertRows(), disabled: readonly }, i18n.insertRow ?? '插入行'),
          h('button', { class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', key: 'dr', onClick: () => deleteRows(), disabled: readonly }, i18n.deleteRow ?? '删除行'),
          h('button', { class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', key: 'ic', onClick: () => insertCols(), disabled: readonly }, i18n.insertCol ?? '插入列'),
          h('button', { class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', key: 'dc', onClick: () => deleteCols(), disabled: readonly }, i18n.deleteCol ?? '删除列'),
          ...(_init.ai
            ? [h('button', {
              ref: aiAnchorRef,
              class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', key: 'ai',
              'aria-expanded': String(!!aiPending),
              disabled: readonly || !activeRef,
              onClick: () => runAi(),
            }, i18n.aiFormula ?? 'AI 公式')]
            : []),
          h('button', { class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', key: 'undo', onClick: () => undoLast(), disabled: readonly || undo.length === 0 }, i18n.undo ?? '撤销'),
        ]),
        h('span', { class: 'wf-sheet-status', key: 'st' },
          `${i18n.activeCell ?? '单元格'}: ${activeRef ?? '—'}（Ctrl+Enter AI / Ctrl+Z 撤销）`),
      ]),
      // 网格
      h('div', { class: 'wf-sheet-scroll', style: { overflow: 'auto' } }, [
        h('table', { class: 'wf-sheet-table' },
          h('thead', {}, h('tr', {}, h('th', { class: 'wf-sheet-corner', key: 'corner' }), ...head)),
          h('tbody', {}, ...cells)),
      ]),
      aiPopup.portal(aiPanel, 'sheet-ai') as VNode,
    ])
  }
}

// ── 工具 ────────────────────────────────────────────────────────────────────

function refRC(ref: string): { row: number; col: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref.toUpperCase())
  if (!m) return { row: 0, col: 0 }
  let col = 0
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { row: Number(m[2]) - 1, col: col - 1 }
}

function parseCellValue(v: string): SheetCell | null {
  const s = v.trim()
  if (s === '') return null
  if (s.startsWith('=')) return { kind: 'f', value: '', formula: s }
  if (/^-?\d+(\.\d+)?$/.test(s)) return { kind: 'n', value: Number(s) }
  if (s === 'true' || s === 'false') return { kind: 'b', value: s === 'true' }
  return { kind: 's', value: s }
}

/** 相邻单元格文本（AI 上下文） */
function nearbyCells(sheet: SheetState, ref: string, n: number): string {
  const { row, col } = refRC(ref)
  const out: string[] = []
  for (let r = Math.max(0, row - n); r <= row + n; r++) {
    for (let c = Math.max(0, col - n); c <= col + n; c++) {
      const r2 = `${colName(c)}${r + 1}`
      const cell = sheet.cells.get(r2)
      if (cell) out.push(`${r2}=${String(cell.value)}`)
    }
  }
  return out.length > 0 ? out.join('\n') : '（无相邻数据）'
}
