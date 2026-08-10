import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
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

export interface TableRowSelection {
  /** 受控选中行 keys */
  selectedRowKeys?: (string | number)[]
  /** 选中变化回调（全选/取消全选/行点击） */
  onChange?: (keys: (string | number)[], rows: any[]) => void
  /** 行 key 字段，默认 'id' */
  rowKey?: string
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
  /** 行选择（受控） */
  rowSelection?: TableRowSelection
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
  const { data = [], columns, onRowClick, sortKey, sortOrder, onSort, emptyText, rowSelection } = props

  const sortedData = sortData(data, columns, sortKey, sortOrder)

  const rowKeyOf = (row: any, i: number) => row[rowSelection?.rowKey ?? 'id'] ?? i

  // 行选择：全选态（全部选中 / 部分选中 indeterminate）
  const selKeys = rowSelection?.selectedRowKeys ?? []
  const selKeysSet = new Set(selKeys.map(String))
  const allRowKeys = sortedData.map((r, i) => String(rowKeyOf(r, i)))
  const allSelected = allRowKeys.length > 0 && allRowKeys.every(k => selKeysSet.has(k))
  const someSelected = allRowKeys.some(k => selKeysSet.has(k))

  const toggleAll = () => {
    if (!rowSelection?.onChange) return
    const next = allSelected ? [] : allRowKeys.map(k => sortedData.find((r, i) => String(rowKeyOf(r, i)) === k)!)
    rowSelection.onChange(allSelected ? [] : allRowKeys, allSelected ? [] : next)
  }

  const toggleRow = (row: any, i: number) => {
    if (!rowSelection?.onChange) return
    const key = String(rowKeyOf(row, i))
    const next = selKeysSet.has(key)
      ? selKeys.filter(k => String(k) !== key)
      : [...selKeys, key]
    const rows = next.map(k => sortedData.find((r, j) => String(rowKeyOf(r, j)) === String(k))!).filter(Boolean)
    rowSelection.onChange(next, rows)
  }

  // 选择列（rowSelection 开启时作为第一列）
  const selHeader = rowSelection
    ? h('th', { class: 'wf-table-th wf-table-th--selection', scope: 'col' },
        h('input', {
          type: 'checkbox',
          class: 'wf-table-checkbox',
          checked: allSelected || undefined,
          indeterminate: someSelected && !allSelected ? 'true' : undefined,
          'aria-label': '全选',
          onChange: toggleAll,
        }))
    : null

  const selCell = (row: any, i: number) => rowSelection
    ? h('td', { class: 'wf-table-td wf-table-td--selection' },
        h('input', {
          type: 'checkbox',
          class: 'wf-table-checkbox',
          checked: selKeysSet.has(String(rowKeyOf(row, i))) || undefined,
          'aria-label': '选择行',
          onClick: (e: Event) => e.stopPropagation(),
          onChange: () => toggleRow(row, i),
        }))
    : null

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

  const headerRow = h('tr', { class: 'wf-table-tr' }, [selHeader, ...headerCells].filter(Boolean))
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
    const colspan = columns.length + (rowSelection ? 1 : 0)
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
      const rowSelCell = selCell(row, i)
      return h('tr', {
        class: 'wf-table-tr',
        onClick: onRowClick ? () => onRowClick(row, i) : undefined,
        style: onRowClick ? { cursor: 'pointer' } : undefined,
      }, [rowSelCell, ...cells].filter(Boolean))
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
