import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

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
  /** 表格最小宽度（窄屏横向滚动，如 '720px'） */
  minWidth?: string
  /** 加载中：保留表头，渲染骨架行 */
  loading?: boolean
  /** 骨架行数，默认 3 */
  loadingRows?: number
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

export const Table: Component<TableProps> = (_init, _ctx) =>
  (props) => {
  const { data = [], columns, onRowClick, sortKey, sortOrder, onSort, emptyText } = props

  const sortedData = sortData(data, columns, sortKey, sortOrder)

  const headerCells = columns.map(col => {
    const isSorted = col.key === sortKey && sortOrder
    const isAsc = sortOrder === 'asc'
    const label = col.label
    // 排序指示：SVG 图标（激活列高亮，未排序列中性双箭头）
    const sortIcon = col.sortable
      ? h(Icon, {
          name: isSorted ? (isAsc ? 'sort-asc' : 'sort-desc') : 'sort',
          className: `wf-table-sort-icon${isSorted ? ' wf-table-sort-icon--active' : ''}`,
        })
      : null
    // 排序触发：click 与键盘（Enter/Space）共用，防双触发（th 非 button，无原生 click 合成）
    const sortFn = col.sortable && onSort
      ? () => onSort(col.key, isSorted && isAsc ? 'desc' : 'asc')
      : undefined
    return h('th', {
      class: `wf-table-th${col.sortable ? ' wf-table-th--sortable' : ''}${isSorted ? ' wf-table-th--sorted' : ''}`,
      scope: 'col',
      tabindex: col.sortable ? 0 : undefined,
      style: col.width ? { width: col.width } : undefined,
      onClick: sortFn,
      onKeyDown: sortFn
        ? (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault() // Space 默认滚动页面
              sortFn()
            }
          }
        : undefined,
    }, [label, sortIcon].filter(Boolean))
  })

  const headerRow = h('tr', { class: 'wf-table-tr' }, headerCells)
  const thead = h('thead', { class: 'wf-table-thead' }, headerRow)

  let bodyRows: any[]
  if (props.loading) {
    // 加载中：表头保留，渲染骨架行（数据宽度不明，无 minWidth 时按列数撑满）
    const rows = props.loadingRows ?? 3
    bodyRows = Array.from({ length: rows }, (_, ri) =>
      h('tr', { class: 'wf-table-tr wf-table-tr--loading', key: `loading-${ri}` },
        columns.map((col, ci) =>
          h('td', { class: 'wf-table-td', key: `${ri}-${ci}` },
            h('span', { class: 'wf-skeleton wf-skeleton--text' })))))
  } else if (sortedData.length === 0 && emptyText) {
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

  const table = h('table', {
    class: 'wf-table',
    style: props.minWidth ? { minWidth: props.minWidth } : undefined,
  }, [thead, tbody])

  // 响应式：窄屏下横向滚动（可用 props.minWidth 设置表格最小宽度）
  return h('div', { class: 'wf-table-wrap' }, table)
}
