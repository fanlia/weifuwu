import type { Component } from '../../ui-dom/vnode.ts'
import { createClientBrowser } from '../../ui-dom/browser.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

export interface AccordionItem {
  key: string
  title: string
  content?: any
  disabled?: boolean
}

export interface AccordionProps {
  items?: AccordionItem[]
  /** 受控展开 keys */
  active?: string[]
  onChange?: (keys: string[]) => void
  /** true = 多开；默认 false 手风琴互斥（antd 对齐） */
  multiple?: boolean
}

/**
 * 手风琴折叠面板（对应 antd/EP Collapse 卡片面板语义）：受控 active + 点击切换 +
 * 方向键移动焦点 + aria-expanded 同步。与 Collapse 边界：Accordion = 整块卡片面板容器。
 */
export const Accordion: Component<AccordionProps> = async (_init, ctx) => {
  // 浏览器环境（ctx.browser 优先，测试/无注入环境 fallback createClientBrowser——自研惰性防御）
  const _browser = ctx.browser ?? createClientBrowser()
  // ── mount（只一次）──
  const $ = ctx.ui.$()
  $.internalActive = [] as string[]

  let summaryEls: (HTMLElement | null)[] = []
  // 稳定 ref：索引从 data-idx 读取（工厂模式每次渲染新建函数 = 内联 ref 警告）
  const summaryRef = (el: HTMLElement | null) => {
    if (!el) return
    const i = Number(el.dataset.idx)
    if (!Number.isNaN(i)) summaryEls[i] = el
  }

  return (props) => {
    const { items = [], active, onChange, multiple = false } = props

    // 非受控：内部状态初始化为全部展开（向后兼容旧实现的行为）
    if ($.internalActive.length === 0 && items.length > 0) {
      $.internalActive = items.map(i => i.key)
    }

    const isControlled = active !== undefined
    const activeKeys: string[] = isControlled ? active : $.internalActive
    const isOpen = (key: string) => activeKeys.includes(key)

    const setActive = (next: string[]) => {
      if (isControlled) onChange?.(next)
      else $.internalActive = next
    }

    const toggle = (key: string) => {
      if (isOpen(key)) setActive(activeKeys.filter(k => k !== key))
      else setActive(multiple ? [...activeKeys, key] : [key])
    }

    const onKeyDown = (e: any) => {
      const current = (_browser?.activeElement() ?? null)
      const idx = summaryEls.indexOf(current as HTMLElement)
      if (idx < 0) return
      let next = idx
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (idx + 1) % items.length
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (idx - 1 + items.length) % items.length
      else return
      e.preventDefault()
      summaryEls[next]?.focus()
    }

    if (items.length === 0) return null

    const panels = items.map((item, i) => {
      const open = isOpen(item.key)
      return h('div', {
        class: `wf-accordion-item${open ? ' wf-accordion-item--open' : ''}`,
        key: item.key,
      }, [
        h('button', {
          type: 'button',
          class: 'wf-accordion-summary',
          ref: summaryRef,
          'data-idx': String(i),
          disabled: item.disabled || undefined,
          'aria-expanded': open ? 'true' : 'false',
          onClick: item.disabled ? undefined : () => toggle(item.key),
        }, [item.title, h(Icon, { name: 'chevron-down', size: 14, className: 'wf-accordion-arrow' })]),
        open && item.content ? h('div', { class: 'wf-accordion-content' }, item.content) : null,
      ].filter(Boolean))
    })

    return h('div', { class: 'wf-accordion', onKeyDown }, panels)
  }
}
