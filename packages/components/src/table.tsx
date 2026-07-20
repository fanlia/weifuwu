/**
 * Table — sortable data table with columns.
 *
 * ```tsx
 * <Table
 *   columns={[
 *     { key: 'name', title: '姓名', sortable: true },
 *     { key: 'age', title: '年龄', sortable: true },
 *     { key: 'city', title: '城市' },
 *   ]}
 *   data={[
 *     { id: 1, name: '张三', age: 28, city: '北京' },
 *     { id: 2, name: '李四', age: 32, city: '上海' },
 *   ]}
 *   rowKey="id"
 * />
 * ```
 */
import { signal, computed } from 'weifuwu/client'
import { cn } from './cn.ts'

export interface TableColumn<T = any> {
  key: string
  title: string
  sortable?: boolean
  width?: string
  render?: (value: any, record: T, index: number) => any
  align?: 'left' | 'center' | 'right'
}

export interface TableProps<T = any> {
  columns: TableColumn<T>[]
  data: T[]
  rowKey?: string | ((record: T) => string)
  bordered?: boolean
  striped?: boolean
  size?: 'sm' | 'md' | 'lg'
  emptyText?: string
  class?: string
}

export function Table<T extends Record<string, any>>(props: TableProps<T>) {
  const { columns, rowKey = 'id', bordered, striped, size = 'md', emptyText = '暂无数据', class: extraClass } = props

  // Sorting state
  const sortKey = signal<string | null>(null)
  const sortDir = signal<'asc' | 'desc'>('asc')

  const sortedData = computed(() => {
    const key = sortKey.value
    if (!key) return props.data
    const dir = sortDir.value
    return [...props.data].sort((a, b) => {
      const va = a[key]
      const vb = b[key]
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'number' && typeof vb === 'number') {
        return dir === 'asc' ? va - vb : vb - va
      }
      return dir === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va))
    })
  })

  function toggleSort(key: string) {
    if (sortKey.value === key) {
      sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
      // If same direction again, clear sort
      if (sortDir.value === 'asc') {
        sortKey.value = null
        return
      }
    } else {
      sortKey.value = key
      sortDir.value = 'asc'
    }
  }

  function getRowKey(record: T, index: number): string {
    if (typeof rowKey === 'function') return rowKey(record)
    return String(record[rowKey] ?? index)
  }

  const sizeClasses = {
    sm: 'px-2 py-1.5 text-xs',
    md: 'px-4 py-3 text-sm',
    lg: 'px-6 py-4 text-base',
  }

  return (
    <div class={cn('overflow-x-auto rounded-lg border border-gray-200', extraClass)}>
      <table class="w-full border-collapse">
        {/* Header */}
        <thead>
          <tr class="bg-gray-50 border-b border-gray-200">
            {columns.map((col) => {
              const isSorted = sortKey.value === col.key
              return (
                <th
                  class={cn(
                    'text-left font-medium text-gray-600',
                    sizeClasses[size],
                    col.sortable && 'cursor-pointer select-none hover:bg-gray-100 transition-colors',
                    col.align === 'center' && 'text-center',
                    col.align === 'right' && 'text-right',
                    bordered && 'border-r border-gray-200 last:border-r-0',
                  )}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                >
                  <span class="inline-flex items-center gap-1">
                    {col.title}
                    {col.sortable && (
                      <span class={cn('text-gray-300', isSorted && 'text-blue-600')}>
                        {isSorted ? (sortDir.value === 'asc' ? '↑' : '↓') : '⇅'}
                      </span>
                    )}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {sortedData.value.length === 0 ? (
            <tr>
              <td colSpan={columns.length} class={cn('text-center text-gray-400', sizeClasses[size])}>
                {emptyText}
              </td>
            </tr>
          ) : (
            sortedData.value.map((record, rowIdx) => (
              <tr
                class={cn(
                  'border-b border-gray-100 last:border-b-0 transition-colors hover:bg-gray-50',
                  striped && rowIdx % 2 === 1 && 'bg-gray-50/50',
                )}
              >
                {columns.map((col) => {
                  const value = record[col.key]
                  const content = col.render ? col.render(value, record, rowIdx) : String(value ?? '')
                  return (
                    <td
                      class={cn(
                        sizeClasses[size],
                        col.align === 'center' && 'text-center',
                        col.align === 'right' && 'text-right',
                        bordered && 'border-r border-gray-100 last:border-r-0',
                      )}
                    >
                      {content}
                    </td>
                  )
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
