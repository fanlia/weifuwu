/**
 * Pagination — page navigation for data tables.
 *
 * ```tsx
 * <Pagination current={page} total={100} onChange={(p) => page.value = p} />
 * ```
 */
import type { Signal } from 'weifuwu/client'
import { cn } from './cn.ts'

export interface PaginationProps {
  current?: number | Signal<number>
  total: number
  pageSize?: number
  onChange?: (page: number) => void
  showTotal?: boolean
  class?: string
}

export function Pagination(props: PaginationProps) {
  const { total, pageSize = 10, onChange, showTotal, class: extraClass } = props
  const currentVal = typeof props.current === 'object' ? props.current.value : (props.current ?? 1)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function go(page: number) {
    if (page < 1 || page > totalPages) return
    if (typeof props.current === 'object') props.current.value = page
    onChange?.(page)
  }

  // Generate visible page numbers
  function getPages(): (number | '...')[] {
    const pages: (number | '...')[] = []
    const showPages = 7 // total visible slots

    if (totalPages <= showPages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      let start = Math.max(2, currentVal - 2)
      let end = Math.min(totalPages - 1, currentVal + 2)

      if (currentVal <= 3) { start = 2; end = Math.min(totalPages - 1, 6) }
      if (currentVal >= totalPages - 2) { start = Math.max(2, totalPages - 5); end = totalPages - 1 }

      if (start > 2) pages.push('...')
      for (let i = start; i <= end; i++) pages.push(i)
      if (end < totalPages - 1) pages.push('...')
      pages.push(totalPages)
    }
    return pages
  }

  return (
    <nav class={cn('flex items-center gap-1', extraClass)} aria-label="分页">
      {showTotal && <span class="text-sm text-gray-500 mr-2">共 {total} 条</span>}

      <button
        type="button"
        disabled={currentVal <= 1}
        class={cn('px-2 py-1.5 text-sm rounded-md transition-colors',
          currentVal <= 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100 cursor-pointer')}
        onClick={() => go(currentVal - 1)}
      >
        ‹ 上一页
      </button>

      {getPages().map((p) =>
        p === '...' ? (
          <span class="px-2 py-1 text-sm text-gray-400">…</span>
        ) : (
          <button
            type="button"
            class={cn('px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer',
              p === currentVal
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            )}
            onClick={() => go(p as number)}
          >
            {p}
          </button>
        )
      )}

      <button
        type="button"
        disabled={currentVal >= totalPages}
        class={cn('px-2 py-1.5 text-sm rounded-md transition-colors',
          currentVal >= totalPages ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100 cursor-pointer')}
        onClick={() => go(currentVal + 1)}
      >
        下一页 ›
      </button>
    </nav>
  )
}
