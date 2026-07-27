import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface PaginationProps {
  total: number
  page?: number
  pageSize?: number
  onChange?: (page: number) => void
}

export const Pagination: Component<PaginationProps> = (props, ctx) => {
  const { total, page = 1, pageSize = 20, onChange } = props

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null

  const pages: any[] = []

  // prev
  pages.push(h('button', {
    class: `wf-page-btn${page <= 1 ? ' wf-page-btn--disabled' : ''}`,
    disabled: page <= 1,
    onClick: page > 1 && onChange ? () => onChange(page - 1) : undefined,
  }, '‹'))

  // page numbers
  const range = getPageRange(page, totalPages)
  for (const p of range) {
    if (p === '...') {
      pages.push(h('span', { class: 'wf-page-ellipsis' }, '...'))
    } else {
      pages.push(h('button', {
        class: `wf-page-btn${p === page ? ' wf-page-btn--active' : ''}`,
        'aria-current': p === page ? 'page' : undefined,
        onClick: p !== page && onChange ? () => onChange(p as number) : undefined,
      }, String(p)))
    }
  }

  // next
  pages.push(h('button', {
    class: `wf-page-btn${page >= totalPages ? ' wf-page-btn--disabled' : ''}`,
    disabled: page >= totalPages,
    onClick: page < totalPages && onChange ? () => onChange(page + 1) : undefined,
  }, '›'))

  const PL = (ctx as any)?.i18n?.components?.Pagination ?? {}
  return h('nav', { class: 'wf-pagination', 'aria-label': PL.ariaLabel ?? '分页' }, pages)
}

function getPageRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | '...')[] = [1]

  if (current > 3) pages.push('...')

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  for (let i = start; i <= end; i++) pages.push(i)

  if (current < total - 2) pages.push('...')

  pages.push(total)

  return pages
}
