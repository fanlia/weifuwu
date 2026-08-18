/**
 * ExportCSV — 数据导出 CSV（零依赖：纯函数 + ctx.browser.downloadFile）
 *
 * 用法：
 *   exportCSV({ data: rows, filename: 'orders.csv', columns: [{ key, label }] })
 *   <ExportCSV data={rows} filename="orders.csv">导出</ExportCSV>
 */
import type { Component } from '../../ui-dom/vnode.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface CsvColumn {
  key: string
  label?: string
}

export interface ExportCsvOptions {
  data: Record<string, any>[]
  filename?: string
  columns?: CsvColumn[]
  /** 值格式化（默认 String；null/undefined → 空） */
  format?: (value: any, key: string) => string
}

/** 纯函数：data → CSV 字符串（RFC 4180：引号转义 + BOM 防 Excel 乱码） */
export function toCsv({ data, columns, format }: ExportCsvOptions): string {
  const keys = columns ? columns.map((c) => c.key) : data.length ? Object.keys(data[0]) : []
  const labels = columns ? columns.map((c) => c.label ?? c.key) : keys
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const rows = [labels, ...data.map((row) => keys.map((k) => {
    const v = row[k]
    if (v == null) return ''
    return escape(String(format ? format(v, k) : v))
  }))]
  return '\uFEFF' + rows.map((r) => r.join(',')).join('\n')
}

export interface ExportCSVProps extends ExportCsvOptions {
  children?: any
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  className?: string
}

/** 导出按钮组件（点击 → 下载 CSV——browser.downloadFile 安全适配） */
export const ExportCSV: Component<ExportCSVProps> = async (_init, ctx) =>
  async (props) => {
    const { data, filename = 'export.csv', columns, format, children, variant, size, disabled, className = '' } = props
    const doExport = () => {
      const csv = toCsv({ data, columns, format })
      ;(ctx.browser ?? (typeof window !== 'undefined' ? (window as any).__wfBrowser : null))?.downloadFile(filename, csv, 'text/csv;charset=utf-8')
    }
    return h('button', {
      type: 'button',
      class: `wf-btn wf-btn--${variant ?? 'secondary'} wf-btn--${size ?? 'md'}${className ? ` ${className}` : ''}`,
      disabled,
      onClick: () => doExport(),
    }, children ?? '导出 CSV')
  }
