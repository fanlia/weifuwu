import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface BreadcrumbItem {
  label: string
  href?: string
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[]
}

export const Breadcrumb: Component<BreadcrumbProps> = (props, _ctx) => {
  const { items } = props

  const children = items.flatMap((item, i) => {
    const isLast = i === items.length - 1
    const el = isLast
      ? h('span', { class: 'wf-breadcrumb-current', 'aria-current': 'page' }, item.label)
      : item.href
        ? h('a', { class: 'wf-breadcrumb-link', href: item.href }, item.label)
        : h('span', { class: 'wf-breadcrumb-text' }, item.label)

    if (isLast) return el
    return [el, h('span', { class: 'wf-breadcrumb-sep', 'aria-hidden': 'true' }, '/')]
  })

  return h('nav', { class: 'wf-breadcrumb', 'aria-label': '面包屑' }, children)
}
