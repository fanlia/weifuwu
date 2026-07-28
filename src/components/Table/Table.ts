import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface TableColumn {
  key: string
  label: string
  width?: number | string
  render?: (value: any, row: any, index: number) => any
}

export interface TableProps {
  data?: any[]
  columns: TableColumn[]
  onRowClick?: (row: any, index: number) => void
}

export const Table: Component<TableProps> = (_init, _ctx) =>
  (props) => {
  const { data = [], columns, onRowClick } = props

  const headerCells = columns.map(col =>
    h('th', {
      class: 'wf-table-th',
      scope: 'col',
      style: col.width ? { width: col.width } : undefined,
    }, col.label)
  )

  const headerRow = h('tr', { class: 'wf-table-tr' }, headerCells)
  const thead = h('thead', { class: 'wf-table-thead' }, headerRow)

  const bodyRows = data.map((row, i) => {
    const cells = columns.map(col => {
      const val = row[col.key]
      const content = col.render ? col.render(val, row, i) : String(val ?? '')
      return h('td', { class: 'wf-table-td' }, content)
    })
    return h('tr', {
      class: 'wf-table-tr',
      onClick: onRowClick ? (e: Event) => { onRowClick(row, i) } : undefined,
      style: onRowClick ? { cursor: 'pointer' } : undefined,
    }, cells)
  })

  const tbody = h('tbody', { class: 'wf-table-tbody' }, bodyRows)

  return h('table', { class: 'wf-table' }, [thead, tbody])
}
