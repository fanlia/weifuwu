import type { Component } from '../../client/vnode.ts'
import { createClientBrowser } from '../../client/browser.ts'
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

export const Tabs: Component<TabsProps> = (_init, ctx) => {
  const _browser = ctx?.browser ?? createClientBrowser()
  return (props) => {
  const { items = [] } = props

  if (items.length === 0) return null

  // useControlled：受控/非受控统一（缺回调 warn + 非受控内部态——
  // 原实现非受控时 onClick 为 undefined = 静默不可点，受控纪律违规）
  const ctrl = ctx?.ui?.useControlled<string>({ value: props.active, onChange: props.onChange, name: 'Tabs' })
  const select = (key: string) => {
    const wasControlled = ctrl?.controlled
    ctrl?.setValue(key)
    // onChange 是通知语义（非受控也调——antd Tabs 切换回调）；受控时 setValue 已调
    if (!wasControlled) props.onChange?.(key)
  }
  const activeKey = ctrl?.value ?? items[0].key

  // 方向键在 tablist 上拦截（事件委托），焦点在 tab 之间环形移动并激活
  const onTabListKeyDown = (e: KeyboardEvent) => {
    const list = e.currentTarget as HTMLElement
    const tabs = Array.from(list.querySelectorAll<HTMLElement>('.wf-tab'))
    const idx = tabs.indexOf((_browser?.activeElement() ?? null) as HTMLElement)
    if (idx < 0 || !ctrl) return
    let next = idx
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    else return
    e.preventDefault()
    const target = items[next]
    if (target && target.key !== items[idx].key) {
      select(target.key)
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
      onClick: tab.key !== activeKey ? () => select(tab.key) : undefined,
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
}
