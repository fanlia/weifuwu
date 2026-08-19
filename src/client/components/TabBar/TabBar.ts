/**
 * weifuwu/components — TabBar 底部标签栏（移动端导航）
 *
 * 3-5 个底部 tab（icon + label + 可选 badge 角标）——移动端 App 主导航
 * （MUI BottomNavigation 对位；examples/patterns/Mobile.tsx 手搓底部导航的组件化）。
 *
 * 纪律：
 * - 受控纪律（§5.2）：activeKey 传入必须配 onChange（缺回调 console.warn——静默不可点）
 * - 键盘（roving tabindex + 方向键）：仅激活 tab 可 Tab 聚焦，←→ 移动，Enter/Space 激活
 * - 图标走 Icon 组件（IconName）或任意 VNode（icon 支持两者——业务图标自定义）
 * - fixed 模式：position:fixed 底部 + env(safe-area-inset-bottom) 避让手势条
 * - 动效走 --wf-dur-*（指示条位移/淡入——reduced-motion 由 _base.css 降级）
 */
import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import type { IconName } from '../Icon/Icon.ts'
import { Icon } from '../Icon/Icon.ts'

export interface TabBarItem {
  /** 唯一 key（激活/回调标识） */
  key: string
  label: string
  /** 图标：IconName（内置）或任意 VNode（业务自定义） */
  icon?: IconName | any
  /** 角标（数字/文本——显示为小圆点徽标） */
  badge?: number | string
  disabled?: boolean
}

export interface TabBarProps {
  items: TabBarItem[]
  /** 受控激活 key（不传 = 非受控自管理） */
  activeKey?: string
  onChange?: (key: string) => void
  /** 底部固定（position:fixed + safe-area 避让）——移动端 App 主导航 */
  fixed?: boolean
  className?: string
}

export const TabBar: Component<TabBarProps> = async (_init, ctx: UIContext) => {
  // ── mount（只一次）：非受控自管理激活态 ──
  let internalActive: string | null = null

  return async (props: TabBarProps) => {
    const { items, activeKey, onChange, fixed, className } = props
    const controlled = activeKey !== undefined
    if (controlled && !onChange) {
      // 受控纪律（§5.2）：缺回调 = 静默不可点——明确提示
      console.warn('[TabBar] activeKey 受控传入但未配 onChange——点击静默失效')
    }
    const active = controlled ? activeKey : internalActive ?? items[0]?.key ?? null

    const onKeyDown = (e: KeyboardEvent) => {
      const idx = items.findIndex((t) => t.key === active)
      const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      if (dir === 0) return
      e.preventDefault()
      // 循环查找下一个非 disabled（方向键跳过禁用项）
      let next = -1
      for (let i = 1; i <= items.length; i++) {
        const cand = (idx + dir * i + items.length) % items.length
        if (!items[cand]?.disabled) { next = cand; break }
      }
      if (next === -1) return
      const target = items[next]
      if (!controlled) internalActive = target.key
      onChange?.(target.key)
      ctx.render()
      // 焦点跟随（方向键导航必须焦点跟随——键盘可达红线）
      const el = ctx.browser?.byId?.(`wf-tab-${target.key}`) as HTMLElement | null
      el?.focus()
    }

    const tabs = items.map((t) => {
      const selected = t.key === active
      const icon = typeof t.icon === 'string'
        ? h(Icon, { name: t.icon as IconName, size: 20, className: 'wf-tab-bar-icon' })
        : t.icon
      return h('button', {
        key: t.key,
        id: `wf-tab-${t.key}`,
        type: 'button',
        role: 'tab',
        class: [
          'wf-tab-bar-item',
          selected ? 'wf-tab-bar-item--active' : '',
          t.disabled ? 'wf-tab-bar-item--disabled' : '',
        ].filter(Boolean).join(' '),
        tabindex: selected ? 0 : -1,
        'aria-selected': selected ? 'true' : 'false',
        disabled: t.disabled || undefined,
        onClick: t.disabled ? undefined : () => {
          if (!controlled) internalActive = t.key
          onChange?.(t.key)
          ctx.render()
        },
      }, [
        h('span', { class: 'wf-tab-bar-icon-wrap' }, [
          icon ?? null,
          t.badge !== undefined && t.badge !== null
            ? h('span', { class: 'wf-tab-bar-badge' }, String(t.badge))
            : null,
        ]),
        h('span', { class: 'wf-tab-bar-label' }, t.label),
      ])
    })

    return h('nav', {
      class: ['wf-tab-bar', fixed ? 'wf-tab-bar--fixed' : '', className ?? ''].filter(Boolean).join(' '),
      role: 'tablist',
      'aria-label': '底部导航',
      onKeyDown,
    }, tabs)
  }
}
