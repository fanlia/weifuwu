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
  // render-only：内部状态 let + 显式 render（非受控展开 keys）
  let internalActive: string[] = []

  let summaryEls: (HTMLElement | null)[] = []
  // 闭包捕获索引 + Map 缓存稳定（React useCallback 等价物）：不读 dataset（根治顺序依赖）
  const summaryRefs = new Map<number, (el: HTMLElement | null) => void>()
  const summaryRefFor = (i: number) => {
    let fn = summaryRefs.get(i)
    if (!fn) {
      fn = (el) => { if (el) summaryEls[i] = el }
      summaryRefs.set(i, fn)
    }
    return fn
  }

  return (props) => {
    const { items = [], active, onChange, multiple = false } = props

    // 非受控：内部状态初始化为全部展开（向后兼容旧实现的行为）——
    // renderFn 内赋值：本次渲染直接读新值（无需额外 render）
    if (internalActive.length === 0 && items.length > 0) {
      internalActive = items.map(i => i.key)
    }

    const isControlled = active !== undefined
    const activeKeys: string[] = isControlled ? active : internalActive
    const isOpen = (key: string) => activeKeys.includes(key)

    const setActive = (next: string[]) => {
      if (isControlled) onChange?.(next)
      else { internalActive = next; ctx.ui.render() }
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
          ref: summaryRefFor(i),
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
