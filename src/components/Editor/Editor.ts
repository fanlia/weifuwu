/**
 * weifuwu/components — Editor
 *
 * 富文本编辑器组件，基于 contentEditable + document.execCommand。
 * 零外部依赖，纯函数 (props, ctx) => VNode。
 *
 * 使用两阶段模型 + VDOM innerHTML 支持，不再需要手动 _prevValue/_mounted/_el。
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
  const $ = ctx.ui.$
  $.activeFormats = {} as FormatState
  $.showLinkInput = false
  $.linkUrl = ''
  $.mode = 'rich'
  $.showImageInput = false
  $.imageUrl = ''
  $.imageUploading = false
  $.showTableGrid = false
  $.tableHoverRow = -1
  $.tableHoverCol = -1

  let editorEl: HTMLElement | undefined

  // ── render（每次 dirty/props 变化）──
  return (props: EditorProps) => {
    const { value = '', onChange, onUpload, placeholder = '', disabled = false, minHeight = '200px' } = props
    const toolbarItems = props.toolbar ?? DEFAULT_TOOLBAR
    const isRichMode = $.mode === 'rich'

    const emitChange = (html: string) => {
      onChange?.(html)
    }

    // ── 工具栏点击 ───────────────────────────────────────
    const handleToolbarItem = (item: ToolbarItem) => {
      if (disabled) return

      if (item === 'source') {
        if (isRichMode) {
          $.sourceText = editorEl?.innerHTML ?? value
          $.mode = 'source'
        } else {
          $.mode = 'rich'
          $.activeFormats = {}
          onChange?.(value)
        }
        return
      }

      if (!isRichMode) return

      if (item === 'image') {
        $.showImageInput = true
        $.imageUrl = ''
        return
      }

      if (item === 'link') {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed) {
          $.showLinkInput = true
          $.linkUrl = ''
          return
        }
        const existing = document.queryCommandState('createLink')
        if (existing) {
          exec('unlink')
          $.activeFormats = queryFormats()
        } else {
          $.showLinkInput = true
          $.linkUrl = ''
        }
        return
      }

      execFormat(item)
      $.activeFormats = queryFormats()
      if (editorEl && onChange) emitChange(editorEl.innerHTML)
    }

    // ── 链接 ────────────────────────────────────────────
    const confirmLink = (url: string) => {
      $.showLinkInput = false
      if (!url) return
      if (editorEl) editorEl.focus()
      exec('createLink', url)
      $.activeFormats = queryFormats()
      if (editorEl && onChange) emitChange(editorEl.innerHTML)
    }

    const cancelLink = () => {
      $.showLinkInput = false
      $.linkUrl = ''
    }

    // ── 图片 ────────────────────────────────────────────
    const insertImageFn = (url: string) => {
      if (!url) return
      exec('insertImage', url)
      $.activeFormats = queryFormats()
      if (editorEl && onChange) emitChange(editorEl.innerHTML)
    }

    const handleImageFile = async (files: File[]) => {
      const file = files[0]
      if (!file) return
      $.imageUploading = true
      try {
        const url = await onUpload!(file)
        insertImageFn(url)
        $.showImageInput = false
        $.imageUrl = ''
      } catch {
      } finally {
        $.imageUploading = false
      }
    }

    const confirmImageUrl = (url: string) => {
      $.showImageInput = false
      $.imageUrl = ''
      if (editorEl) editorEl.focus()
      insertImageFn(url)
    }

    const cancelImage = () => {
      $.showImageInput = false
      $.imageUrl = ''
    }

    // ── 表格 ────────────────────────────────────────────
    const handleTableSelect = (rows: number, cols: number) => {
      $.showTableGrid = false
      $.tableHoverRow = -1
      $.tableHoverCol = -1
      if (editorEl) editorEl.focus()
      insertTable(rows, cols)
      if (editorEl && onChange) emitChange(editorEl.innerHTML)
    }

    const handleTableHover = (row: number, col: number) => {
      $.tableHoverRow = row
      $.tableHoverCol = col
    }

    const handleTableLeave = () => {
      $.tableHoverRow = -1
      $.tableHoverCol = -1
    }

    const tableButton = h('button', {
      key: 'table',
      class: 'wf-editor-tb-btn',
      type: 'button',
      title: '插入表格',
      'aria-label': '插入表格',
      'data-item': 'table',
    }, '⊞')

    const tableGrid = $.showTableGrid ? renderTableGrid(
      $.tableHoverRow, $.tableHoverCol,
      handleTableSelect, handleTableHover, handleTableLeave,
    ) : null

    const tablePopover = h(Popover, {
      key: 'table',
      open: isRichMode && !!$.showTableGrid,
      onOpenChange: (v: boolean) => { $.showTableGrid = v },
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

    // ── ref ──────────────────────────────────────────
    const editorRef = (el: HTMLElement | null) => {
      if (el) editorEl = el
      return () => { editorEl = undefined }
    }

    // ── 键盘 ────────────────────────────────────────────
    const handleKeyUp = (e: KeyboardEvent) => {
      if (disabled || !isRichMode) return
      const isFormatShortcut = (e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())
      if (isFormatShortcut) {
        $.activeFormats = queryFormats()
        if (editorEl && onChange) emitChange(editorEl.innerHTML)
      }
    }

    const handleMouseUp = () => {
      if (!isRichMode) return
      $.activeFormats = queryFormats()
    }

    const handleMouseDown = () => {
      if ($.showLinkInput) $.showLinkInput = false
      if ($.showImageInput) $.showImageInput = false
    }

    // ── Link Modal ──────────────────────────────────────
    const linkModal = isRichMode && $.showLinkInput ? h(Modal, {
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
        value: $.linkUrl, 'data-editor-link-input': true,
        onInput: (e: Event) => { $.linkUrl = (e.target as HTMLInputElement).value },
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
        disabled: $.imageUploading,
        onChange: handleImageFile,
      }, h('div', { class: 'wf-editor-img-zone' }, [
        h('span', { class: 'wf-editor-img-zone-icon' }, '🖼'),
        h('span', { class: 'wf-editor-img-zone-text' }, $.imageUploading ? '上传中...' : '点击或拖拽上传图片'),
      ])))
      imageBodyChildren.push(h('span', { class: 'wf-editor-img-or' }, '或'))
    }

    imageBodyChildren.push(h('input', {
      type: 'url', class: 'wf-editor-link-input',
      placeholder: onUpload ? '粘贴图片链接' : 'https://...',
      value: $.imageUrl, 'data-image-input': true,
      disabled: $.imageUploading || undefined,
      onInput: (e: Event) => { $.imageUrl = (e.target as HTMLInputElement).value },
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Enter') confirmImageUrl((e.target as HTMLInputElement).value)
        if (e.key === 'Escape') cancelImage()
      },
    }))

    const imageModal = isRichMode && $.showImageInput ? h(Modal, {
      open: true,
      title: '插入图片',
      onClose: cancelImage,
      footer: [
        h('button', { class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', disabled: $.imageUploading || undefined, onClick: cancelImage }, '取消'),
        h('button', {
          class: 'wf-btn wf-btn--primary wf-btn--sm', type: 'button',
          disabled: $.imageUploading || undefined,
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
        innerHTML: value,
        'data-placeholder': placeholder || undefined,
        style: { minHeight },
        onInput: handleRichInput,
        onKeyUp: handleKeyUp,
        onMouseUp: handleMouseUp,
        onMouseDown: handleMouseDown,
        ref: editorRef,
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
      !disabled && toolbarItems.length > 0 ? renderToolbar(toolbarItems, $.activeFormats, !isRichMode, handleToolbarItem, customRender) : null,
      linkModal,
      imageModal,
      editorBody,
      h('input', { type: 'hidden', value, 'aria-hidden': 'true' }),
    ])
  }
}
