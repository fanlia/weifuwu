/**
 * weifuwu/components — FileUpload
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

export interface FileUploadProps {
  accept?: string
  multiple?: boolean
  maxSize?: number
  disabled?: boolean
  error?: string
  hint?: string
  value?: File[]
  onChange?: (files: File[]) => void
  children?: any
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export const FileUpload: Component<FileUploadProps> = (_init, ctx) => {
  const FL = (ctx as any)?.i18n?.components?.FileUpload ?? {}
  let fileInput: HTMLInputElement | null = null
  const fileInputRef = (el: HTMLInputElement | null) => { if (el) fileInput = el }

  // ── mount（只一次）：DnD 经 ctx.ui.useDragDrop（drop/dragover/dragleave + preventDefault）
  // 最新 props 经 propsRef；拖拽高亮态 isDragging（闭包 + render）
  const propsRef: any = { ..._init }
  let isDragging = false
  const { dropProps } = ctx.ui.useDragDrop({
    onDrop: (e) => {
      isDragging = false
      ctx.ui.render()
      if (propsRef.disabled) return
      const dropped = Array.from(e.dataTransfer?.files ?? [])
      if (propsRef.maxSize) {
        const oversized = dropped.filter((f: File) => f.size > propsRef.maxSize)
        if (oversized.length > 0) return
      }
      propsRef.onChange?.(dropped)
    },
    onDragOver: () => {
      if (!isDragging) { isDragging = true; ctx.ui.render() }
    },
    onDragLeave: () => {
      if (isDragging) { isDragging = false; ctx.ui.render() }
    },
  })

  return (props: FileUploadProps) => {
    Object.assign(propsRef, props)
    const { accept, multiple, maxSize, disabled, error, hint, value, onChange, children } = props
    const files = value ?? []

    const handleChange = (e: Event) => {
      const input = e.target as HTMLInputElement
      const selected = Array.from(input.files ?? [])
      if (maxSize) {
        const oversized = selected.filter(f => f.size > maxSize)
        if (oversized.length > 0) return
      }
      onChange?.(selected)
      input.value = ''
    }

    const handleRemove = (i: number) => {
      const updated = files.filter((_, idx) => idx !== i)
      onChange?.(updated)
    }

    const inputEl = h('input', {
      type: 'file',
      class: 'wf-upload-input',
      accept: accept || undefined,
      multiple: multiple || undefined,
      disabled: disabled || undefined,
      onChange: handleChange,
      style: { display: 'none' },
      ref: fileInputRef,
    })

    const dropZone = h('div', {
      class: `wf-upload-zone${disabled ? ' wf-upload-zone--disabled' : ''}${error ? ' wf-upload-zone--err' : ''}${isDragging ? ' wf-upload-zone--drag' : ''}`,
      onClick: disabled ? undefined : () => fileInput?.click(),
      ...dropProps, // useDragDrop：drop/dragover/dragleave（VNode props，渲染器绑定/清理）
    }, children ?? h('div', { class: 'wf-upload-placeholder' }, [
      h('span', { class: 'wf-upload-icon' }, '📁'),
      h('span', { class: 'wf-upload-text' }, FL.placeholder ?? '点击或拖拽上传文件'),
      accept ? h('span', { class: 'wf-upload-hint' }, `${FL.supportedFormats ?? '支持格式: '}${accept}`) : null,
      maxSize ? h('span', { class: 'wf-upload-hint' }, `${FL.maxSize ?? '最大 '}${formatSize(maxSize)}`) : null,
    ].filter(Boolean)))

    const fileList = files.length > 0
      ? h('ul', { class: 'wf-upload-list' },
          files.map((f, i) =>
            h('li', { class: 'wf-upload-item', key: f.name + f.size },
              h('span', { class: 'wf-upload-item-info' }, [
                h('span', { class: 'wf-upload-item-name' }, f.name),
                h('span', { class: 'wf-upload-item-size' }, formatSize(f.size)),
              ]),
              h('button', {
                class: 'wf-upload-item-remove',
                'aria-label': `${FL.remove ?? '删除'} ${f.name}`,
                onClick: () => handleRemove(i),
              }, h(Icon, { name: 'trash' }))
            )
          )
        )
      : null

    const parts: any[] = [inputEl, dropZone, fileList]
    if (error) parts.push(h('div', { class: 'wf-upload-err' }, error))
    if (hint && !error) parts.push(h('div', { class: 'wf-upload-hint' }, hint))

    return h('div', { class: 'wf-upload' }, parts)
  }
}
