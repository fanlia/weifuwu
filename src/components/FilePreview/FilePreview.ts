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

export interface FilePreviewProps {
  type: FileType
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

  return async (props: FilePreviewProps) => {
    const { type, content = '', url, fileName, editable, ai, onSave, onLoad, height = '400px' } = props

    // ── 事件流：预览加载可观测（__edit_tail） ──
    const emitLoaded = (chars: number, blocks: number) => {
      editEmit('preview', { type, chars, blocks, status: 'loaded' })
      onLoad?.({ type, chars, blocks })
    }

    let previewBody: VNode | null = null

    if (type === 'md') {
      // 预览：复用 Markdown 组件（安全 token 渲染）；编辑：Editor（事件流模型）
      if (editable) {
        doc = parseHtml(markdownToHtml(content))
        const chars = doc.text.replace(/\uFFFC/g, '').length
        emitLoaded(chars, doc.blockProps.length + doc.embeds.length + 1)
        previewBody = h(Editor, {
          value: markdownToHtml(content),
          minHeight: height,
          ai,
          onChange: (v: string) => { doc = parseHtml(v) },
        })
      } else {
        emitLoaded(content.length, 0)
        previewBody = h('div', { class: 'wf-filepreview-doc', style: { height, overflow: 'auto' } }, [
          fileName ? h('div', { class: 'wf-filepreview-name' }, fileName) : null,
          h(Markdown, { content }),
        ])
      }
    } else if (type === 'text') {
      // 纯文本：pre 预览；编辑：Editor（单段 DocState）
      doc = parseHtml(`<p>${escapeHtml(content)}</p>`)
      emitLoaded(content.length, 1)
      if (editable) {
        previewBody = h(Editor, {
          value: `<p>${escapeHtml(content)}</p>`,
          minHeight: height,
          ai,
          onChange: (v: string) => { doc = parseHtml(v) },
        })
      } else {
        previewBody = h('div', { class: 'wf-filepreview-doc', style: { height, overflow: 'auto' } }, [
          fileName ? h('div', { class: 'wf-filepreview-name' }, fileName) : null,
          h('pre', { class: 'wf-filepreview-text' }, content),
        ])
      }
    } else if (type === 'html') {
      // 安全隔离：iframe sandbox（untrusted HTML 不直插 DOM——FS-04 红线）
      emitLoaded(content.length, 0)
      previewBody = h('div', { class: 'wf-filepreview-frame', style: { height } }, [
        h('iframe', {
          class: 'wf-filepreview-iframe',
          sandbox: 'allow-same-origin',
          srcDoc: content,
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

    return h('div', {
      class: `wf-filepreview wf-filepreview--${type}`,
    }, [
      previewBody,
      // 编辑保存工具条（md/text editable——序列化回写）
      (type === 'md' || type === 'text') && editable && onSave
        ? h('div', { class: 'wf-filepreview-actions' }, [
          h('button', {
            class: 'wf-btn wf-btn--primary wf-btn--sm', type: 'button',
            onClick: () => {
              const out = type === 'md' ? serializeMarkdown(doc) : doc.text
              onSave(out, type)
              editEmit('preview', { type, status: 'saved', chars: out.length })
            },
          }, '保存'),
        ])
        : null,
    ])
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
