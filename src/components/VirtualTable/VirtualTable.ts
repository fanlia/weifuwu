/**
 * weifuwu/components — VirtualTable
 *
 * 虚拟表格（数据密集场景）：固定表头 + 虚拟滚动表体，10k+ 行只渲染可见窗口。
 * 复用 VirtualList 滚动基座（useScrollPosition 像素级 scrollTop + rAF 节流）。
 * 排序：受控 sortKey/sortOrder + onSort（与 Table 同款模式）。
 * 裁剪：行选择（rowSelection）、列虚拟化（横向）、行编辑、单元格合并、树形表格。
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
import { Icon } from '../Icon/Icon.ts'
import type { TableColumn } from '../Table/Table.ts'

export interface VirtualTableProps {
  columns: TableColumn[]
  data?: any[]
  /** 视口高度（px），默认 400 */
  height?: number
  /** 行高（px），默认 40 */
  rowHeight?: number
  /** 可见区外额外渲染行数 */
  overscan?: number
  /** 当前排序列 key */
  sortKey?: string
  /** 当前排序方向 */
  sortOrder?: 'asc' | 'desc'
  /** 排序变化回调 */
  onSort?: (key: string, order: 'asc' | 'desc') => void
  /** 数据为空时显示的文本 */
  emptyText?: string
  /** 行点击 */
  onRowClick?: (row: any, index: number) => void
  className?: string
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

export const VirtualTable: Component<VirtualTableProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let bodyEl: HTMLElement | null = null
  const scroll = ctx.ui.useScrollPosition({ getScroller: () => bodyEl ?? window })
  const stableRef = (node: HTMLElement | null) => {
    if (node) {
      bodyEl = node
      scroll.refresh()
    } else {
      bodyEl = null
    }
  }

  return (props: VirtualTableProps) => {
    const {
      columns, data = [], height = 400, rowHeight = 40, overscan = 5,
      sortKey, sortOrder, onSort, emptyText = '暂无数据', onRowClick, className,
    } = props

    if (bodyEl && bodyEl.scrollTop !== scroll.y) {
      scroll.y = bodyEl.scrollTop
    }

    const sortedData = sortData(data, columns, sortKey, sortOrder)
    const total = sortedData.length

    // 列宽：width 显式 → px；无 width → flex 均分剩余
    const colStyle = (col: TableColumn) => ({
      width: typeof col.width === 'number' ? `${col.width}px` : col.width,
      flex: col.width ? undefined : '1',
    })

    // ── 固定表头 ──
    const headerCells = columns.map(col => {
      const sorted = sortKey === col.key
      const orderIcon = col.sortable
        ? h('span', {
            class: `wf-virtual-table-sort-icon${sorted ? ' wf-virtual-table-sort-icon--active' : ''}`,
          }, sorted && sortOrder === 'desc' ? h(Icon, { name: 'chevron-down', size: 12 }) : h(Icon, { name: 'chevron-up', size: 12 }))
        : null
      return h('div', {
        class: `wf-virtual-table-th${col.sortable ? ' wf-virtual-table-th--sortable' : ''}${sorted ? ' wf-virtual-table-th--sorted' : ''}`,
        style: colStyle(col),
        role: col.sortable ? 'button' : undefined,
        tabIndex: col.sortable ? 0 : undefined,
        onClick: col.sortable ? () => {
          if (!onSort) return
          if (sortKey !== col.key) onSort(col.key, 'asc')
          else onSort(col.key, sortOrder === 'asc' ? 'desc' : 'asc')
        } : undefined,
        onKeyDown: col.sortable ? (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (!onSort) return
            if (sortKey !== col.key) onSort(col.key, 'asc')
            else onSort(col.key, sortOrder === 'asc' ? 'desc' : 'asc')
          }
        } : undefined,
      }, [
        h('span', { class: 'wf-virtual-table-th-label' }, col.label),
        orderIcon,
      ].filter(Boolean))
    })

    const thead = h('div', {
      class: 'wf-virtual-table-thead',
    }, headerCells)

    // ── 虚拟表体 ──
    const start = Math.max(0, Math.floor(scroll.y / rowHeight) - overscan)
    const end = Math.min(total, Math.ceil((scroll.y + height) / rowHeight) + overscan)

    let body: any
    if (total === 0) {
      body = h('div', { class: 'wf-virtual-table-empty' }, emptyText)
    } else {
      const spacer = h('div', {
        class: 'wf-virtual-table-spacer',
        style: { height: `${total * rowHeight}px` },
      })
      const visible: any[] = []
      for (let i = start; i < end; i++) {
        const row = sortedData[i]
        const cells = columns.map(col => h('div', {
          class: 'wf-virtual-table-td',
          style: colStyle(col),
        }, col.render ? col.render(row[col.key], row, i) : String(row[col.key] ?? '')))
        visible.push(h('div', {
          class: 'wf-virtual-table-row',
          style: { position: 'absolute', top: `${i * rowHeight}px`, left: 0, right: 0, height: `${rowHeight}px` },
          key: String(row.id ?? i),
          onClick: onRowClick ? () => onRowClick(row, i) : undefined,
        }, cells))
      }
      body = h('div', {
        class: 'wf-virtual-table-body',
        style: { position: 'relative', width: '100%', height: `${height}px`, overflowY: 'auto' },
        ref: stableRef,
      }, [spacer, ...visible])
    }

    return h('div', {
      class: ['wf-virtual-table', className].filter(Boolean).join(' '),
      style: { width: '100%', minHeight: `${height}px` },
    }, [thead, body])
  }
}
