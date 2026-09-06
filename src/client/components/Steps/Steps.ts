/** Steps：分步指示器，支持 active/current（showcase /components/steps） */
import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h, createItem } from '../../vdom/index.ts'
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

export const Steps: Component<StepsProps> = (_init, _ctx)=> {
  // 步骤项（states 多槽——done 纯类 · current 类 + aria-current 'step' 文本）
  const stepItem = createItem({
    cls: 'wf-step',
    states: {
      done: {},
      current: { ariaText: { key: 'aria-current', value: 'step' } },
    },
  })
  return (props)=> {
  const { items = [], active, current = 0 } = props

  const activeKey = active ?? items[current]?.key

  const steps = items.map((item, i)=> {
    const idx = items.findIndex(s => s.key === activeKey)
    const isDone = i < idx
    const isCurrent = i === idx

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

    return h('div', stepItem({ done: isDone, current: isCurrent }, {
      key: item.key,
    }), [
      num,
      label,
      desc,
      connector,
    ].filter(Boolean))
  })

  return h('div', { class: 'wf-steps', role: 'list' }, steps)
  }
}
