/**
 * weifuwu/components/Editor/tools — 类型定义
 */

export type ToolbarItem =
  | 'bold' | 'italic' | 'underline'
  | 'h1' | 'h2' | 'h3'
  | 'ul' | 'ol'
  | 'blockquote'
  | 'alignLeft' | 'alignCenter' | 'alignRight'
  | 'hr'
  | 'image'
  | 'table'
  | 'link' | 'clear'
  | 'source'

export interface EditorProps {
  value?: string
  onChange?: (html: string) => void
  placeholder?: string
  disabled?: boolean
  minHeight?: string
  toolbar?: ToolbarItem[]
  /** 图片上传回调 — 接收 File 返回图片 URL。不传时弹出 URL 输入框 */
  onUpload?: (file: File) => Promise<string>
  /** AI 协作（可选——不传则无 AI 能力）：选区操作 → wf: 流式端点 → 建议浮层 →
   *  接受 = edit:ai-apply commit（原子撤销一步） */
  ai?: EditorAiOptions
  /** 草稿持久化 key（可选）：传入时内容自动保存/恢复（ctx.browser.storage*——
   *  SSR 无害 no-op）。挂载时 value 为空且存在草稿 → 恢复草稿。 */
  draftKey?: string
}

/** AI 动作（选区文本 → 提示词 → 建议） */
export interface EditorAiAction {
  id: string
  /** 按钮标签（如 '润色'） */
  label: string
  /** 提示词模板（选区文本注入 {selection} 由调用方替换） */
  prompt: (ctx: { selection: string }) => string
}

export interface EditorAiOptions {
  /** wf: SSE 端点（POST——协议 docs/server.md） */
  url: string
  headers?: Record<string, string>
  /** 自定义动作（缺省 = 内置 5 个：润色/翻译/缩写/扩写/纠错） */
  actions?: EditorAiAction[]
  /** x:* 自定义事件透传 */
  onEvent?: (name: string, data: unknown) => void
}

export type FormatState = Record<string, boolean>
