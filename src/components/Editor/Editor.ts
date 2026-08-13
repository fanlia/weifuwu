/**
 * weifuwu/components — Editor
 *
 * 富文本编辑器组件，基于 contentEditable + _browser?.execCommand。
 * 零外部依赖，纯函数 (props, ctx) => VNode。
 *
 * 使用两阶段模型 + VDOM innerHTML 支持。
 * 状态管理：闭包变量 + ctx.ui.render()
 */

import type { Component, VNode } from '../../ui-dom/vnode.ts'
import { createClientBrowser } from '../../ui-dom/browser.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
import { Modal } from '../Modal/Modal.ts'
import { FileUpload } from '../FileUpload/FileUpload.ts'
import { Popover } from '../Popover/Popover.ts'
import type { ToolbarItem, EditorProps, FormatState } from './tools/types.ts'
import { exec, execFormat, queryFormats } from './tools/format.ts'
import { DEFAULT_TOOLBAR, renderToolbar } from './tools/toolbar.ts'
import { insertTable, renderTableGrid } from './tools/table.ts'

export type { EditorProps, ToolbarItem } from './tools/types.ts'

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

export const Editor: Component<EditorProps> = async (_props, ctx) => {
  const _browser = ctx.browser ?? createClientBrowser()
  // ── mount（只一次）──
  let activeFormats: FormatState | null = null  // null = 未初始化，首次 mouseUp 只存不 render
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

  let editorEl: HTMLElement | null = null
  const editorRef = (el: HTMLElement | null) => { if (el) editorEl = el }

  // ── 受控回流脏标记（§5.3 contentEditable 版）──────────────────
  // contentEditable 的 innerHTML 受控回流会重写 DOM → 光标归零（真实事故：demo 输入一个
  // 字母光标跳到第一个字符）。脏标记模型：onInput/工具操作（DOM 已被修改且 onChange 尚未
  // 回流）期间**不传 innerHTML prop**（patch 不重写 → 光标保持）；回流完成（DOM === value）
  // 后清除；外部变化（source 切回/程序化 setValue）在非脏状态正常同步。
  let domDirty = false

  // ── 对齐 class 清理（HTML 语义一致）──────────────────────
  // execCommand('justify*') 只加 inline style，不清除冲突的文本对齐 class——
  // 初始内容带 wf-text-center 时点左/右对齐，HTML 残留 `class="wf-text-center"
  // style="text-align: left"`（class 声明居中 + style 声明左——语义矛盾，复用场景 class
  // 生效）。对齐操作后清除选区块的 wf-text-* 对齐类（真实浏览器验收发现）。
  const ALIGN_CLASSES = ['wf-text-left', 'wf-text-center', 'wf-text-right']
  const clearAlignClasses = () => {
    if (!editorEl) return
    const sel = _browser?.getSelection()
    if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    // start/end 容器各自向上找块，清除对齐类（覆盖光标所在块/选区两端块）
    const targets = new Set<Element>()
    for (const c of [range.startContainer, range.endContainer]) {
      let n: Node | null = c.nodeType === 1 ? c : c.parentNode
      while (n && n !== editorEl && n.nodeType === 1) {
        targets.add(n as Element)
        n = n.parentNode
      }
    }
    for (const el of targets) {
      let removed = false
      for (const c of ALIGN_CLASSES) {
        if (el.classList.contains(c)) { el.classList.remove(c); removed = true }
      }
      // 对齐类清空后无其他 class → 移除空 class 属性（HTML 输出干净）
      if (removed && el.className.trim() === '') el.removeAttribute('class')
    }
  }
  // 对齐反选：移除选区块的 inline text-align（execCommand('justify*') 不 toggle——
  // 已居中的块再点 alignCenter 不会移除 style，真实浏览器验收发现）
  const clearAlignStyle = () => {
    if (!editorEl) return
    const sel = _browser?.getSelection()
    if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    const targets = new Set<Element>()
    for (const c of [range.startContainer, range.endContainer]) {
      let n: Node | null = c.nodeType === 1 ? c : c.parentNode
      while (n && n !== editorEl && n.nodeType === 1) {
        targets.add(n as Element)
        n = n.parentNode
      }
    }
    for (const el of targets) {
      if (el instanceof HTMLElement && el.style.textAlign) {
        el.style.removeProperty('text-align')
        if (el.style.cssText === '') el.removeAttribute('style')
      }
    }
  }
  const ALIGN_COMMANDS: Record<string, string> = {
    alignLeft: 'justifyLeft', alignCenter: 'justifyCenter', alignRight: 'justifyRight',
  }

  // ── 选区保存/恢复 ──────────────────────────────
  let savedRange: Range | null = null

  const saveSelection = () => {
    const sel = _browser?.getSelection()
    if (sel && sel.rangeCount > 0) savedRange = sel.getRangeAt(0)
  }

  const restoreSelection = () => {
    if (!editorEl || !savedRange) return
    editorEl.focus()
    const sel = _browser?.getSelection()
    if (sel) {
      sel.removeAllRanges()
      sel.addRange(savedRange)
    }
  }

  // ── caret 文本偏移保存/恢复（格式操作专用——真实浏览器验收发现）────────────────
  // execCommand('formatBlock' 等块级命令）后，Chrome 会在**渲染（renderOne）后**替换
  // contentEditable 内部节点（innerHTML 字符串相同但节点对象不同）——caret 引用的旧节点
  // 脱离文档 → 被重置到编辑器开头（光标跳到第一行第一个字符）。
  // 手动模拟全部 DOM 操作均无法阻止（Chrome 内部重建）。防御：格式操作前记录 caret 的
  // **文本绝对偏移**（不依赖节点引用），render 完成后按偏移重新定位（内容文本不变——
  // 格式命令不增删文本——偏移仍有效）。
  let savedCaretPos: { start: number; end: number } | null = null

  const textOffsetOf = (node: Node | null, offset: number): number => {
    if (!editorEl || !node || node.nodeType !== 3) return 0
    let acc = 0
    const w = editorEl.ownerDocument.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT)
    let n: Node | null = w.nextNode()
    while (n && n !== node) {
      acc += String(n.nodeValue ?? '').length
      n = w.nextNode()
    }
    return acc + offset
  }

  const nodeAtTextOffset = (target: number): { node: Node; off: number } | null => {
    if (!editorEl) return null
    const w = editorEl.ownerDocument.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT)
    let n: Node | null = w.nextNode()
    let acc = 0
    while (n) {
      const len = String(n.nodeValue ?? '').length
      if (acc + len >= target) return { node: n, off: target - acc }
      acc += len
      n = w.nextNode()
    }
    return null
  }

  const saveCaretPos = () => {
    const sel = _browser?.getSelection()
    if (!sel || !sel.rangeCount || !editorEl) return
    const range = sel.getRangeAt(0)
    savedCaretPos = {
      start: textOffsetOf(range.startContainer, range.startOffset),
      end: textOffsetOf(range.endContainer, range.endOffset),
    }
  }

  const restoreCaretPos = () => {
    if (!editorEl || !savedCaretPos) return
    const { start, end } = savedCaretPos
    const sel = _browser?.getSelection()
    if (!sel) return
    editorEl.focus()
    const startNode = nodeAtTextOffset(start)
    if (!startNode) return
    const range = editorEl.ownerDocument.createRange()
    range.setStart(startNode.node, startNode.off)
    if (start === end) {
      range.collapse(true)
    } else {
      const endNode = nodeAtTextOffset(end)
      if (endNode) range.setEnd(endNode.node, endNode.off)
    }
    sel.removeAllRanges()
    sel.addRange(range)
    savedCaretPos = null
  }

  /** 格式操作后恢复 caret（render 异步完成后——setTimeout 0：微任务（renderOne 链）先于宏任务） */
  const restoreCaretAfterRender = () => {
    if (savedCaretPos == null) return
    _browser.timeout(() => restoreCaretPos(), 0)
  }

  // ── render（每次 dirty/props 变化）──
  return async (props: EditorProps) => {
    const { value = '', onChange, onUpload, placeholder = '', disabled = false, minHeight = '200px' } = props
    const toolbarItems = props.toolbar ?? DEFAULT_TOOLBAR
    const isRichMode = mode === 'rich'

    const emitChange = (html: string) => {
      domDirty = true // DOM 已被修改——受控回流完成前不写 innerHTML（光标保持）
      onChange?.(html)
    }

    // ── 工具栏点击 ───────────────────────────────────────
    const handleToolbarItem = (item: ToolbarItem) => {
      if (disabled) return

      // 恢复 contentEditable 焦点 + selection：真实用户点击工具栏按钮 → contentEditable
      // 失焦（按钮获焦）——execCommand 对失焦内容选区不可靠（连续应用工具失效：选中文字
      // 点 bold 后再点 italic，选区已丢）。focus() 恢复 contentEditable 的 document
      // selection（Chrome focus 与 selection 分离——失焦不清 selection，focus 恢复）。
      editorEl?.focus()

      if (item === 'source') {
        if (isRichMode) {
          sourceText = editorEl?.innerHTML ?? value
          mode = 'source'
          ctx.ui.render()
        } else {
          mode = 'rich'
          activeFormats = {}
          domDirty = false // 切回富文本：强制同步受控值到 contentEditable
          ctx.ui.render()
          onChange?.(value)
        }
        return
      }

      if (!isRichMode) return

      if (item === 'image') {
        showImageInput = true
        imageUrl = ''
        ctx.ui.render()
        return
      }

      if (item === 'link') {
        saveSelection()
        const sel = _browser?.getSelection()
        if (!sel || sel.isCollapsed) {
          showLinkInput = true
          linkUrl = ''
          ctx.ui.render()
          return
        }
        const existing = _browser?.execCommand('createLink')
        if (existing) {
          exec('unlink')
          activeFormats = queryFormats()
          if (editorEl && onChange) emitChange(editorEl.innerHTML) // unlink 也改 DOM——同步受控值
          ctx.ui.render()
        } else {
          showLinkInput = true
          linkUrl = ''
          ctx.ui.render()
        }
        return
      }

      if (item === 'alignLeft' || item === 'alignCenter' || item === 'alignRight') {
        // 对齐完全独立处理（不经过 execFormat——避免「先执行命令再查状态」误判 toggle）：
        // 当前已是该对齐 → 反选（移除 inline style——execCommand 不 toggle 对齐）
        saveCaretPos() // 格式操作前记录 caret 文本偏移（render 后 Chrome 重建内部节点——偏移恢复）
        const cur = queryFormats()
        if (cur[item]) clearAlignStyle()
        else exec(ALIGN_COMMANDS[item])
        clearAlignClasses() // 清除冲突的 wf-text-* 对齐类（HTML 语义一致）
        activeFormats = queryFormats()
        if (editorEl && onChange) emitChange(editorEl.innerHTML)
        ctx.ui.render()
        restoreCaretAfterRender()
        return
      }

      saveCaretPos() // 格式操作前记录 caret 文本偏移（execFormat 前——caret 在目标位置）
      execFormat(item)
      activeFormats = queryFormats()
      if (editorEl && onChange) emitChange(editorEl.innerHTML) // 先标记脏（DOM 已改）再 render——避免 render 写旧 value 覆盖
      ctx.ui.render()
      restoreCaretAfterRender()
    }

    // ── 链接 ────────────────────────────────────────────
    const confirmLink = (url: string) => {
      showLinkInput = false
      ctx.ui.render()
      if (!url) return
      editorEl?.focus()
      exec('createLink', url)
      activeFormats = queryFormats()
      if (editorEl && onChange) emitChange(editorEl.innerHTML)
    }

    const cancelLink = () => {
      showLinkInput = false
      linkUrl = ''
      ctx.ui.render()
    }

    // ── 图片 ────────────────────────────────────────────
    const insertImageFn = (url: string) => {
      if (!url) return
      exec('insertImage', url)
      activeFormats = queryFormats()
      if (editorEl && onChange) emitChange(editorEl.innerHTML)
    }

    const handleImageFile = async (files: File[]) => {
      const file = files[0]
      if (!file) return
      imageUploading = true
      ctx.ui.render()
      try {
        const url = await onUpload!(file)
        insertImageFn(url)
        showImageInput = false
        imageUrl = ''
        ctx.ui.render()
      } catch {
      } finally {
        imageUploading = false
        ctx.ui.render()
      }
    }

    const confirmImageUrl = (url: string) => {
      showImageInput = false
      imageUrl = ''
      ctx.ui.render()
      editorEl?.focus()
      insertImageFn(url)
    }

    const cancelImage = () => {
      showImageInput = false
      imageUrl = ''
      ctx.ui.render()
    }

    // ── 表格 ────────────────────────────────────────────
    const handleTableSelect = (rows: number, cols: number) => {
      showTableGrid = false
      tableHoverRow = -1
      tableHoverCol = -1
      // 先恢复选区 + 插入表格（DOM 还未被 render 移动）
      restoreSelection()
      insertTable(rows, cols)
      if (editorEl && onChange) emitChange(editorEl.innerHTML) // 先标记脏（DOM 已插表）再 render
      // 再 render 关闭弹出层
      ctx.ui.render()
    }

    const handleTableHover = (row: number, col: number) => {
      tableHoverRow = row
      tableHoverCol = col
      ctx.ui.render()
    }

    const handleTableLeave = () => {
      tableHoverRow = -1
      tableHoverCol = -1
      ctx.ui.render()
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
        if (v) saveSelection()  // 在 render 前保存选区（render 可能移动 DOM）
        ctx.ui.render()
      },
      content: tableGrid,
    }, tableButton)

    // ── 输入事件 ────────────────────────────────────────
    const handleRichInput = (e: Event) => {
      if (disabled) return
      const el = e.currentTarget as HTMLElement
      let html = el.innerHTML
      // 清空时 Chrome 保留空骨架（<br>/<p><br></p>/<div><br></div>）——:empty 不匹配 →
      // placeholder 永不显示（真实浏览器验收发现）。无可见文本且无媒体元素（img/table/hr）
      // 时归一为空串，让 .wf-editor-content:empty::before 生效。
      const isEmpty = !(el.textContent ?? '').trim() && !(el.querySelector?.('img,table,hr') ?? null)
      if (isEmpty) {
        html = ''
        el.innerHTML = ''
      }
      emitChange(html)
    }

    const handleSourceInput = (e: Event) => {
      const val = (e.target as HTMLTextAreaElement).value
      onChange?.(val)
    }

    // ── 键盘 ────────────────────────────────────────────
    const handleKeyUp = (e: KeyboardEvent) => {
      if (disabled || !isRichMode) return
      saveSelection()
      const isFormatShortcut = (e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())
      if (isFormatShortcut) {
        saveCaretPos() // 快捷键格式操作同样需要 caret 偏移恢复
        activeFormats = queryFormats()
        if (editorEl && onChange) emitChange(editorEl.innerHTML) // 先标记脏再 render（同上）
        ctx.ui.render()
        restoreCaretAfterRender()
      }
    }

    const handleMouseUp = () => {
      if (!isRichMode) return
      saveSelection()
      const newFormats = queryFormats()
      if (activeFormats === null) {
        activeFormats = newFormats
        return
      }
      if (!shallowEqual(activeFormats, newFormats)) {
        activeFormats = newFormats
        ctx.ui.render()
      }
    }

    const handleMouseDown = () => {
      // 在焦点移出编辑器前保存选区（供 table/link/image 弹出层使用）
      saveSelection()
      let needsRender = false
      if (showLinkInput) { showLinkInput = false; needsRender = true }
      if (showImageInput) { showImageInput = false; needsRender = true }
      if (needsRender) ctx.ui.render()
    }

    // ── Link Modal ──────────────────────────────────────
    const linkModal = isRichMode && showLinkInput ? h(Modal, {
      open: true,
      title: '插入链接',
      onClose: cancelLink,
      footer: [
        h('button', { class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', onClick: cancelLink }, '取消'),
        h('button', {
          class: 'wf-btn wf-btn--primary wf-btn--sm', type: 'button',
          onClick: () => confirmLink(linkUrl),
        }, '确定'),
      ],
    },
      h('input', {
        type: 'url', class: 'wf-editor-link-input', placeholder: 'https://...',
        value: linkUrl, 'data-editor-link-input': true,
        onInput: (e: Event) => { linkUrl = (e.target as HTMLInputElement).value; ctx.ui.render() },
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'Enter') confirmLink((e.target as HTMLInputElement).value)
          if (e.key === 'Escape') cancelLink()
        },
      }),
    ) : null

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
      onInput: (e: Event) => { imageUrl = (e.target as HTMLInputElement).value; ctx.ui.render() },
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Enter') confirmImageUrl((e.target as HTMLInputElement).value)
        if (e.key === 'Escape') cancelImage()
      },
    }))

    const imageModal = isRichMode && showImageInput ? h(Modal, {
      open: true,
      title: '插入图片',
      onClose: cancelImage,
      footer: [
        h('button', { class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', disabled: imageUploading || undefined, onClick: cancelImage }, '取消'),
        h('button', {
          class: 'wf-btn wf-btn--primary wf-btn--sm', type: 'button',
          disabled: imageUploading || undefined,
          onClick: () => confirmImageUrl(imageUrl),
        }, onUpload ? '插入' : '确定'),
      ],
    },
      h('div', { class: 'wf-stack', style: 'gap:8px' }, imageBodyChildren),
    ) : null

    // ── 渲染 ──────────────────────────────────────────
    let editorBody: VNode | null = null

    if (isRichMode) {
      const editorClass = [
        'wf-editor-content',
        disabled && 'wf-editor-content--disabled',
        placeholder && 'wf-editor-content--has-placeholder',
      ].filter(Boolean).join(' ')

      // 回流完成检测：DOM 与受控 value 一致 = onChange 已回流（脏标记清除）。
      // **刚清除的当次 render 不写**（值相同，写 innerHTML 会重建子树 → caret 丢）——
      // externalSync 要求「本次起点不脏且尚未清除」（wasDirty 捕获清除动作）
      const wasDirty = domDirty
      if (domDirty && editorEl && editorEl.innerHTML === value) domDirty = false
      const externalSync = !domDirty && !wasDirty
      const editorProps: Record<string, any> = {
        class: editorClass,
        contentEditable: !disabled,
        'data-placeholder': placeholder || undefined,
        style: { minHeight },
        onInput: handleRichInput,
        onKeyUp: handleKeyUp,
        onMouseUp: handleMouseUp,
        onMouseDown: handleMouseDown,
        ref: editorRef,
      }
      // 脏标记期间不传 innerHTML（不重写 DOM → 光标不跳）；外部变化/首次挂载才同步
      if (externalSync) editorProps.innerHTML = value
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

    return h('div', {
      class: `wf-editor${disabled ? ' wf-editor--disabled' : ''}`,
    }, [
      !disabled && toolbarItems.length > 0 ? renderToolbar(toolbarItems, activeFormats ?? {}, !isRichMode, handleToolbarItem, customRender) : null,
      editorBody,
      linkModal,
      imageModal,
      h('input', { type: 'hidden', value, 'aria-hidden': 'true' }),
    ])
  }
}
