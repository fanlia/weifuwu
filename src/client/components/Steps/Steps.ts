import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'

export interface StepItem {
  key: string
  label: string
  description?: string
}

export interface StepsProps {
  items?: StepItem[]
  active?: string
  current?: number
}

export const Steps: Component<StepsProps> = async (_init, _ctx) =>
  async (props) => {
  const { items = [], active, current = 0 } = props

  const activeKey = active ?? items[current]?.key

  const steps = items.map((item, i) => {
    const idx = items.findIndex(s => s.key === activeKey)
    const isDone = i < idx
    const isCurrent = i === idx

    const cls = [
      'wf-step',
      isDone && 'wf-step--done',
      isCurrent && 'wf-step--current',
    ].filter(Boolean).join(' ')

    const num = isDone
      ? h('span', { class: 'wf-step-num' }, h(Icon, { name: 'check' }))
      : h('span', { class: 'wf-step-num' }, String(i + 1))

    const label = h('span', { class: 'wf-step-label' }, item.label)
    const desc = item.description
      ? h('span', { class: 'wf-step-desc' }, item.description)
      : null

    const connector = i < items.length - 1
      ? h('span', { class: `wf-step-connector${isDone ? ' wf-step-connector--done' : ''}` })
      : null

    return h('div', {
      class: cls,
      key: item.key,
      role: 'listitem',
      'aria-current': isCurrent ? 'step' : undefined,
    }, [
      num,
      label,
      desc,
      connector,
    ].filter(Boolean))
  })

  return h('div', { class: 'wf-steps', role: 'list' }, steps)
}
