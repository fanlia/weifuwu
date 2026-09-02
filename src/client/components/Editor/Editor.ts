/**
 * weifuwu/components/Editor — 富文本编辑器（事件流事务层，阶段 1）
 *
 * 架构（）：文档 = fold(edit 事件流)。
 * - 模型真相：DocState（contentEditable DOM 是渲染）
 * - 语义操作（工具栏/快捷键）→ edit:commit（before 快照 + 事件）→ undo/redo 精确
 * - 用户输入（键盘/IME/粘贴）暂由浏览器直写 DOM → onInput 同步回模型
 *   （输入入流是阶段 2——阶段 1 撤销分流：语义操作走自建栈，输入退浏览器）
 * - 受控 value 契约保留：onChange 发 serializeHtml(doc)
 */

import type { Component, VNode } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { createClientBrowser } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { FileUpload } from '../FileUpload/FileUpload.ts'
import { Popover } from '../Popover/Popover.ts'
import type { ToolbarItem, EditorProps, FormatState, EditorAiAction, EditorAiOptions } from './tools/types.ts'
import { renderToolbar, DEFAULT_TOOLBAR } from './tools/toolbar.ts'
import { tableHtml, renderTableGrid } from './tools/table.ts'
import { aiStream } from '../../vdom/hooks/ai-stream.ts'
import type { AiStreamHandle } from '../../vdom/hooks/ai-stream.ts'
import type { DocState, EditEvent, MarkType, BlockKind, Align, MarkSpan } from './model/types.ts'
import { EMPTY_DOC } from './model/types.ts'
import { applyEdit, segmentStartAt, blockPropAt } from './model/apply.ts'
import { createHistory, pushCommit, popUndo, popRedo, canUndo, canRedo } from './model/history.ts'
import { parseHtml, serializeHtml } from './model/html.ts'
import { textDiff } from './model/diff.ts'
import { selectionOffsets, setSelectionOffsets } from './model/dom.ts'
import { editEmit } from './edit-events.ts'

export type { EditorProps, ToolbarItem, EditorAiAction, EditorAiOptions } from './tools/types.ts'

