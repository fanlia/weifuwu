/**
 * Breadcrumb — navigation path, optionally auto-reads ctx.route.
 *
 * ```tsx
 * <Breadcrumb items={[
 *   { label: '首页', href: '/' },
 *   { label: '用户管理', href: '/users' },
 *   { label: '详情' },
 * ]} />
 * ```
 */
import { Fragment } from 'weifuwu/client'
import { cn } from './cn.ts'

export interface BreadcrumbItem {
  label: string
  href?: string
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[]
  separator?: string
  class?: string
}

export function Breadcrumb(props: BreadcrumbProps) {
  const { items, separator = '/', class: extraClass } = props

  return (
    <nav aria-label="面包屑" class={cn('flex items-center gap-1 text-sm', extraClass)}>
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1
        const parts: any[] = []
        if (idx > 0) parts.push(<span class="text-gray-300">{separator}</span>)

        if (item.href && !isLast) {
          parts.push(
            <a href={item.href} class="text-gray-500 hover:text-gray-700 transition-colors">
              {item.label}
            </a>
          )
        } else {
          parts.push(
            <span class={cn(isLast ? 'text-gray-900 font-medium' : 'text-gray-500')}>
              {item.label}
            </span>
          )
        }

        return parts
      })}
    </nav>
  )
}
