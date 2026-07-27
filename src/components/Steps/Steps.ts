import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

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

export const Steps: Component<StepsProps> = (props, _ctx) => {
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
      ? h('span', { class: 'wf-step-num' }, '✓')
      : h('span', { class: 'wf-step-num' }, String(i + 1))

    const label = h('span', { class: 'wf-step-label' }, item.label)
    const desc = item.description
      ? h('span', { class: 'wf-step-desc' }, item.description)
      : null

    const connector = i < items.length - 1
      ? h('span', { class: `wf-step-connector${isDone ? ' wf-step-connector--done' : ''}` })
      : null

    return h('div', { class: cls, key: item.key }, [
      num,
      label,
      desc,
      connector,
    ].filter(Boolean))
  })

  return h('div', { class: 'wf-steps' }, steps)
}
