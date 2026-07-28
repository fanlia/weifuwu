/**
 * weifuwu/components — Dropdown
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, createPortal } from '../../client/vnode.ts'

export interface DropdownItem {
  label: string
  value?: string
  disabled?: boolean
  variant?: 'default' | 'danger'
  onClick?: () => void
}

export interface DropdownProps {
  trigger: any
  items?: DropdownItem[]
  open?: boolean
}

export const Dropdown: Component<DropdownProps> = (props, ctx) => {
  // ── mount（只一次）──
  const $ = ctx.ui.$
  let wrapEl: HTMLElement | undefined

  // ── render（每次 dirty/props 变化）──
  return (props: DropdownProps) => {
    const { trigger, items = [], open } = props

    // ── 位置计算 ──────────────────────────────────────
    const pos = (() => {
      if (!open) return { top: 0, left: 0 }
      if (!wrapEl) return { top: 0, left: 0 }
      const r = wrapEl.getBoundingClientRect()
      return { top: r.bottom + 4, left: r.left }
    })()

    // ── scroll/resize 追踪 ─────────────────────────────
    const menuRef = (el: HTMLElement | null) => {
      if (!el || typeof window === 'undefined') return
      const onMove = () => { $.vShow = ($.vShow || 0) + 1 }
      window.addEventListener('scroll', onMove, true)
      window.addEventListener('resize', onMove)
      return () => {
        window.removeEventListener('scroll', onMove, true)
        window.removeEventListener('resize', onMove)
      }
    }

    const menuItems = items.map((item, i) =>
      h('button', {
        class: `wf-dropdown-item${item.variant === 'danger' ? ' wf-dropdown-item--danger' : ''}`,
        key: item.value ?? i, disabled: item.disabled || undefined,
        role: 'menuitem', onClick: item.onClick,
      }, item.label)
    )

    const menu = open ? h('div', {
      class: 'wf-dropdown-menu', role: 'menu',
      style: { top: pos.top, left: pos.left },
      ref: menuRef,
    }, menuItems) : null

    const portalContent = open ? createPortal(menu, 'dropdown') : null

    return h('div', {
      class: `wf-dropdown${open ? ' wf-dropdown--open' : ''}`,
      ref: (el: HTMLElement | null) => { if (el) wrapEl = el },
    }, [trigger, portalContent].filter(Boolean))
  }
}
