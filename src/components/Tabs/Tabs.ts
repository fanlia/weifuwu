import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface TabItem {
  key: string
  label: string
  content?: any
}

export interface TabsProps {
  items?: TabItem[]
  active?: string
  onChange?: (key: string) => void
}

export const Tabs: Component<TabsProps> = (_init, _ctx) =>
  (props) => {
  const { items = [], active, onChange } = props

  if (items.length === 0) return null

  const activeKey = active ?? items[0].key

  const tabList = items.map(tab =>
    h('button', {
      class: `wf-tab${tab.key === activeKey ? ' wf-tab--active' : ''}`,
      key: tab.key,
      role: 'tab',
      'aria-selected': tab.key === activeKey ? 'true' : 'false',
      onClick: tab.key !== activeKey && onChange ? () => onChange(tab.key) : undefined,
    }, tab.label)
  )

  const activeTab = items.find(t => t.key === activeKey)
  const content = activeTab?.content
    ? h('div', { class: 'wf-tab-content' }, activeTab.content)
    : null

  return h('div', { class: 'wf-tabs', role: 'tablist' }, [
    h('div', { class: 'wf-tab-list' }, tabList),
    content,
  ].filter(Boolean))
}
