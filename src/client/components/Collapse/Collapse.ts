import type { Component } from '../../vdom/index.ts'
import { createClientBrowser } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'

export interface CollapseItem {
  key: string
  title: string
  /** 标题图标 */
  icon?: any
  /** 标题右侧操作区 */
  extra?: any
  /** 展开内容（惰性渲染：未展开不渲染） */
  content?: any
  /** 异步加载态：展开时显示 loading 指示 */
  loading?: boolean
}

export interface CollapseProps {
  items?: CollapseItem[]
  /** 受控展开 keys */
  active?: string[]
  onChange?: (keys: string[]) => void
  /** false = 手风琴互斥（同一时间只开一个）；默认 true 多开 */
  multiple?: boolean
  className?: string
}

/**
 * 行内折叠面板（对应 antd/EP Collapse + shadcn Collapsible）：
 * 标题行 + 行内展开区（无卡片边框，适配列表行内展开），支持异步 loading。
 * 与 Accordion 边界：Accordion = 整块卡片面板；Collapse = 行内展开。
 */
export const Collapse: Component<CollapseProps> = (_init, ctx) => {
  // 浏览器环境（ctx.browser 优先，测试/无注入环境 fallback createClientBrowser——自研惰性防御）
  const _browser = ctx.browser ?? createClientBrowser()
  // ── mount（只一次）──
  let headerEls: (HTMLElement | null)[] = []
  // 闭包捕获索引 + Map 缓存稳定（React useCallback 等价物）：不读 dataset（根治顺序依赖）
  const headerRefs = new Map<number, (el: HTMLElement | null) => void>()
  const headerRefFor = (i: number) => {
    let fn = headerRefs.get(i)
    if (!fn) {
      fn = (el) => { if (el) headerEls[i] = el }
      headerRefs.set(i, fn)
    }
    return fn
  }

  return (props) => {
    const { items = [], multiple = true, className } = props

    // 受控/非受控（useControlled：render 阶段读最新 props；非受控内部状态跨渲染保持；
    // 受控缺 onChange 的 warn 由 useControlled 按 name 幂等处理）
    const ctrl = ctx.ui.useControlled<string[]>({
      value: props.active,
      onChange: props.onChange,
      name: 'Collapse',
    })
    const activeKeys: string[] = ctrl.value ?? []
    const isOpen = (key: string) => activeKeys.includes(key)

    const toggle = (key: string) => {
      // 受控但无 onChange：状态由父组件独占，点击无法生效（warn 已由 useControlled 提示）
      if (ctrl.controlled?.value !== undefined && !props.onChange) return
      if (isOpen(key)) {
        ctrl.setValue(activeKeys.filter(k => k !== key))
      } else {
        ctrl.setValue(multiple ? [...activeKeys, key] : [key])
      }
    }

    // 键盘：方向键移动焦点（roving tabindex）
    const onKeyDown = (e: any) => {
      const current = (_browser?.activeElement() ?? null)
      const idx = headerEls.indexOf(current as HTMLElement)
      if (idx < 0) return
      let next = idx
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (idx + 1) % items.length
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (idx - 1 + items.length) % items.length
      else return
      e.preventDefault()
      headerEls[next]?.focus()
    }

    const panels = items.map((item, i) => {
      const open = isOpen(item.key)
      const headerChildren: any[] = [
        h('span', { class: `wf-collapse-chevron${open ? ' wf-collapse-chevron--open' : ''}` }, h(Icon, { name: 'chevron-down', size: 14 })),
        item.icon,
        h('span', { class: 'wf-collapse-title' }, item.title),
      ]
      if (item.extra) headerChildren.push(h('span', { class: 'wf-collapse-extra' }, item.extra))

      const content = open
        ? h('div', { class: 'wf-collapse-content' },
            item.loading
              ? h('div', { class: 'wf-collapse-loading' }, h(Icon, { name: 'retry', size: 14 }))
              : item.content ?? null)
        : null

      return h('div', {
        class: `wf-collapse-item${open ? ' wf-collapse-item--open' : ''}`,
        key: item.key,
      }, [
        h('button', {
          type: 'button',
          class: 'wf-collapse-header',
          ref: headerRefFor(i),
          'aria-expanded': open ? 'true' : 'false',
          onClick: () => toggle(item.key),
        }, headerChildren),
        content,
      ].filter(Boolean))
    })

    return h('div', { class: ['wf-collapse', className].filter(Boolean).join(' '), onKeyDown }, panels)
  }
}