export const Editor: Component<EditorProps> = (_props, ctx) => {
  const _browser = ctx.browser ?? createClientBrowser()
  // ── mount（只一次）──
  let activeFormats: FormatState | null = null
  let showLinkInput = false
  let linkUrl = ''
  let mode: 'rich' | 'source' = 'rich'
  let showImageInput = false
  let imageUrl = ''
  let imageUploading = false
  let showTableGrid = false
  let tableHoverRow = -1
  let tableHoverCol = -1
  let sourceText = ''

  // ── 事件流事务层状态 ───────────────────────────────────
  let doc: DocState = EMPTY_DOC
  let hist = createHistory()
  // 受控回流脏标记：onChange 后父组件 value 回流前不写 innerHTML（光标保持）
  let domDirty = false

  let editorEl: HTMLElement | null = null
  const editorRef = (el: HTMLElement | null) => {
    if (el) {
      editorEl = el
      parseDom()
    }
  }

  // ── 模型 ↔ DOM ────────────────────────────────────────
  // **单一实现源（2027-09 死代码审计修复）**：editorRef 曾内联同逻辑——
  // parseDom 沦为死函数——收敛到 parseDom 单点（ref 与同步共用）。
  const parseDom = () => {
    if (!editorEl) return
    doc = parseHtml(editorEl.innerHTML)
  }

  // ── 输入接管（阶段 2）：浏览器直写 DOM（光标天然正确）→ onInput diff 推导事件
  //   → 合并为「输入」commit（1s 无输入落栈——一次撤销退全部连续输入）。
  //   无法推导（多位置同时变化）→ 整体同步无事件（诚实裁剪——撤销退快照）。 ──
  let pendingInput: { startDoc: DocState; events: EditEvent[]; ts: number } | null = null
  let inputTimer: ReturnType<typeof setTimeout> | null = null
  const flushInputCommit = () => {
    if (inputTimer) { clearTimeout(inputTimer); inputTimer = null }
    if (!pendingInput) return
    pushCommit(hist, { label: '输入', events: pendingInput.events, before: pendingInput.startDoc, ts: pendingInput.ts })
    editEmit('commit', { label: '输入', count: pendingInput.events.length })
    const html = serializeHtml(doc)
    if (onChangeRef.current) onChangeRef.current(html)
    saveDraft(html)
    pendingInput = null
  }
  const ensureInputCommit = (events: EditEvent[], newDoc: DocState) => {
    if (!pendingInput) pendingInput = { startDoc: doc, events: [], ts: Date.now() }
    pendingInput.events.push(...events)
    doc = newDoc
    // 输入防抖保存（独立于 1s flush——打字后 500ms 即落草稿）
    saveDraft(serializeHtml(newDoc))
    if (inputTimer) clearTimeout(inputTimer)
    inputTimer = setTimeout(flushInputCommit, 1000)
  }
  /** DOM 文本变化 → 编辑事件（公共前后缀——单点插入/删除/替换精确；重放验证） */
  const deriveInputEvents = (oldDoc: DocState, newText: string): EditEvent[] | null => {
    const old = oldDoc.text
    if (old === newText) return []
    let p = 0
    while (p < old.length && p < newText.length && old[p] === newText[p]) p++
    let s = 0
    while (s < old.length - p && s < newText.length - p && old[old.length - 1 - s] === newText[newText.length - 1 - s]) s++
    const events: EditEvent[] = []
    const delLen = old.length - p - s
    const insText = newText.slice(p, newText.length - s)
    if (delLen > 0) {
      const at = p
      events.push({
        type: 'text-delete', at, len: delLen, removed: old.slice(at, at + delLen),
        removedEmbeds: oldDoc.embeds.filter((e) => e.at >= at && e.at <= at + delLen),
        removedBlocks: oldDoc.blockProps.filter((b) => b.start >= at && b.start <= at + delLen),
      })
    }
    if (insText.length > 0) events.push({ type: 'text-insert', at: p, text: insText })
    // 重放验证（事件坐标一致性——不一致 → 无法推导）
    try {
      let d = oldDoc
      for (const e of events) d = applyEdit(d, e)
      if (d.text === newText) return events
    } catch { /* 推导失败 */ }
    return null
  }

  const writeDom = (d: DocState, caret?: { start: number; end: number } | null) => {
    if (!editorEl) return
    editorEl.innerHTML = serializeHtml(d)
    if (caret) setSelectionOffsets(editorEl, caret.start, caret.end)
    domDirty = false
  }

  const markState = (mark: MarkType): MarkSpan[] => doc.marks.filter((m) => m.type === mark)

  /** 语义操作事务：事件序列 → commit（before 快照 + undo 栈 + DOM 写回 + 光标） */
  const commitEvents = (events: EditEvent[], label: string, caret: { start: number; end: number } | null) => {
    flushInputCommit() // 输入 commit 落栈（格式/AI 操作 = 新 commit 边界）
    const before = doc
    const next = events.reduce((d, e) => applyEdit(d, e), before)
    doc = next
    pushCommit(hist, { label, events, before, caret: caret ?? undefined })
    writeDom(next, caret)
    const html = serializeHtml(next)
    if (onChangeRef.current) onChangeRef.current(html)
    saveDraft(html)
    editEmit('commit', { label, count: events.length })
  }

  const undo = () => {
    flushInputCommit()
    const c = popUndo(hist)
    if (!c) return
    doc = c.before
    writeDom(doc, c.caret ?? null)
    const html = serializeHtml(doc)
    if (onChangeRef.current) onChangeRef.current(html)
    saveDraft(html)
    editEmit('undo', { label: c.label })
  }

  const redo = () => {
    flushInputCommit()
    const c = popRedo(hist)
    if (!c) return
    let d = c.before
    for (const e of c.events) d = applyEdit(d, e)
    doc = d
    writeDom(doc, c.caret ?? null)
    const html = serializeHtml(doc)
    if (onChangeRef.current) onChangeRef.current(html)
    saveDraft(html)
    editEmit('redo', { label: c.label })
  }

  // ── 格式命令（事件构建——替代 execCommand） ─────────────
  const applyMarkCmd = (mark: MarkType) => {
    const sel = selectionOffsets(editorEl!)
    if (!sel || sel.start === sel.end) return
    // toggle：选区整体激活 → off，否则 on
    const on = !doc.marks.some((m) => m.type === mark && m.start <= sel.start && m.end >= sel.end)
    commitEvents([{ type: 'mark-apply', start: sel.start, end: sel.end, mark, on, prev: markState(mark) }], `mark-${mark}`, sel)
  }

  const blockCmd = (kind: BlockKind) => {
    const sel = selectionOffsets(editorEl!)
    const caret = sel?.start ?? 0
    const segStart = segmentStartAt(doc.text, caret)
    const prev = blockPropAt(doc, segStart)
    const cur = prev?.kind ?? 'p'
    // toggle：当前块格式 → 回默认
    commitEvents([{ type: 'block-set', start: segStart, kind: cur === kind ? 'p' : kind, align: null, prev }], `block-${kind}`, sel)
  }

  const alignCmd = (align: Align) => {
    const sel = selectionOffsets(editorEl!)
    const caret = sel?.start ?? 0
    const segStart = segmentStartAt(doc.text, caret)
    const prev = blockPropAt(doc, segStart)
    const cur = prev?.align ?? null
    // 反选：当前对齐 → 清除
    commitEvents([{ type: 'block-set', start: segStart, kind: prev?.kind ?? 'p', align: cur === align ? null : align, prev }], `align-${align}`, sel)
  }

  const linkCmd = (url: string, remove = false) => {
    const sel = selectionOffsets(editorEl!)
    if (!sel || sel.start === sel.end) return
    commitEvents([{
      type: 'mark-apply', start: sel.start, end: sel.end, mark: 'link',
      on: !remove, href: url, prev: markState('link'),
    }], remove ? 'unlink' : 'link', sel)
  }

  const insertEmbedCmd = (html: string, type: 'img' | 'table' | 'hr') => {
    const sel = selectionOffsets(editorEl!)
    const at = sel?.start ?? doc.text.length
    const id = `e${Date.now()}${Math.floor(Math.random() * 1e4)}`
    // 光标移到嵌入后（at + 1）
    const caret = sel ? { start: at + 1, end: at + 1 } : null
    commitEvents([{ type: 'embed-insert', at, embed: { id, at, type, html } }], `embed-${type}`, caret)
  }

  const clearCmd = () => {
    const sel = selectionOffsets(editorEl!)
    if (!sel) return
    const events: EditEvent[] = []
    for (const m of ['b', 'i', 'u', 'link'] as MarkType[]) {
      events.push({ type: 'mark-apply', start: sel.start, end: sel.end, mark: m, on: false, prev: markState(m) })
    }
    const segStart = segmentStartAt(doc.text, sel.start)
    const prev = blockPropAt(doc, segStart)
    if (prev) events.push({ type: 'block-set', start: segStart, kind: 'p', align: null, prev })
    commitEvents(events, 'clear', sel)
  }

  // ── 工具栏格式高亮（doc 查询——替代 queryCommandState） ──
  const queryFormatsFromDoc = (caret: number): FormatState => {
    const f: FormatState = {}
    for (const m of doc.marks) {
      if (m.start <= caret && caret < m.end) {
        if (m.type === 'b') f.bold = true
        else if (m.type === 'i') f.italic = true
        else if (m.type === 'u') f.underline = true
        else if (m.type === 'link') f.link = true
      }
    }
    const b = blockPropAt(doc, caret)
    if (b?.kind === 'h1') f.h1 = true
    else if (b?.kind === 'h2') f.h2 = true
    else if (b?.kind === 'h3') f.h3 = true
    else if (b?.kind === 'quote') f.blockquote = true
    if (b?.align === 'left') f.alignLeft = true
    else if (b?.align === 'center') f.alignCenter = true
    else if (b?.align === 'right') f.alignRight = true
    return f
  }

  // ── 选区保存/恢复（Modal/Table 弹层用） ──────────────────
  let savedSel: { start: number; end: number } | null = null
  const saveSelection = () => { savedSel = selectionOffsets(editorEl!) }
  const restoreSelection = () => {
    if (!editorEl || !savedSel) return
    setSelectionOffsets(editorEl, savedSel.start, savedSel.end)
  }

  // onChange 引用（renderFn 更新——事件回调在 render 定义读最新）
  const onChangeRef: { current?: (v: string) => void } = {}
  let firstMount = true

  // ── 草稿持久化（draftKey：防抖自动保存——刷新/崩溃恢复） ────────
  let draftTimer: ReturnType<typeof setTimeout> | null = null
  let draftKeyRef: string | null = null
  // 定时器纪律（AGENTS.md #12）：输入提交/草稿防抖定时器创建于事件回调内
  //（合法窗口）——卸载时未触发定时器必清（否则卸载后 flush/storageSet +
  // 上层 onChange 违例触发）
  ctx.ui.hold(() => {
    if (inputTimer) { clearTimeout(inputTimer); inputTimer = null }
    if (draftTimer) { clearTimeout(draftTimer); draftTimer = null }
  })
  const saveDraft = (html: string) => {
    if (!draftKeyRef) return
    if (draftTimer) clearTimeout(draftTimer)
    draftTimer = setTimeout(() => {
      draftTimer = null
      try { _browser.storageSet(`wf-editor-draft:${draftKeyRef}`, html) } catch { /* 存储失败隔离 */ }
    }, 500)
  }
  const restoreDraft = (): string | null => {
    if (!draftKeyRef) return null
    try { return _browser.storageGet(`wf-editor-draft:${draftKeyRef}`) ?? null } catch { return null }
  }

  // ── AI 协作状态（选区操作 → 建议浮层 → 接受 = ai-apply commit） ──────
  const DEFAULT_AI_ACTIONS: EditorAiAction[] = [
    { id: 'polish', label: '润色', prompt: ({ selection }) => `请润色以下文本，保持原意，输出润色后的完整文本（不要额外解释）：\n\n${selection}` },
    { id: 'translate', label: '翻译', prompt: ({ selection }) => `请将以下文本翻译成中文，直接输出译文（不要额外解释）：\n\n${selection}` },
    { id: 'shorten', label: '缩写', prompt: ({ selection }) => `请将以下文本缩写为更精炼的版本，保留核心信息，直接输出结果（不要额外解释）：\n\n${selection}` },
    { id: 'expand', label: '扩写', prompt: ({ selection }) => `请在保持原意的基础上扩写以下文本，使内容更充实，直接输出完整结果（不要额外解释）：\n\n${selection}` },
    { id: 'fix', label: '纠错', prompt: ({ selection }) => `请修正以下文本中的错别字、语法和标点错误，直接输出修正后的完整文本（不要额外解释）：\n\n${selection}` },
  ]
  interface AiPending {
    action: EditorAiAction
    start: number
    end: number
    original: string
    revised: string
    streaming: boolean
    error: string | null
    handle: AiStreamHandle | null
  }
  let aiPending: AiPending | null = null
  let aiPanelOpen = false
  let lastAiAction: EditorAiAction | null = null

  // ── 操作历史（时光机）：commit 列表 → 回到任意版本（AI 多轮修改刚需） ──
  let historyOpen = false
  /** 命令式句柄（唯一形态——openPopup——组件内部同步样板） */
  let historyHandle: import('../../vdom/hooks/popup-manager.ts').PopupHandle | null = null
  const syncHistoryPanel = (panel: import('../../vdom/index.ts').VNode): void => {
    if (historyOpen && !historyHandle)
      historyHandle = ctx.ui.openPopup({
        key: 'editor-history',
        anchor: () => anchorEl,
        placement: 'bottom',
        gap: 8,
        content: () => panel,
        onClose: () => { historyHandle = null; if (historyOpen) { historyOpen = false; ctx.render() } },
      })
    else if (!historyOpen && historyHandle) { historyHandle.close(); historyHandle = null }
    else if (historyHandle) historyHandle.update(panel)
  }

  /** 回到指定 commit（undo 栈下标——0 = 最早）：从目标 before 重放其 events——
   *  精确恢复该版本（重放到当前 doc 会触发事件一致性校验失败——prev 快照过期）；
   *  目标之后的 commit 移入 redo（可重做回来） */
  const goToCommit = (targetIndex: number) => {
    const target = hist.undoStack[targetIndex]
    if (!target) return
    let d = target.before
    for (const e of target.events) d = applyEdit(d, e)
    while (hist.undoStack.length > targetIndex + 1) {
      popUndo(hist)
    }
    doc = d
    historyOpen = false
    writeDom(doc, null)
    const html = serializeHtml(doc)
    if (onChangeRef.current) onChangeRef.current(html)
    saveDraft(html)
    editEmit('commit', { label: 'time-travel', to: targetIndex })
    ctx.render()
  }

  // 浮层锚点：最后点击的工具栏按钮（table Popover 同款——弹窗跟按钮走）
  let anchorEl: HTMLElement | null = null
  const setAnchor = (el: HTMLElement | null) => { anchorEl = el }

  // ── Link/Image 输入浮层（§5.4：轻量锚定浮层——命令式弹窗；Modal 会话级过重） ──
  /** 命令式句柄（唯一形态——openPopup——组件内部同步样板） */
  let linkHandle: import('../../vdom/hooks/popup-manager.ts').PopupHandle | null = null
  const syncLinkModal = (panel: import('../../vdom/index.ts').VNode | null): void => {
    if (showLinkInput && panel && !linkHandle)
      linkHandle = ctx.ui.openPopup({
        key: 'editor-link',
        anchor: () => anchorEl,
        placement: 'bottom',
        gap: 8,
        content: () => panel,
        onClose: () => { linkHandle = null; if (showLinkInput) { showLinkInput = false; ctx.render() } },
      })
    else if (!showLinkInput && linkHandle) { linkHandle.close(); linkHandle = null }
    else if (linkHandle && panel) linkHandle.update(panel)
  }
  let imageHandle: import('../../vdom/hooks/popup-manager.ts').PopupHandle | null = null
  const syncImageModal = (panel: import('../../vdom/index.ts').VNode | null): void => {
    if (showImageInput && panel && !imageHandle)
      imageHandle = ctx.ui.openPopup({
        key: 'editor-image',
        anchor: () => anchorEl,
        placement: 'bottom',
        gap: 8,
        content: () => panel,
        onClose: () => { imageHandle = null; if (showImageInput) { showImageInput = false; ctx.render() } },
      })
    else if (!showImageInput && imageHandle) { imageHandle.close(); imageHandle = null }
    else if (imageHandle && panel) imageHandle.update(panel)
  }
  let aiHandle: import('../../vdom/hooks/popup-manager.ts').PopupHandle | null = null
  const syncAiPanel = (panel: import('../../vdom/index.ts').VNode | null): void => {
    if (aiPanelOpen && panel && !aiHandle)
      aiHandle = ctx.ui.openPopup({
        key: 'editor-ai-panel',
        anchor: () => anchorEl,
        placement: 'bottom',
        gap: 8,
        content: () => panel,
        onClose: () => {
          aiHandle = null
          if (aiPanelOpen) {
            aiPanelOpen = false
            aiPending?.handle?.abort()
            ctx.render()
          }
        },
      })
    else if (!aiPanelOpen && aiHandle) { aiHandle.close(); aiHandle = null }
    else if (aiHandle && panel) aiHandle.update(panel)
  }

  /** 触发 AI 动作：选区（无选区 = 全文）→ 提示词 → wf: 流式 → 建议浮层 */
  const runAiAction = (action: EditorAiAction, aiOpts: EditorAiOptions) => {
    if (!editorEl) return
    const sel = selectionOffsets(editorEl)
    const start = sel?.start ?? 0
    const end = sel && sel.start !== sel.end ? sel.end : doc.text.length
    const original = doc.text.slice(start, end)
    console.log('[runAi] original:', JSON.stringify(original), 'start:', start, 'end:', end)
    if (!original.trim()) return
    aiPending?.handle?.abort()
    lastAiAction = action
    aiPending = {
      action, start, end, original,
      revised: '', streaming: true, error: null, handle: null,
    }
    aiPanelOpen = true
    ctx.render()
    const prompt = action.prompt({ selection: original })
    editEmit('ai-apply', { action: action.id, status: 'start' })
    const handle = aiStream(aiOpts.url, {
      messages: [{ role: 'user', content: prompt }],
    }, {
      headers: aiOpts.headers,
      onToken: (text) => {
        if (!aiPending) return
        aiPending.revised += text
        ctx.render()
      },
      onDone: () => {
        if (!aiPending) return
        aiPending.streaming = false
        editEmit('ai-apply', { action: action.id, status: 'done', chars: aiPending.revised.length })
        ctx.render()
      },
      onError: (e) => {
        if (!aiPending) return
        aiPending.streaming = false
        aiPending.error = e?.message ?? 'AI 请求失败'
        editEmit('ai-apply', { action: action.id, status: 'error', message: aiPending.error })
        ctx.render()
      },
      onEvent: aiOpts.onEvent,
    })
    if (aiPending) aiPending.handle = handle
  }

  /** 接受建议：AI 替换 = edit:ai-apply commit（原子撤销一步——事件流杀手级能力） */
  const acceptAi = (aiOpts: EditorAiOptions) => {
    const p = aiPending
    if (!p || p.streaming || !p.revised.trim()) return
    aiPanelOpen = false
    aiPending = null
    // 选区文本可能已被用户编辑——校验 original 匹配（不匹配 → 放弃，诚实失败）
    if (doc.text.slice(p.start, p.end) !== p.original) {
      editEmit('ai-apply', { action: p.action.id, status: 'rejected', reason: 'stale-selection' })
      ctx.render()
      return
    }
    // AI 回复首尾空白清理（模型输出格式噪音——\n 开头会产生空段 + 格式错位）
    const revised = p.revised.trim()
    if (!revised) {
      editEmit('ai-apply', { action: p.action.id, status: 'rejected', reason: 'empty' })
      ctx.render()
      return
    }
    const removedEmbeds = doc.embeds.filter((e) => e.at >= p.start && e.at < p.end)
    const removedBlocks = doc.blockProps.filter((b) => b.start >= p.start && b.start <= p.end)
    commitEvents([{
      type: 'ai-apply', start: p.start, end: p.end,
      original: p.original, revised,
      removedEmbeds, removedBlocks,
    }], `ai-${p.action.id}`, { start: p.start + revised.length, end: p.start + revised.length })
    editEmit('ai-apply', { action: p.action.id, status: 'accepted' })
    void aiOpts
    ctx.render()
  }

  // 组件文案（i18n：ctx.i18n.components.Editor——locale 包注册；缺省 fallback）
  const editorText = (key: string, fallback: string): string =>
    (ctx as any).i18n?.components?.Editor?.[key] ?? fallback

  return (props: EditorProps) => {
    const { value = '', onChange, onUpload, placeholder = '', disabled = false, minHeight = '200px', draftKey } = props
    const toolbarItems = props.toolbar ?? DEFAULT_TOOLBAR
    const isRichMode = mode === 'rich'
    onChangeRef.current = onChange
    draftKeyRef = draftKey ?? null

    const emitChange = (html: string) => {
      domDirty = true
      onChange?.(html)
    }

    // ── 工具栏点击 ───────────────────────────────────────
    const handleToolbarItem = (item: ToolbarItem, anchor?: HTMLElement | null) => {
      if (disabled) return
      if (anchor) anchorEl = anchor
      editorEl?.focus()

      if (item === 'source') {
        if (isRichMode) {
          sourceText = editorEl?.innerHTML ?? value
          mode = 'source'
          ctx.render()
        } else {
          mode = 'rich'
          activeFormats = {}
          domDirty = false
          doc = parseHtml(value) // 切回富文本：强制同步受控值到模型
          ctx.render()
          onChange?.(value)
        }
        return
      }

      if (!isRichMode) return

      switch (item) {
        case 'bold': applyMarkCmd('b'); break
        case 'italic': applyMarkCmd('i'); break
        case 'underline': applyMarkCmd('u'); break
        case 'h1': blockCmd('h1'); break
        case 'h2': blockCmd('h2'); break
        case 'h3': blockCmd('h3'); break
        case 'blockquote': blockCmd('quote'); break
        case 'ul': blockCmd('ul'); break
        case 'ol': blockCmd('ol'); break
        case 'alignLeft': alignCmd('left'); break
        case 'alignCenter': alignCmd('center'); break
        case 'alignRight': alignCmd('right'); break
        case 'hr': insertEmbedCmd('<hr>', 'hr'); break
        case 'image': {
          showImageInput = true
          imageUrl = ''
          ctx.render()
          return
        }
        case 'link': {
          saveSelection()
          const sel = selectionOffsets(editorEl!)
          if (!sel || sel.start === sel.end) {
            showLinkInput = true
            linkUrl = ''
            ctx.render()
            return
          }
          // 已有链接 → unlink；否则输入 URL
          const hasLink = doc.marks.some((m) => m.type === 'link' && m.start <= sel.start && m.end >= sel.end)
          if (hasLink) {
            restoreSelection()
            linkCmd('', true)
            ctx.render()
          } else {
            showLinkInput = true
            linkUrl = ''
            ctx.render()
          }
          return
        }
        case 'clear': clearCmd(); break
        default: return
      }
      activeFormats = queryFormatsFromDoc(selectionOffsets(editorEl!)?.start ?? 0)
      ctx.render()
    }

    // ── 链接 ────────────────────────────────────────────
    const confirmLink = (url: string) => {
      showLinkInput = false
      ctx.render()
      if (!url) return
      restoreSelection()
      linkCmd(url)
      ctx.render()
    }

    const cancelLink = () => {
      showLinkInput = false
      linkUrl = ''
      ctx.render()
    }

    // ── 图片 ────────────────────────────────────────────
    const handleImageFile = async (files: File[]) => {
      const file = files[0]
      if (!file) return
      imageUploading = true
      ctx.render()
      try {
        const url = await onUpload!(file)
        restoreSelection()
        insertEmbedCmd(`<img src="${url}" alt="">`, 'img')
        showImageInput = false
        imageUrl = ''
        ctx.render()
      } catch {
      } finally {
        imageUploading = false
        ctx.render()
      }
    }

    const confirmImageUrl = (url: string) => {
      showImageInput = false
      imageUrl = ''
      ctx.render()
      restoreSelection()
      insertEmbedCmd(`<img src="${url}" alt="">`, 'img')
    }

    const cancelImage = () => {
      showImageInput = false
      imageUrl = ''
      ctx.render()
    }

    // ── 表格 ────────────────────────────────────────────
    const handleTableSelect = (rows: number, cols: number) => {
      showTableGrid = false
      tableHoverRow = -1
      tableHoverCol = -1
      restoreSelection()
      insertEmbedCmd(tableHtml(rows, cols), 'table')
      ctx.render()
    }

    const handleTableHover = (row: number, col: number) => {
      tableHoverRow = row
      tableHoverCol = col
      ctx.render()
    }

    const handleTableLeave = () => {
      tableHoverRow = -1
      tableHoverCol = -1
      ctx.render()
    }

    const tableButton = h('button', {
      key: 'table',
      class: 'wf-editor-tb-btn',
      type: 'button',
      title: '插入表格',
      'aria-label': '插入表格',
      'data-item': 'table',
    }, '⊞')

    const tableGrid = showTableGrid ? renderTableGrid(
      tableHoverRow, tableHoverCol,
      handleTableSelect, handleTableHover, handleTableLeave,
    ) : null

    const tablePopover = h(Popover, {
      key: 'table',
      open: isRichMode && !!showTableGrid,
      onOpenChange: (v: boolean) => {
        showTableGrid = v
        if (v) saveSelection()
        ctx.render()
      },
      content: tableGrid,
    }, tableButton)

    // ── 输入事件（浏览器直写 DOM → 同步模型——不产生事件，阶段 2 输入入流） ──
    const handleRichInput = () => {
      if (disabled) return
      const el = editorEl
      if (!el) return
      const newDoc = parseHtml(el.innerHTML)
      // 空内容归一化（placeholder：无可见文本且无媒体 → 空文档）
      const isEmpty = !(el.textContent ?? '').trim() && !(el.querySelector?.('img,table,hr') ?? null)
      if (isEmpty) {
        if (doc.text === '' && newDoc.text === '') return
        flushInputCommit()
        doc = EMPTY_DOC
        el.innerHTML = ''
        emitChange('')
        return
      }
      // 输入 diff 推导（打字/删字/Enter/IME/粘贴——浏览器直写 → 事件入流）
      const events = deriveInputEvents(doc, newDoc.text)
      if (events === null) {
        // 无法推导（多位置同时变化）——整体同步（诚实裁剪：不产生事件）
        flushInputCommit()
        doc = newDoc
        emitChange(serializeHtml(doc))
        return
      }
      if (events.length === 0) {
        // embed 快照可能变化（表格内编辑——文本不变但 html 变了——真实事故：
        // FilePreview 表格编辑保存不生效——doc 同步丢失）
        const oldHtml = serializeHtml(doc)
        doc = newDoc
        if (serializeHtml(newDoc) !== oldHtml) emitChange(serializeHtml(newDoc))
        return
      }
      ensureInputCommit(events, newDoc)
      emitChange(serializeHtml(newDoc))
    }

    const handleSourceInput = (e: Event) => {
      const val = (e.target as HTMLTextAreaElement).value
      onChange?.(val)
    }

    // ── 键盘 ────────────────────────────────────────────
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        // 输入已入流（阶段 2）——撤销全走自建栈（精确回退输入/格式/AI）
        e.preventDefault()
        flushInputCommit() // 挂起输入先落栈（1s 合并窗口内 Ctrl+Z 也能退）
        if (canUndo(hist)) {
          undo()
          activeFormats = queryFormatsFromDoc(selectionOffsets(editorEl!)?.start ?? 0)
          ctx.render()
        }
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        flushInputCommit()
        if (canRedo(hist)) {
          redo()
          activeFormats = queryFormatsFromDoc(selectionOffsets(editorEl!)?.start ?? 0)
          ctx.render()
        }
      } else if (mod && e.key === 'Enter') {
        // Ctrl+Enter：快速触发最近使用的 AI 动作（无记录 = 第一个；无 ai = 不拦截）
        const aiOpts = props.ai
        if (aiOpts && !disabled && isRichMode) {
          e.preventDefault()
          flushInputCommit()
          const actions = aiOpts.actions ?? DEFAULT_AI_ACTIONS
          runAiAction(lastAiAction ?? actions[0], aiOpts)
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (disabled || !isRichMode) return
      const isFormatShortcut = (e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())
      if (isFormatShortcut) {
        saveSelection()
        applyMarkCmd(e.key.toLowerCase() === 'b' ? 'b' : e.key.toLowerCase() === 'i' ? 'i' : 'u')
        activeFormats = queryFormatsFromDoc(selectionOffsets(editorEl!)?.start ?? 0)
        ctx.render()
        return
      }
      // 光标移动 → 更新工具栏高亮
      activeFormats = queryFormatsFromDoc(selectionOffsets(editorEl!)?.start ?? 0)
      ctx.render()
    }

    const handleMouseUp = () => {
      if (!isRichMode) return
      saveSelection()
      const caret = selectionOffsets(editorEl!)?.start ?? 0
      const newFormats = queryFormatsFromDoc(caret)
      if (activeFormats === null || !shallowEqual(activeFormats, newFormats)) {
        activeFormats = newFormats
        ctx.render()
      }
    }

    const handleMouseDown = () => {
      saveSelection()
      let needsRender = false
      if (showLinkInput) { showLinkInput = false; needsRender = true }
      if (showImageInput) { showImageInput = false; needsRender = true }
      if (needsRender) ctx.render()
    }

    // ── Link 输入浮层（命令式弹窗锚定浮层——非会话级模态） ──────
    syncLinkModal(isRichMode && showLinkInput ? h('div', {
      class: 'wf-editor-link-panel',
    }, [
      h('div', { class: 'wf-editor-link-panel-title' }, editorText('linkTitle', '插入链接')),
      h('input', {
        type: 'url', class: 'wf-editor-link-input', placeholder: 'https://...',
        value: linkUrl, 'data-editor-link-input': true,
        onInput: (e: Event) => { linkUrl = (e.target as HTMLInputElement).value; ctx.render() },
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'Enter') confirmLink((e.target as HTMLInputElement).value)
          if (e.key === 'Escape') cancelLink()
        },
      }),
      h('div', { class: 'wf-editor-link-panel-actions' }, [
        h('button', { class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', onClick: cancelLink }, '取消'),
        h('button', {
          class: 'wf-btn wf-btn--primary wf-btn--sm', type: 'button',
          onClick: () => confirmLink(linkUrl),
        }, '确定'),
      ]),
    ]) : null)

    // ── Image Modal ─────────────────────────────────────
    const imageBodyChildren: any[] = []

    if (onUpload) {
      imageBodyChildren.push(h(FileUpload, {
        accept: 'image/*',
        multiple: false,
        disabled: imageUploading,
        onChange: handleImageFile,
      }, h('div', { class: 'wf-editor-img-zone' }, [
        h('span', { class: 'wf-editor-img-zone-icon' }, '🖼'),
        h('span', { class: 'wf-editor-img-zone-text' }, imageUploading ? '上传中...' : '点击或拖拽上传图片'),
      ])))
      imageBodyChildren.push(h('span', { class: 'wf-editor-img-or' }, '或'))
    }

    imageBodyChildren.push(h('input', {
      type: 'url', class: 'wf-editor-link-input',
      placeholder: onUpload ? '粘贴图片链接' : 'https://...',
      value: imageUrl, 'data-image-input': true,
      disabled: imageUploading || undefined,
      onInput: (e: Event) => { imageUrl = (e.target as HTMLInputElement).value; ctx.render() },
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Enter') confirmImageUrl((e.target as HTMLInputElement).value)
        if (e.key === 'Escape') cancelImage()
      },
    }))

    syncImageModal(isRichMode && showImageInput ? h('div', {
      class: 'wf-editor-link-panel',
    }, [
      h('div', { class: 'wf-editor-link-panel-title' }, editorText('imageTitle', '插入图片')),
      h('div', { class: 'wf-stack', style: 'gap:8px' }, imageBodyChildren),
      h('div', { class: 'wf-editor-link-panel-actions' }, [
        h('button', { class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', disabled: imageUploading || undefined, onClick: cancelImage }, '取消'),
        h('button', {
          class: 'wf-btn wf-btn--primary wf-btn--sm', type: 'button',
          disabled: imageUploading || undefined,
          onClick: () => confirmImageUrl(imageUrl),
        }, onUpload ? '插入' : '确定'),
      ]),
    ]) : null)

    // ── 渲染 ──────────────────────────────────────────
    let editorBody: VNode | null = null

    if (isRichMode) {
      const editorClass = [
        'wf-editor-content',
        disabled && 'wf-editor-content--disabled',
        placeholder && 'wf-editor-content--has-placeholder',
      ].filter(Boolean).join(' ')

      // 回流完成检测：DOM 与受控 value 一致 = onChange 已回流（脏标记清除）。
      // 刚清除的当次 render 不写（值相同，写 innerHTML 会重建子树 → caret 丢）
      const wasDirty = domDirty
      if (domDirty && editorEl && editorEl.innerHTML === value) domDirty = false
      const externalSync = !domDirty && !wasDirty
      const editorProps: Record<string, any> = {
        class: editorClass,
        contentEditable: !disabled,
        'data-placeholder': placeholder || undefined,
        style: { minHeight },
        onInput: handleRichInput,
        onKeyDown: handleKeyDown,
        onKeyUp: handleKeyUp,
        onMouseUp: handleMouseUp,
        onMouseDown: handleMouseDown,
        ref: editorRef,
      }
      // 外部变化/首次挂载才写 innerHTML（脏标记期间不重写 → 光标保持）
      if (externalSync) {
        if (firstMount) {
          firstMount = false
          // 草稿恢复：value 为空且存在草稿 → 用草稿（写作场景刷新不丢）
          const draft = value === '' ? restoreDraft() : null
          doc = parseHtml(draft ?? value)
          editorProps.innerHTML = serializeHtml(doc)
          if (draft) {
            domDirty = true
            onChange?.(serializeHtml(doc))
          }
        } else {
          // 模型与受控值不一致（外部 setValue）→ 同步模型
          if (editorEl && value !== '' && serializeHtml(doc) !== value) {
            doc = parseHtml(value)
            domDirty = false
          }
          editorProps.innerHTML = serializeHtml(doc)
        }
      }
      editorBody = h('div', editorProps)
    } else {
      editorBody = h('textarea', {
        class: 'wf-editor-source',
        value: value,
        disabled,
        style: { minHeight },
        onInput: handleSourceInput,
      })
    }

    const customRender: Record<string, (item: ToolbarItem) => VNode> = {
      table: () => tablePopover,
    }

    // ── AI 协作（工具栏按钮组 + 建议浮层） ─────────────────────
    const aiOpts = props.ai
    const aiActions = (aiOpts?.actions ?? DEFAULT_AI_ACTIONS).map((a) => ({
      ...a,
      label: editorText(`ai-${a.id}`, a.label),
    }))
    let aiButtons: VNode | null = null
    let historyBtn: VNode | null = null

    /** AI diff 视图：原文删除线 + 建议高亮（model/diff.ts——零依赖） */
    const renderAiDiff = (original: string, revised: string): VNode => {
      const ops = textDiff(original, revised)
      const parts: VNode[] = []
      let k = 0
      for (const op of ops) {
        if (op.type === 'equal') parts.push(h('span', { key: `e${k++}` }, op.text))
        else if (op.type === 'delete') parts.push(h('del', { key: `d${k++}`, class: 'wf-editor-ai-diff-del' }, op.text))
        else parts.push(h('ins', { key: `i${k++}`, class: 'wf-editor-ai-diff-ins' }, op.text))
      }
      return h('div', { class: 'wf-editor-ai-panel-body wf-editor-ai-diff' }, parts)
    }
    if (!disabled && isRichMode) {
      historyBtn = h('button', {
        key: 'hist',
        class: ['wf-editor-tb-btn', 'wf-editor-tb-btn--ai', historyOpen ? 'wf-editor-tb-btn--active' : ''].filter(Boolean).join(' '),
        type: 'button',
        title: '操作历史',
        'aria-label': '操作历史',
        'data-item': 'history',
        onClick: (e: MouseEvent) => { setAnchor(e.currentTarget as HTMLElement); historyOpen = !historyOpen; ctx.render() },
      }, '🕘')
      if (historyOpen) {
        const rows: VNode[] = []
        // undo 栈（新 → 旧）
        const undoList = hist.undoStack.slice().reverse()
        for (let i = 0; i < undoList.length; i++) {
          const c = undoList[i]
          const idx = hist.undoStack.length - 1 - i
          rows.push(h('button', {
            key: `u-${idx}`,
            class: ['wf-editor-hist-item', i === 0 ? 'wf-editor-hist-item--current' : ''].filter(Boolean).join(' '),
            type: 'button',
            onClick: () => goToCommit(idx),
          }, [
            h('span', { class: 'wf-editor-hist-label' }, c.label),
            h('span', { class: 'wf-editor-hist-time' }, new Date(c.ts ?? Date.now()).toLocaleTimeString()),
          ]))
        }
        // redo 栈（可重做）
        for (let i = hist.redoStack.length - 1; i >= 0; i--) {
          const c = hist.redoStack[i]
          rows.push(h('button', {
            key: `r-${i}`,
            class: 'wf-editor-hist-item wf-editor-hist-item--redo',
            type: 'button',
            onClick: () => {
              while (canRedo(hist) && hist.redoStack.length > i) redo()
              historyOpen = false
              ctx.render()
            },
          }, [
            h('span', { class: 'wf-editor-hist-label' }, `↩ ${c.label}`),
          ]))
        }
        syncHistoryPanel(
          rows.length
            ? h('div', { class: 'wf-editor-hist-panel' }, rows)
            : h('div', { class: 'wf-editor-hist-panel wf-editor-hist-empty' }, '暂无操作记录'),
        )
      }
    }
    if (aiOpts && !disabled && isRichMode) {
      aiButtons = h('div', { class: 'wf-editor-ai-bar' }, [
        h('span', { class: 'wf-editor-tb-sep', key: 'ai-sep' }),
        ...aiActions.map((a) => h('button', {
          key: `ai-${a.id}`,
          class: ['wf-editor-tb-btn', 'wf-editor-tb-btn--ai', aiPending?.streaming && aiPending?.action.id === a.id ? 'wf-editor-tb-btn--active' : ''].filter(Boolean).join(' '),
          type: 'button',
          title: a.label,
          'aria-label': `AI ${a.label}`,
          'aria-expanded': String(!!aiPanelOpen),
          'data-ai-item': a.id,
          disabled: (aiPending?.streaming ? true : undefined) ?? undefined,
          onClick: (e: MouseEvent) => { setAnchor(e.currentTarget as HTMLElement); runAiAction(a, aiOpts) },
        }, a.label)),
      ])
      if (aiPanelOpen && aiPending) {
        const p = aiPending
        const panelContent = h('div', { class: 'wf-editor-ai-panel' }, [
          h('div', { class: 'wf-editor-ai-panel-head' }, [
            h('span', {}, `AI ${p.action.label}`),
            h('span', { class: 'wf-editor-ai-panel-status' }, p.streaming ? editorText('generating', '生成中…') : (p.error ? editorText('failed', '失败') : '')),
          ]),
          p.error
            ? h('div', { class: 'wf-editor-ai-panel-error' }, p.error)
            : (!p.streaming && p.revised ? renderAiDiff(p.original, p.revised) : h('div', { class: 'wf-editor-ai-panel-body' }, p.revised || '…')),
          h('div', { class: 'wf-editor-ai-panel-actions' }, [
            h('button', {
              class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button',
              onClick: () => { aiPanelOpen = false; aiPending = null; ctx.render() },
            }, editorText('reject', '拒绝')),
            p.error
              ? h('button', {
                class: 'wf-btn wf-btn--primary wf-btn--sm', type: 'button',
                onClick: () => runAiAction(p.action, aiOpts),
              }, editorText('retry', '重试'))
              : h('button', {
                class: 'wf-btn wf-btn--primary wf-btn--sm', type: 'button',
                disabled: (p.streaming || !p.revised.trim()) ? true : undefined,
                onClick: () => acceptAi(aiOpts),
              }, editorText('accept', '接受')),
          ]),
        ])
        syncAiPanel(panelContent)
      }
    }

    // 关闭兜底（条件 sync 在 if 块内——内部关闭（拒绝/回退）后 renderFn 不再
    // 调用 sync——handle 残留——面板残留——恒检查）
    if (!historyOpen && historyHandle) { historyHandle.close(); historyHandle = null }
    if (!aiPanelOpen && aiHandle) { aiHandle.close(); aiHandle = null }

    return h('div', {
      class: `wf-editor${disabled ? ' wf-editor--disabled' : ''}`,
    }, [
      !disabled && toolbarItems.length > 0
        ? renderToolbar(toolbarItems, activeFormats ?? {}, !isRichMode, handleToolbarItem, customRender,
            [...(aiButtons ? [aiButtons] : []), ...(historyBtn ? [historyBtn] : [])])
        : null,
      editorBody,
      h('input', { type: 'hidden', value, 'aria-hidden': 'true' }),
    ])
  }
}


function shallowEqual(a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  for (const k of keys) {
    if (a[k] !== b[k]) return false
  }
  return true
}
