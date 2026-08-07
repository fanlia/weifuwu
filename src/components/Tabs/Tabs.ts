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

  // 方向键在 tablist 上拦截（事件委托），焦点在 tab 之间环形移动并激活
  const onTabListKeyDown = (e: KeyboardEvent) => {
    const list = e.currentTarget as HTMLElement
    const tabs = Array.from(list.querySelectorAll<HTMLElement>('.wf-tab'))
    const idx = tabs.indexOf(document.activeElement as HTMLElement)
    if (idx < 0 || !onChange) return
    let next = idx
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    else return
    e.preventDefault()
    const target = items[next]
    if (target && target.key !== items[idx].key) {
      onChange(target.key)
      tabs[next].focus()
    }
  }

  const tabList = items.map(tab =>
    h('button', {
      class: `wf-tab${tab.key === activeKey ? ' wf-tab--active' : ''}`,
      key: tab.key,
      role: 'tab',
      // roving tabindex：仅激活 tab 可 Tab 聚焦，方向键在 tab 间移动
      tabindex: tab.key === activeKey ? 0 : -1,
      'aria-selected': tab.key === activeKey ? 'true' : 'false',
      onClick: tab.key !== activeKey && onChange ? () => onChange(tab.key) : undefined,
    }, tab.label)
  )

  const activeTab = items.find(t => t.key === activeKey)
  const content = activeTab?.content
    ? h('div', { class: 'wf-tab-content', role: 'tabpanel' }, activeTab.content)
    : null

  return h('div', { class: 'wf-tabs', role: 'tablist', onKeyDown: onTabListKeyDown }, [
    h('div', { class: 'wf-tab-list' }, tabList),
    content,
  ].filter(Boolean))
}
