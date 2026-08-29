/**
 * weifuwu/components — FileTree
 *
 * 文件树浏览器（工作空间/目录浏览场景）：面包屑 + 工具行（上传/刷新）+
 * 目录/文件列表（图标/大小/时间）+ 文件编辑态（textarea + 保存/返回）。
 *
 * **受控组件（诚实裁剪）**：纯展示 + 回调上抛——状态（entries/path/编辑
 * 内容）与数据源（API/WS）由父组件管理——组件零 fetch/零 xhr——数据源
 * 无关（本地目录/沙盒卷/API 均可驱动）。来源：agent-platform FilesSection
 * （工作空间文件区——AI 沙盒写文件 ↔ 用户管理面双向可见）沉淀。
 *
 * 状态约定（父层驱动）：
 * - entries/path/loading：当前目录列表
 * - openFile/editValue/saving：编辑态（openFile 非空 = 编辑中）
 * - 回调：onOpenDir/onOpenFile/onBack/onSave/onEditChange/onUpload/onRefresh
 */

import type { Component } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Button } from '../Button/Button.ts'
import { Icon } from '../Icon/Icon.ts'

export interface FileTreeEntry {
  name: string
  type: 'dir' | 'file'
  size?: number
  mtime?: string
}

export interface FileTreeOpenFile {
  path: string
  content: string
  /** 二进制不可预览（父层识别——打开时直接 toast） */
  binary?: boolean
  truncated?: boolean
  size?: number
}

export interface FileTreeProps {
  /** 当前目录条目（父层数据源驱动） */
  entries?: FileTreeEntry[]
  /** 当前目录路径（面包屑） */
  path?: string
  loading?: boolean
  /** 编辑态（非空 = 文件编辑中——列表替换为编辑器） */
  openFile?: FileTreeOpenFile | null
  /** 编辑内容（受控） */
  editValue?: string
  saving?: boolean
  /** 目录空态文案 */
  emptyText?: string
  /** 编辑态返回列表 */
  onBack?: () => void
  onOpenDir?: (path: string) => void
  onOpenFile?: (path: string) => void
  onSave?: (content: string) => void
  onEditChange?: (value: string) => void
  /** 上传（父层处理 File——组件只触发选择） */
  onUpload?: (file: File) => void
  onRefresh?: () => void
  /** 上传 accept（默认全部） */
  accept?: string
}

function formatSize(bytes?: number): string {
  if (bytes === undefined) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function fmtTime(iso?: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const diff = Date.now() - d.getTime()
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    return d.toLocaleDateString()
  } catch { return '' }
}

export const FileTree: Component<FileTreeProps> = (_init, _ctx) => {
  let fileInput: HTMLInputElement | null = null
  const fileInputRef = (el: HTMLInputElement | null) => { if (el) fileInput = el }
  const pickFile = () => fileInput?.click()

  return (props) => {
    const {
      entries = [], path = '/', loading = false, openFile = null,
      editValue = '', saving = false, emptyText = '空目录',
    } = props
    const parts = path === '/' ? [] : path.split('/').filter(Boolean)
    const onFilePick = (e: Event) => {
      const input = e.target as HTMLInputElement
      const f = input.files?.[0]
      input.value = ''
      if (f) props.onUpload?.(f)
    }

    const crumb = (label: any, onClick: () => void) =>
      h('button', { type: 'button', class: 'wf-filetree-crumb', onClick }, label)
    const sep = () => h('span', { class: 'wf-filetree-sep' }, '/')

    return h('div', { class: 'wf-filetree' }, [
      // 工具行：面包屑 + 上传/刷新
      h('div', { class: 'wf-filetree-toolbar' }, [
        h('div', { class: 'wf-filetree-path' }, [
          crumb('/', () => props.onOpenDir?.('/')),
          ...parts.map((p, i) => {
            const full = parts.slice(0, i + 1).join('/')
            return h('span', { class: 'wf-filetree-crumb-wrap' }, [
              sep(),
              crumb(p, () => props.onOpenDir?.(full)),
            ])
          }),
        ]),
        h('div', { class: 'wf-filetree-actions' }, [
          ...(props.onUpload ? [
            h(Button, { size: 'sm', variant: 'ghost', onClick: pickFile }, [h(Icon, { name: 'upload', size: 13 }), ' 上传']),
            h('input', { ref: fileInputRef, type: 'file', hidden: true, accept: props.accept, onChange: onFilePick }),
          ] : []),
          ...(props.onRefresh ? [h(Button, { size: 'sm', variant: 'ghost', onClick: props.onRefresh }, [h(Icon, { name: 'refresh', size: 13 }), ' 刷新'])] : []),
        ]),
      ]),
      // 编辑态 / 列表态
      openFile
        ? h('div', { class: 'wf-filetree-editor' }, [
          h('div', { class: 'wf-filetree-editor-head' }, [
            props.onBack ? h(Button, { size: 'sm', variant: 'ghost', onClick: props.onBack, disabled: saving }, [h(Icon, { name: 'arrow-left', size: 13 }), ' 返回列表']) : null,
            h('span', { class: 'wf-filetree-filename' }, `${openFile.path}${openFile.truncated ? '（已截断）' : ''}`),
            props.onSave ? h(Button, { size: 'sm', variant: 'primary', disabled: saving || props.onEditChange === undefined, onClick: () => props.onSave?.(editValue) }, saving ? '保存中...' : '保存') : null,
          ]),
          props.onEditChange
            ? h('textarea', { class: 'wf-filetree-editor-area', rows: 14, value: editValue, spellcheck: false, onInput: (e: Event) => props.onEditChange?.((e.target as HTMLTextAreaElement).value) })
            : h('pre', { class: 'wf-filetree-preview' }, openFile.content || '（空文件）'),
        ])
        : h('div', { class: 'wf-filetree-list' }, loading
          ? h('div', { class: 'wf-filetree-empty wf-text-secondary' }, '加载中…')
          : entries.length === 0
            ? h('div', { class: 'wf-filetree-empty wf-text-secondary' }, emptyText)
            : entries.map((entry) => h('button', {
              type: 'button',
              key: entry.name,
              class: 'wf-filetree-item',
              onClick: () => entry.type === 'dir'
                ? props.onOpenDir?.(path === '/' ? entry.name : `${path}/${entry.name}`)
                : props.onOpenFile?.(path === '/' ? entry.name : `${path}/${entry.name}`),
            }, [
              h(Icon, { name: entry.type === 'dir' ? 'folder' : 'file', size: 14, className: entry.type === 'dir' ? 'wf-filetree-dir' : 'wf-filetree-file' }),
              h('span', { class: 'wf-filetree-name' }, entry.name),
              h('span', { class: 'wf-filetree-meta' }, [
                entry.type === 'file' && entry.size !== undefined ? formatSize(entry.size) : '',
                entry.mtime ? ` · ${fmtTime(entry.mtime)}` : '',
              ]),
            ]))),
    ])
  }
}
