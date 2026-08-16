/**
 * weifuwu/components/FilePreview — 文件预览（office/pdf/md/html/text）
 *
 * 架构（design/file-preview-plan.md）：
 * - md 预览：复用 `<Markdown>` 组件（安全 token 渲染——表格/任务列表/URL 白名单）
 * - md/text 编辑：复用 `<Editor>`（事件流事务层——撤销/时光机/AI 全继承）——
 *   编辑闭环：md → markdownToHtml → Editor（DocState 模型）→ serializeMarkdown 回写
 * - html 预览：iframe sandbox（安全隔离——untrusted HTML 不直插 DOM）
 * - pdf/office：浏览器原生/服务端转换 URL（只读）
 *
 * 事件流：预览加载 `editEmit('preview')`（__edit_tail 可审计）；编辑 = Editor
 * commit 事件流（同一时间线）。sandbox 集成：url 加载 + onSave 回写由消费方接。
 */

import type { Component, VNode } from '../../ui-dom/vnode.ts'
import { h } from '../../ui-dom/vnode.ts'
import { Editor } from '../Editor/Editor.ts'
import type { EditorAiOptions } from '../Editor/Editor.ts'
import { Markdown } from '../Markdown/Markdown.ts'
import { markdownToHtml, serializeMarkdown } from './markdown.ts'
import type { DocState } from '../Editor/model/types.ts'
import { EMPTY_DOC } from '../Editor/model/types.ts'
import { parseHtml } from '../Editor/model/html.ts'
import { editEmit } from '../Editor/edit-events.ts'

export type FileType = 'md' | 'html' | 'pdf' | 'office' | 'text'

/** 从文件名/URL 推断类型（type 未传时自动探测） */
export function detectType(fileName?: string, url?: string): FileType {
  const name = (fileName || url || '').toLowerCase()
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'md'
  if (name.endsWith('.txt')) return 'text'
  if (name.endsWith('.html') || name.endsWith('.htm')) return 'html'
  if (name.endsWith('.pdf')) return 'pdf'
  if (/\.(docx?|xlsx?|pptx?|odt|ods|odp)$/.test(name)) return 'office'
  return 'text'
}

export interface FilePreviewProps {
  /** 文件类型（缺省按 fileName/url 扩展名自动探测） */
  type?: FileType
  /** md/html/text 内容（直接传入）；pdf/office 用 url */
  content?: string
  /** pdf/office 文件 URL（或 html 远程加载） */
  url?: string
  fileName?: string
  /** md/text：切换 Editor（复用事件流事务层——编辑/撤销/时光机/AI） */
  editable?: boolean
  /** 编辑模式 AI 协作（透传 Editor） */
  ai?: EditorAiOptions
  /** 编辑保存回调（md/text 序列化回写） */
  onSave?: (content: string, type: 'md' | 'text') => void
  /** 加载完成（解析成功） */
  onLoad?: (info: { type: FileType; chars: number; blocks: number }) => void
  /** 内容高度 */
  height?: string
}

