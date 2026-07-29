/**
 * weifuwu/components — Editor
 *
 * 富文本编辑器组件，基于 contentEditable + document.execCommand。
 * 零外部依赖，纯函数 (props, ctx) => VNode。
 *
 * 使用两阶段模型 + VDOM innerHTML 支持。
 * 状态管理：闭包变量 + ctx.ui.render()
 */

import type { Component, VNode } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
import { Modal } from '../Modal/Modal.ts'
import { FileUpload } from '../FileUpload/FileUpload.ts'
import { Popover } from '../Popover/Popover.ts'
import type { ToolbarItem, EditorProps, FormatState } from './tools/types.ts'
import { exec, execFormat, queryFormats } from './tools/format.ts'
import { DEFAULT_TOOLBAR, renderToolbar } from './tools/toolbar.ts'
import { insertTable, renderTableGrid } from './tools/table.ts'

export type { EditorProps, ToolbarItem } from './tools/types.ts'

export const Editor: Component<EditorProps> = (_props, ctx) => {
  // ── mount（只一次）──
  let activeFormats: FormatState = {}
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

  const getEditorEl = (): HTMLElement | null =>
    document.querySelector('.wf-editor-content')

  // ── render（每次 dirty/props 变化）──
  return (props: EditorProps) => {
    const { value = '', onChange, onUpload, placeholder = '', disabled = false, minHeight = '200px' } = props
    const toolbarItems = props.toolbar ?? DEFAULT_TOOLBAR
    const isRichMode = mode === 'rich'

    const emitChange = (html: string) => {
      onChange?.(html)
    }

    // ── 工具栏点击 ───────────────────────────────────────
    const handleToolbarItem = (item: ToolbarItem) => {
      if (disabled) return

      if (item === 'source') {
        if (isRichMode) {
          sourceText = getEditorEl()?.innerHTML ?? value
          mode = 'source'
          ctx.ui.render()
        } else {
          mode = 'rich'
          activeFormats = {}
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
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed) {
          showLinkInput = true
          linkUrl = ''
          ctx.ui.render()
          return
        }
        const existing = document.queryCommandState('createLink')
        if (existing) {
          exec('unlink')
          activeFormats = queryFormats()
          ctx.ui.render()
        } else {
          showLinkInput = true
          linkUrl = ''
          ctx.ui.render()
        }
        return
      }

      execFormat(item)
      activeFormats = queryFormats()
      ctx.ui.render()
      const el = getEditorEl()
      if (el && onChange) emitChange(el.innerHTML)
    }

    // ── 链接 ────────────────────────────────────────────
    const confirmLink = (url: string) => {
      showLinkInput = false
      ctx.ui.render()
      if (!url) return
      getEditorEl()?.focus()
      exec('createLink', url)
      activeFormats = queryFormats()
      const el = getEditorEl()
      if (el && onChange) emitChange(el.innerHTML)
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
      const el = getEditorEl()
      if (el && onChange) emitChange(el.innerHTML)
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
      getEditorEl()?.focus()
      insertImageFn(url)
    }

    const cancelImage = () => {
      showImageInput = false
      imageUrl = ''
      ctx.ui.render()
    }

    // ── 表格 ────────────────────────────────────────────
    const getEditorEl = (): HTMLElement | null =>
      document.querySelector('.wf-editor-content')

    const handleTableSelect = (rows: number, cols: number) => {
      showTableGrid = false
      tableHoverRow = -1
      tableHoverCol = -1
      ctx.ui.render()
      const el = getEditorEl()
      el?.focus()
      insertTable(rows, cols)
      if (el && onChange) emitChange(el.innerHTML)
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
      onOpenChange: (v: boolean) => { showTableGrid = v; ctx.ui.render() },
      content: tableGrid,
    }, tableButton)

    // ── 输入事件 ────────────────────────────────────────
    const handleRichInput = (e: Event) => {
      if (disabled) return
      emitChange((e.currentTarget as HTMLElement).innerHTML)
    }

    const handleSourceInput = (e: Event) => {
      const val = (e.target as HTMLTextAreaElement).value
      onChange?.(val)
    }

    // ── 键盘 ────────────────────────────────────────────
    const handleKeyUp = (e: KeyboardEvent) => {
      if (disabled || !isRichMode) return
      const isFormatShortcut = (e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())
      if (isFormatShortcut) {
        activeFormats = queryFormats()
        ctx.ui.render()
        const el = getEditorEl()
        if (el && onChange) emitChange(el.innerHTML)
      }
    }

    const handleMouseUp = () => {
      if (!isRichMode) return
      activeFormats = queryFormats()
      ctx.ui.render()
    }

    const handleMouseDown = () => {
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
          onClick: () => {
            const input = document.querySelector('[data-editor-link-input]') as HTMLInputElement
            confirmLink(input?.value ?? '')
          },
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
          onClick: () => {
            const input = document.querySelector('[data-image-input]') as HTMLInputElement
            confirmImageUrl(input?.value ?? '')
          },
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

      // 使用 innerHTML prop，VDOM 自动同步
      editorBody = h('div', {
        class: editorClass,
        contentEditable: !disabled,
        innerHTML: isRichMode ? value : sourceText,
        'data-placeholder': placeholder || undefined,
        style: { minHeight },
        onInput: handleRichInput,
        onKeyUp: handleKeyUp,
        onMouseUp: handleMouseUp,
        onMouseDown: handleMouseDown,
      })
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
      !disabled && toolbarItems.length > 0 ? renderToolbar(toolbarItems, activeFormats, !isRichMode, handleToolbarItem, customRender) : null,
      editorBody,
      linkModal,
      imageModal,
      h('input', { type: 'hidden', value, 'aria-hidden': 'true' }),
    ])
  }
}
