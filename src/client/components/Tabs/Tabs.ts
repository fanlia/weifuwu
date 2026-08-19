import type { Component } from '../../vdom/index.ts'
import { createClientBrowser } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

export interface TabItem {
  key: string
  label: string
  content?: any
  /** 单个 tab 禁用关闭（closable 模式下的白名单豁免） */
  closable?: boolean
}

export interface TabsProps {
  items?: TabItem[]
  active?: string
  onChange?: (key: string) => void
  /** 可关闭 tab（浏览器标签类应用——关闭中间 tab 自动激活邻居） */
  closable?: boolean
  /** 关闭回调（父负责从 items 移除；受控纪律：closable 必须配 onClose） */
  onClose?: (key: string) => void
  /** 显示新增 + 按钮 */
  addable?: boolean
  /** 新增回调（父负责追加 items） */
  onAdd?: () => void
}

export const Tabs: Component<TabsProps> = async (_init, ctx) => {
  const _browser = ctx?.browser ?? createClientBrowser()
  // render-only：内部状态 let + 显式 render（ink bar 位置更新）
  let inkLeft = 0
  let inkWidth = 0
  let listEl: HTMLElement | null = null
  const measureTab = (el: HTMLElement | null) => {
    if (!el) return
    inkLeft = el.offsetLeft
    inkWidth = el.offsetWidth
    ctx.render()
  }
  const measureActive = () => {
    if (!listEl) return
    measureTab(listEl.querySelector<HTMLElement>('.wf-tab--active'))
  }
  // 稳定 ref（§5.1：内联 ref 每次渲染新引用 → 重复触发清理逻辑）
  const listRef = (el: any) => { if (el) { listEl = el; queueMicrotask(measureActive) } }
  return async (props) => {
  const { items = [], closable, onClose, addable, onAdd } = props

  if (items.length === 0) return null

  // 受控纪律（§5.2）：closable/addable 必须配回调——缺回调静默不可点
  if (closable && !onClose) console.warn('[Tabs] closable 未配 onClose——关闭按钮静默失效')
  if (addable && !onAdd) console.warn('[Tabs] addable 未配 onAdd——新增按钮静默失效')

  // useControlled：受控/非受控统一（缺回调 warn + 非受控内部态——
  // 原实现非受控时 onClick 为 undefined = 静默不可点，受控纪律违规）
  const ctrl = ctx?.ui?.useControlled<string>({ value: props.active, onChange: props.onChange, name: 'Tabs' })
  const select = (key: string) => {
    const wasControlled = ctrl?.controlled?.value !== undefined
    ctrl?.setValue(key)
    // onChange 是通知语义（非受控也调——antd Tabs 切换回调）；受控时 setValue 已调
    if (!wasControlled) props.onChange?.(key)
  }
  const activeKey = ctrl?.value ?? items[0].key

  // 关闭 tab：若关闭的是激活项 → 自动激活邻居（右优先，无则左）；随后通知父移除
  const closeTab = (key: string, e: Event) => {
    e.stopPropagation()
    if (key === activeKey) {
      const idx = items.findIndex((t) => t.key === key)
      const neighbor = items[idx + 1] ?? items[idx - 1]
      if (neighbor) select(neighbor.key)
    }
    onClose?.(key)
  }

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
      measureTab(tabs[next])
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
      onClick: tab.key !== activeKey ? ((e: any) => { measureTab(e?.currentTarget as HTMLElement); select(tab.key) }) : undefined,
    }, [
      tab.label,
      // 关闭按钮（closable 模式；tab.closable=false 白名单豁免）——stopPropagation 防选中
      closable && tab.closable !== false
        ? h('span', {
            class: 'wf-tab-close',
            role: 'button',
            'aria-label': `关闭 ${tab.label}`,
            tabindex: -1, // 关闭经 Esc 语义：tab 聚焦后 Shift+F10 ？——简化：鼠标/触摸关闭，键盘 Enter 在关闭按钮上
            onClick: (e: Event) => closeTab(tab.key, e),
          }, h('svg', { viewBox: '0 0 24 24', width: 12, height: 12, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'aria-hidden': 'true' }, h('path', { d: 'M18 6L6 18M6 6l12 12' })))
        : null,
    ])
  )

  // 新增 + 按钮（addable 模式）
  const addBtn = addable
    ? h('button', {
        key: 'wf-tab-add', // 稳定 key（同上——全 keyed 防位置配对错位）
        class: 'wf-tab-add',
        role: 'tab',
        'aria-label': '新增标签页',
        onClick: () => onAdd?.(),
      }, h('svg', { viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'aria-hidden': 'true' }, h('path', { d: 'M12 5v14M5 12h14' })))
    : null

  // ink bar：滑动指示器（transform 过渡，定位到 active tab 下方）
  const ink = h('span', {
    key: 'wf-tab-ink', // 稳定 key：tabList+ink+addBtn 全 keyed——混合数组无 key 会退 unkeyed 位置配对（新增 tab 错位事故）
    class: 'wf-tab-ink',
    style: { transform: `translateX(${inkLeft}px)`, width: `${inkWidth}px` },
    'aria-hidden': 'true',
  })

  const activeTab = items.find(t => t.key === activeKey)
  const content = activeTab?.content
    ? h('div', { class: 'wf-tab-content', role: 'tabpanel' }, activeTab.content)
    : null

  return h('div', { class: 'wf-tabs', role: 'tablist', onKeyDown: onTabListKeyDown }, [
    h('div', { class: 'wf-tab-list', ref: listRef }, [...tabList, addBtn, ink]),
    content,
  ].filter(Boolean))
  }
}
