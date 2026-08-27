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

import type { Component, VNode } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Editor } from '../Editor/Editor.ts'
import type { EditorAiOptions } from '../Editor/Editor.ts'
import { Markdown } from '../Markdown/Markdown.ts'
import { SheetGrid } from '../SheetGrid/SheetGrid.ts'
import { SlideCanvas } from '../SlideCanvas/SlideCanvas.ts'
import { markdownToHtml, serializeMarkdown } from './markdown.ts'
import { EMPTY_DOC } from '../Editor/model/types.ts'
import { parseHtml, serializeHtml } from '../Editor/model/html.ts'
import type { DocState } from '../Editor/model/types.ts'
import { editEmit } from '../Editor/edit-events.ts'
import { createClientBrowser } from '../../vdom/index.ts'

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
  const _browser = ctx.browser ?? createClientBrowser()
  // ── mount（只一次）──
  let doc: DocState = EMPTY_DOC
  // 前端导入的 office 文档（零依赖转换——docx ↔ DocState / xlsx ↔ WorkbookState）
  let officeDoc: DocState | null = null
  let officeWorkbook: import('../OfficeEditor/model/types.ts').WorkbookState | null = null
  let officeDeck: import('../OfficeEditor/model/types.ts').DeckState | null = null
  // 预览/编辑切换（editable 时工具栏切换；同一 DocState 无缝切换）
  let editMode = false
  let dirty = false
  let enteredEdit = false
  let loaded = false

  // ── 远程加载（md/html/text 的 url——fetch 内容 → 预览/编辑；sandbox 文件路径） ──
  let remote = { status: 'idle' as 'idle' | 'loading' | 'error', content: null as string | null, error: null as string | null }
  let loadedUrl: string | null = null
  const loadUrl = async (u: string) => {
    // **SSR 跳过远程加载（2026-08——服务器崩溃实证）**：node 端 fetch
    // 相对 URL（/api/...）→ TypeError → catch → ctx.render()（SSR 无渲染
    // 概念——noop 已兜底）——但 SSR 本不该发请求（静态结构渲染——加载态）
    // ——typeof window 守卫：浏览器才远程加载（SSR 输出初始静态结构）
    if (typeof window === 'undefined') return
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
      ctx.render()
    } catch (e) {
      remote = { status: 'error', content: null, error: e instanceof Error ? e.message : String(e) }
      editEmit('preview', { type: 'remote', url: u, status: 'error', message: remote.error })
      ctx.render()
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

    // ── 事件流：预览加载可观测（__edit_tail；同内容只发一次——renderFn 重跑防重复） ──
    const emitLoaded = (chars: number, blocks: number) => {
      if (loaded) return
      loaded = true
      editEmit('preview', { type, chars, blocks, status: 'loaded' })
      onLoad?.({ type, chars, blocks })
    }

    let previewBody: VNode | null = null

    if (type === 'md') {
      // 预览：复用 Markdown 组件（安全 token 渲染）；编辑：Editor（事件流模型）
      if (editable && editMode) {
        // 首次进入编辑才 parse（renderFn 重跑不重置——编辑内容保持——真实事故：
        // onChange 的 ctx.render 触发重渲染覆盖 doc——保存丢编辑）
        if (!enteredEdit) {
          enteredEdit = true
          doc = parseHtml(markdownToHtml(effectiveContent))
        }
        const chars = doc.text.replace(/\uFFFC/g, '').length
        emitLoaded(chars, doc.blockProps.length + doc.embeds.length + 1)
        previewBody = h(Editor, {
          key: 'editor', // 稳定业务 key（同一编辑器身份——模式切换重建意图显式化）
          minHeight: height,
          ai,
          onChange: (v: string) => { doc = parseHtml(v); dirty = true; ctx.render() },
        })
      } else {
        emitLoaded(effectiveContent.length, 0)
        previewBody = h('div', { class: 'wf-filepreview-doc', style: { height, overflow: 'auto' } }, [
          fileName ? h('div', { class: 'wf-filepreview-name' }, fileName) : null,
          // 编辑过显示当前文档（未保存内容可见）；否则原始内容
          h(Markdown, { key: 'md', content: enteredEdit ? serializeMarkdown(doc) : effectiveContent }),
        ])
      }
    } else if (type === 'text') {
      // 纯文本：pre 预览；编辑：Editor（单段 DocState）
      if (editable && editMode) {
        if (!enteredEdit) {
          enteredEdit = true
          doc = parseHtml(`<p>${escapeHtml(effectiveContent)}</p>`)
        }
        emitLoaded(effectiveContent.length, 1)
        previewBody = h(Editor, {
          key: 'editor',
          minHeight: height,
          ai,
          onChange: (v: string) => { doc = parseHtml(v); dirty = true; ctx.render() },
        })
      } else {
        emitLoaded(effectiveContent.length, 1)
        previewBody = h('div', { class: 'wf-filepreview-doc', style: { height, overflow: 'auto' } }, [
          fileName ? h('div', { class: 'wf-filepreview-name' }, fileName) : null,
          h('pre', { class: 'wf-filepreview-text' }, enteredEdit ? doc.text : effectiveContent),
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
    } else if (type === 'office') {
      // 前端零依赖转换（自研 ZIP/XML/docx——DecompressionStream 解压）：
      // 导入 docx → DocState → Editor（与 md/text 同链路）；导出 → 下载
      if (editable && officeDoc) {
        if (!enteredEdit) {
          enteredEdit = true
          doc = officeDoc
        }
        emitLoaded(doc.text.replace(/\uFFFC/g, '').length, doc.blockProps.length + doc.embeds.length + 1)
        previewBody = h(Editor, {
          key: 'editor',
          minHeight: height,
          ai,
          onChange: (v: string) => { doc = parseHtml(v); dirty = true; ctx.render() },
        })
      } else if (editable && officeWorkbook) {
        emitLoaded(0, 0)
        // xlsx 网格编辑（SheetGrid——ODES 事件流：cell-set/行列/AI 公式/撤销）
        previewBody = h(SheetGrid, {
          key: 'sheet-grid',
          ai: ai ? { url: ai.url, headers: (ai as { headers?: Record<string, string> }).headers } : undefined,
          height,
          onChange: (wb: import('../OfficeEditor/model/types.ts').WorkbookState) => { officeWorkbook = wb },
        })
      } else if (editable && officeDeck) {
        emitLoaded(0, 0)
        // pptx 画布编辑（SlideCanvas——ODES 事件流：shape 增删/拖动/缩放/AI 润色）
        previewBody = h(SlideCanvas, {
          key: 'slide-canvas',
          ai: ai ? { url: ai.url, headers: (ai as { headers?: Record<string, string> }).headers } : undefined,
          height,
          onChange: (d: import('../OfficeEditor/model/types.ts').DeckState) => { officeDeck = d },
        })
      } else if (editable) {
        emitLoaded(0, 0)
        previewBody = h('div', { class: 'wf-filepreview-empty' },
          '打开本地 .docx/.xlsx/.pptx 文件（前端零依赖转换——无需后端）')
      } else {
        // 只读预览：iframe（浏览器原生/服务端转换 URL）
        emitLoaded(0, 0)
        previewBody = url
          ? h('div', { class: 'wf-filepreview-frame', style: { height } }, [
            h('iframe', {
              class: 'wf-filepreview-iframe',
              src: url,
              sandbox: 'allow-same-origin',
              style: { width: '100%', height: '100%', border: 'none' },
            }),
          ])
          : h('div', { class: 'wf-filepreview-empty' }, 'office 文件需要 URL 或开启 editable 本地导入')
      }
    } else if (type === 'pdf') {
      // 原生查看器（只读）
      emitLoaded(0, 0)
      previewBody = url
        ? h('div', { class: 'wf-filepreview-frame', style: { height } }, [
          h('iframe', {
            class: 'wf-filepreview-iframe',
            src: url,
            sandbox: 'allow-same-origin',
            style: { width: '100%', height: '100%', border: 'none' },
          }),
        ])
        : h('div', { class: 'wf-filepreview-empty' }, '缺少文件 URL')
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
      dirty = false
      editEmit('preview', { type, status: 'saved', chars: out.length })
      ctx.render()
    }
      let officeInput: HTMLInputElement | null = null
      const openDocx = (): void => {
        // 懒创建（点击时——仅 office 卡片创建；缓存复用）
        if (!officeInput) {
          officeInput = _browser.createElement('input') as HTMLInputElement
          officeInput.type = 'file'
          officeInput.accept = '.docx,.xlsx,.xls,.pptx'
          officeInput.style.display = 'none'
          officeInput.onchange = () => {
            const f = officeInput!.files?.[0]
            if (!f) return
            const isXlsx = /\.xlsx?$/i.test(f.name)
            const isPptx = /\.pptx?$/i.test(f.name)
            void f.arrayBuffer().then(async (buf) => {
              try {
                if (isPptx) {
                  const { pptxToDeck } = await import('../../office/pptx.ts')
                  const res = await pptxToDeck(new Uint8Array(buf))
                  officeDeck = res.deck
                  officeDoc = null
                  officeWorkbook = null
                  editEmit('preview', { type: 'office', status: 'imported', docType: 'pptx', warnings: res.warnings.length })
                } else if (isXlsx) {
                  const { xlsxToWorkbook } = await import('../../office/xlsx.ts')
                  const res = await xlsxToWorkbook(new Uint8Array(buf))
                  officeWorkbook = res.workbook
                  officeDoc = null
                  officeDeck = null
                  editEmit('preview', { type: 'office', status: 'imported', docType: 'xlsx', warnings: res.warnings.length })
                } else {
                  const { docxToDoc } = await import('../../office/docx.ts')
                  const res = await docxToDoc(new Uint8Array(buf))
                  officeDoc = res.doc
                  officeWorkbook = null
                  officeDeck = null
                  doc = res.doc
                  enteredEdit = true
                  editMode = true
                  dirty = false
                  editEmit('preview', { type: 'office', status: 'imported', docType: 'docx', warnings: res.warnings.length })
                }
                ctx.render()
              } catch (e) {
                editEmit('preview', { type: 'office', status: 'import-error', message: String(e) })
              }
            })
          }
          if (typeof document !== 'undefined') _browser.bodyAppend?.(officeInput)
        }
        officeInput.click()
      }
      const downloadDocx = (): void => {
        if (officeDoc) {
          void import('../../office/docx.ts').then(({ docToDocx }) => {
            const res = docToDocx(doc)
            const ok = _browser.downloadFile(fileName ?? 'office-doc.docx', res.data as unknown as string,
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
            editEmit('preview', { type: 'office', status: ok ? 'exported' : 'export-error' })
          })
        } else if (officeWorkbook) {
          const wb = officeWorkbook // 闭包收窄（let 在异步回调中 TS 不保持）
          void import('../../office/xlsx.ts').then(({ workbookToXlsx }) => {
            const res = workbookToXlsx(wb)
            const ok = _browser.downloadFile(fileName ?? 'sheet.xlsx', res.data as unknown as string,
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            editEmit('preview', { type: 'office', status: ok ? 'exported' : 'export-error' })
          })
        } else if (officeDeck) {
          const dk = officeDeck
          void import('../../office/pptx.ts').then(({ deckToPptx }) => {
            const res = deckToPptx(dk)
            const ok = _browser.downloadFile(fileName ?? 'deck.pptx', res.data as unknown as string,
              'application/vnd.openxmlformats-officedocument.presentationml.presentation')
            editEmit('preview', { type: 'office', status: ok ? 'exported' : 'export-error' })
          })
        }
      }

    const doCopy = async () => {
      // 编辑模式复制序列化内容（含编辑）；预览模式复制原始内容
      const out = isEditableType ? (editMode ? serializeMarkdown(doc) : effectiveContent) : content
      await _browser.copyText(out)
      editEmit('preview', { type, status: 'copied', chars: out.length })
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
      // 工具条：预览/编辑切换 + 复制 + 保存（md/text editable）
      isEditableType || type === 'office' || (type === 'html' && !!content)
        ? h('div', { class: 'wf-filepreview-actions' }, [
          type === 'office' && editable
            ? h('button', {
              class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', key: 'open',
              'data-open': 'true',
              onClick: () => openDocx(),
            }, officeDoc ? '重新打开' : '打开 docx')
            : null,
          type === 'office' && editable && (officeDoc || officeWorkbook || officeDeck)
            ? h('button', {
              class: 'wf-btn wf-btn--primary wf-btn--sm', type: 'button', key: 'dl',
              'data-dl': 'true',
              onClick: () => downloadDocx(),
            }, officeDeck ? '下载 pptx' : officeWorkbook ? '下载 xlsx' : '下载 docx')
            : null,
          isEditableType && editable
            ? h('button', {
              class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', key: 'toggle',
              onClick: () => {
                editMode = !editMode
                // 切回预览：内容已同步 doc（未保存内容可见——dirty 保留提示）
                editEmit('preview', { type, status: editMode ? 'edit-start' : 'view' })
                ctx.render()
              },
            }, editMode ? '预览' : '编辑')
            : null,
          h('button', {
            class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', key: 'copy',
            'data-copy': 'true',
            onClick: () => void doCopy(),
          }, '复制'),
          ...(isEditableType && editable && onSave && (editMode || dirty)
            ? [
              dirty ? h('span', { class: 'wf-filepreview-dirty', key: 'dirty' }, '未保存') : null,
              h('span', { class: 'wf-filepreview-actions-hint', key: 'hint' }, 'Ctrl+S 保存'),
              h('button', {
                class: 'wf-btn wf-btn--primary wf-btn--sm', type: 'button', key: 'save',
                onClick: () => doSave(),
              }, '保存'),
            ]
            : []),
        ])
        : null,
    ])
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
