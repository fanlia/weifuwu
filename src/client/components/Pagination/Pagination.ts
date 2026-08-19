import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'

export interface PaginationProps {
  total: number
  page?: number
  pageSize?: number
  onChange?: (page: number) => void
}

export const Pagination: Component<PaginationProps> = async (_init, ctx) =>
  async (props) => {
  const { total, pageSize = 20 } = props

  // useControlled：受控/非受控统一（原非受控不可翻页——受控纪律违规）
  const ctrl = ctx?.ui?.useControlled<number>({ value: props.page, onChange: props.onChange, name: 'Pagination' })
  const page = ctrl?.value ?? 1
  const go = (p: number) => {
    const wasControlled = ctrl?.controlled?.value !== undefined
    ctrl?.setValue(p)
    if (!wasControlled) props.onChange?.(p)
  }
  const PL = (ctx as any)?.i18n?.components?.Pagination ?? {}

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null

  const pages: any[] = []

  // prev
  pages.push(h('button', {
    class: `wf-page-btn${page <= 1 ? ' wf-page-btn--disabled' : ''}`,
    disabled: page <= 1,
    'aria-label': PL.prevAria ?? '上一页',
    onClick: page > 1 ? () => go(page - 1) : undefined,
  }, h(Icon, { name: 'chevron-left' })))

  // page numbers
  const range = getPageRange(page, totalPages)
  for (const p of range) {
    if (p === '...') {
      pages.push(h('span', { class: 'wf-page-ellipsis' }, '...'))
    } else {
      pages.push(h('button', {
        class: `wf-page-btn${p === page ? ' wf-page-btn--active' : ''}`,
        'aria-current': p === page ? 'page' : undefined,
        onClick: p !== page ? () => go(p as number) : undefined,
      }, String(p)))
    }
  }

  // next
  pages.push(h('button', {
    class: `wf-page-btn${page >= totalPages ? ' wf-page-btn--disabled' : ''}`,
    disabled: page >= totalPages,
    'aria-label': PL.nextAria ?? '下一页',
    onClick: page < totalPages ? () => go(page + 1) : undefined,
  }, h(Icon, { name: 'chevron-right' })))

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
