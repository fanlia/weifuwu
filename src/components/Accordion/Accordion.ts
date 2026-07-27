import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface AccordionItem {
  key: string
  title: string
  content?: any
}

export interface AccordionProps {
  items?: AccordionItem[]
  multiple?: boolean
}

export const Accordion: Component<AccordionProps> = (props, _ctx) => {
  const { items = [], multiple } = props

  if (items.length === 0) return null

  // For now, render all items expanded (state management left to user)
  const panels = items.map(item =>
    h('details', { class: 'wf-accordion-item', key: item.key, open: true }, [
      h('summary', { class: 'wf-accordion-summary', 'aria-expanded': 'true' }, item.title),
      item.content ? h('div', { class: 'wf-accordion-content' }, item.content) : null,
    ].filter(Boolean))
  )

  return h('div', { class: 'wf-accordion' }, panels)
}