export const FilePreview: Component<FilePreviewProps> = async (_init, ctx) => {
  // ── mount（只一次）──
  let doc: DocState = EMPTY_DOC

  // ── 远程加载（md/html/text 的 url——fetch 内容 → 预览/编辑；sandbox 文件路径） ──
  let remote = { status: 'idle' as 'idle' | 'loading' | 'error', content: null as string | null, error: null as string | null }
  let loadedUrl: string | null = null
  const loadUrl = async (u: string) => {
    // 已加载过该 url（含失败——避免 render 循环重触发；消费方改 url 重试）
    if (loadedUrl === u) return
    loadedUrl = u
    remote = { status: 'loading', content: null, error: null }
    editEmit('preview', { type: 'remote', url: u, status: 'loading' })
    try {
      // eslint-disable-next-line no-console
      console.log('[fp-dbg] fetching', u)
      const res = await fetch(u)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      remote = { status: 'idle', content: text, error: null }
      editEmit('preview', { type: 'remote', url: u, status: 'loaded', chars: text.length })
      ctx.ui.render()
    } catch (e) {
      remote = { status: 'error', content: null, error: e instanceof Error ? e.message : String(e) }
      editEmit('preview', { type: 'remote', url: u, status: 'error', message: remote.error })
      ctx.ui.render()
    }
  }

  return async (props: FilePreviewProps) => {
    const { type: typeProp, content = '', url, fileName, editable, ai, onSave, onLoad, height = '400px' } = props
    // 自动探测（type 未传——fileName/url 扩展名推断）
    const type = typeProp ?? detectType(fileName, url)
    const isEditableType = type === 'md' || type === 'text'
    // 远程加载触发（md/html/text 且传 url——content 优先，url 兜底；已加载过不重触发）
    const effectiveContent = content || (remote.status === 'idle' ? (remote.content ?? '') : '')
    if ((type === 'md' || type === 'html' || type === 'text') && url && loadedUrl !== url) {
      void loadUrl(url)
    }

    // ── 事件流：预览加载可观测（__edit_tail） ──
    const emitLoaded = (chars: number, blocks: number) => {
      editEmit('preview', { type, chars, blocks, status: 'loaded' })
      onLoad?.({ type, chars, blocks })
    }

    let previewBody: VNode | null = null

    if (type === 'md') {
      // 预览：复用 Markdown 组件（安全 token 渲染）；编辑：Editor（事件流模型）
      if (editable) {
        doc = parseHtml(markdownToHtml(effectiveContent))
        const chars = doc.text.replace(/\uFFFC/g, '').length
        emitLoaded(chars, doc.blockProps.length + doc.embeds.length + 1)
        previewBody = h(Editor, {
          value: markdownToHtml(effectiveContent),
          minHeight: height,
          ai,
          onChange: (v: string) => { doc = parseHtml(v) },
        })
      } else {
        emitLoaded(effectiveContent.length, 0)
        previewBody = h('div', { class: 'wf-filepreview-doc', style: { height, overflow: 'auto' } }, [
          fileName ? h('div', { class: 'wf-filepreview-name' }, fileName) : null,
          h(Markdown, { content: effectiveContent }),
        ])
      }
    } else if (type === 'text') {
      // 纯文本：pre 预览；编辑：Editor（单段 DocState）
      doc = parseHtml(`<p>${escapeHtml(effectiveContent)}</p>`)
      emitLoaded(effectiveContent.length, 1)
      if (editable) {
        previewBody = h(Editor, {
          value: `<p>${escapeHtml(effectiveContent)}</p>`,
          minHeight: height,
          ai,
          onChange: (v: string) => { doc = parseHtml(v) },
        })
      } else {
        previewBody = h('div', { class: 'wf-filepreview-doc', style: { height, overflow: 'auto' } }, [
          fileName ? h('div', { class: 'wf-filepreview-name' }, fileName) : null,
          h('pre', { class: 'wf-filepreview-text' }, effectiveContent),
        ])
      }
    } else if (type === 'html') {
      // 安全隔离：iframe sandbox（untrusted HTML 不直插 DOM——FS-04 红线）
      emitLoaded(effectiveContent.length, 0)
      previewBody = h('div', { class: 'wf-filepreview-frame', style: { height } }, [
        h('iframe', {
          class: 'wf-filepreview-iframe',
          sandbox: 'allow-same-origin',
          srcDoc: effectiveContent,
          style: { width: '100%', height: '100%', border: 'none' },
        }),
      ])
    } else if (type === 'pdf' || type === 'office') {
      // 原生查看器 / 服务端转换产物（只读）
      if (!url) {
        previewBody = h('div', { class: 'wf-filepreview-empty' }, '缺少文件 URL')
      } else {
        emitLoaded(0, 0)
        previewBody = h('div', { class: 'wf-filepreview-frame', style: { height } }, [
          h('iframe', {
            class: 'wf-filepreview-iframe',
            src: url,
            style: { width: '100%', height: '100%', border: 'none' },
          }),
        ])
      }
    }

    // 远程加载状态（md/html/text url 场景）
    if (remote.status === 'loading' && (type === 'md' || type === 'html' || type === 'text')) {
      previewBody = h('div', { class: 'wf-filepreview-empty' }, '加载中…')
    } else if (remote.status === 'error' && (type === 'md' || type === 'html' || type === 'text')) {
      previewBody = h('div', { class: 'wf-filepreview-empty wf-filepreview-error' }, `加载失败: ${remote.error}`)
    }

    const doSave = () => {
      if (!onSave || !isEditableType || !editable) return
      const out = type === 'md' ? serializeMarkdown(doc) : doc.text
      onSave(out, type)
      editEmit('preview', { type, status: 'saved', chars: out.length })
    }

    return h('div', {
      class: `wf-filepreview wf-filepreview--${type}`,
      onKeyDown: (e: KeyboardEvent) => {
        // Ctrl+S 保存（编辑模式）
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && isEditableType && editable) {
          e.preventDefault()
          doSave()
        }
      },
    }, [
      previewBody,
      // 编辑保存工具条（md/text editable——序列化回写）
      isEditableType && editable && onSave
        ? h('div', { class: 'wf-filepreview-actions' }, [
          h('span', { class: 'wf-filepreview-actions-hint' }, 'Ctrl+S 保存'),
          h('button', {
            class: 'wf-btn wf-btn--primary wf-btn--sm', type: 'button',
            onClick: () => doSave(),
          }, '保存'),
        ])
        : null,
    ])
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
