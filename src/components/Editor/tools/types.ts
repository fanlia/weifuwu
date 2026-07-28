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
}

export type FormatState = Record<string, boolean>
