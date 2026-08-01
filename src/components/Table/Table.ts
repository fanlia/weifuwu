import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface TableColumn {
  key: string
  label: string
  width?: number | string
  /** 是否可排序 */
  sortable?: boolean
  /** 自定义排序函数，默认按字符串比较 */
  sorter?: (a: any, b: any) => number
  /** 自定义渲染 */
  render?: (value: any, row: any, index: number) => any
}

export interface TableProps {
  data?: any[]
  columns: TableColumn[]
  onRowClick?: (row: any, index: number) => void
  /** 当前排序列的 key */
  sortKey?: string
  /** 当前排序方向 */
  sortOrder?: 'asc' | 'desc'
  /** 排序变化回调 */
  onSort?: (key: string, order: 'asc' | 'desc') => void
  /** 数据为空时显示的文本 */
  emptyText?: string
}

function sortData(data: any[], columns: TableColumn[], sortKey?: string, sortOrder?: string): any[] {
  if (!sortKey || !sortOrder) return data
  const col = columns.find(c => c.key === sortKey)
  if (!col || !col.sortable) return data

  const sorted = [...data]
  sorted.sort((a, b) => {
    const va = a[sortKey]
    const vb = b[sortKey]
    const result = col.sorter ? col.sorter(va, vb) : String(va ?? '').localeCompare(String(vb ?? ''))
    return sortOrder === 'desc' ? -result : result
  })
  return sorted
}

function sortIndicator(key: string, sortKey?: string, sortOrder?: string): string {
  if (key !== sortKey || !sortOrder) return ''
  return sortOrder === 'asc' ? ' ▲' : ' ▼'
}

export const Table: Component<TableProps> = (_init, _ctx) =>
  (props) => {
  const { data = [], columns, onRowClick, sortKey, sortOrder, onSort, emptyText } = props

  const sortedData = sortData(data, columns, sortKey, sortOrder)

  const headerCells = columns.map(col => {
    const isSorted = col.key === sortKey && sortOrder
    const isAsc = sortOrder === 'asc'
    let label = col.label
    if (col.sortable) {
      label += isSorted ? (isAsc ? ' ▲' : ' ▼') : ' ⇅'
    }
    return h('th', {
      class: `wf-table-th${col.sortable ? ' wf-table-th--sortable' : ''}${isSorted ? ' wf-table-th--sorted' : ''}`,
      scope: 'col',
      tabindex: col.sortable ? 0 : undefined,
      style: col.width ? { width: col.width } : undefined,
      onClick: col.sortable && onSort
        ? () => onSort(col.key, isSorted && isAsc ? 'desc' : 'asc')
        : undefined,
    }, label)
  })

  const headerRow = h('tr', { class: 'wf-table-tr' }, headerCells)
  const thead = h('thead', { class: 'wf-table-thead' }, headerRow)

  let bodyRows: any[]
  if (sortedData.length === 0 && emptyText) {
    const colspan = columns.length
    bodyRows = [
      h('tr', { class: 'wf-table-tr' },
        h('td', { class: 'wf-table-td wf-table-empty', colspan, style: { textAlign: 'center' } }, emptyText)
      ),
    ]
  } else {
    bodyRows = sortedData.map((row, i) => {
      const cells = columns.map(col => {
        const val = row[col.key]
        const content = col.render ? col.render(val, row, i) : String(val ?? '')
        return h('td', { class: 'wf-table-td' }, content)
      })
      return h('tr', {
        class: 'wf-table-tr',
        onClick: onRowClick ? () => onRowClick(row, i) : undefined,
        style: onRowClick ? { cursor: 'pointer' } : undefined,
      }, cells)
    })
  }

  const tbody = h('tbody', { class: 'wf-table-tbody' }, bodyRows)

  return h('table', { class: 'wf-table' }, [thead, tbody])
}
