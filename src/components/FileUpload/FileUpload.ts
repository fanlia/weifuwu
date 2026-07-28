/**
 * weifuwu/components — FileUpload
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

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

  return (props: FileUploadProps) => {
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

    const dragRef = (el: HTMLElement | null) => {
      if (!el || disabled) return
      const onDrop = (e: DragEvent) => {
        e.preventDefault()
        el.classList.remove('wf-upload-zone--drag')
        if (disabled) return
        const dropped = Array.from(e.dataTransfer?.files ?? [])
        if (maxSize) {
          const oversized = dropped.filter(f => f.size > maxSize)
          if (oversized.length > 0) return
        }
        onChange?.(dropped)
      }
      const onDragOver = (e: DragEvent) => {
        e.preventDefault()
        el.classList.add('wf-upload-zone--drag')
      }
      const onDragLeave = () => el.classList.remove('wf-upload-zone--drag')
      el.addEventListener('drop', onDrop)
      el.addEventListener('dragover', onDragOver)
      el.addEventListener('dragleave', onDragLeave)
      return () => {
        el.removeEventListener('drop', onDrop)
        el.removeEventListener('dragover', onDragOver)
        el.removeEventListener('dragleave', onDragLeave)
      }
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
    })

    const dropZone = h('div', {
      class: `wf-upload-zone${disabled ? ' wf-upload-zone--disabled' : ''}${error ? ' wf-upload-zone--err' : ''}`,
      onClick: disabled ? undefined : () => {
        const input = document.querySelector('.wf-upload-input') as HTMLInputElement
        input?.click()
      },
      ref: dragRef,
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
              }, '✕')
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
