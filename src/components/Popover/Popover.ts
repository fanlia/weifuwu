/**
 * weifuwu/components — Popover
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, createPortal } from '../../client/vnode.ts'
import { computeFixedPosRect } from '../../client/popup.ts'
import type { Placement } from '../../client/popup.ts'

export type PopoverPosition = Placement

export interface PopoverProps {
  content?: any
  trigger?: 'click' | 'hover'
  position?: PopoverPosition
  open?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  children?: any
}

export const Popover: Component<PopoverProps> = (_props, ctx) => {
  // ── mount（只一次）──
  let show = false
  let wrapEl: HTMLElement | null = null
  let latestOpen = false
  let latestPosition: PopoverPosition = 'bottom'
  let prevOpen = false

  // 滚动/resize 时自动重算坐标（弹层跟随触发元素）
  const pos = ctx.ui.usePopupPosition({
    el: () => wrapEl,
    isOpen: () => latestOpen,
    compute: (r) => computeFixedPosRect(r, latestPosition, 6, true),
  })

  // ── render（每次 dirty/props 变化）──
  return (props: PopoverProps) => {
    const { content, trigger = 'click', position = 'bottom', open, onOpenChange, disabled, children } = props
    const isOpen = open !== undefined ? open : show
    latestOpen = isOpen
    latestPosition = position
    const setOpen = (v: boolean) => {
      if (open === undefined) {
        show = v
        ctx.ui.render()
      }
      onOpenChange?.(v)
    }

    // ── 打开瞬间算一次初始坐标（受控/非受控统一覆盖）──
    if (isOpen && !prevOpen) pos.refresh()
    prevOpen = isOpen

    // ── 事件处理 ────────────────────────────────────
    const onClick = trigger === 'click' && !disabled
      ? () => setOpen(!isOpen)
      : undefined

    const hoverProps: Record<string, any> = {}
    if (trigger === 'hover' && !disabled) {
      hoverProps.onMouseEnter = () => setOpen(true)
      hoverProps.onMouseLeave = () => setOpen(false)
      hoverProps.onFocus = () => setOpen(true)
      hoverProps.onBlur = () => setOpen(false)
    }

    const p = pos

    // ── VNode ────────────────────────────────────────
    const overlay = isOpen && trigger === 'click' ? h('div', {
      class: 'wf-popover-overlay',
      onMouseDown: (e: Event) => { e.stopPropagation(); setOpen(false) },
    }) : null

    const popover = isOpen ? h('div', {
      class: `wf-popover wf-popover--${position} wf-popover--enter`,
      style: { top: p.top, left: p.left },
      role: 'tooltip',
    }, [
      h('div', { class: 'wf-popover-arrow' }),
      h('div', { class: 'wf-popover-content' }, content),
    ]) : null

    const portalContent = isOpen ? createPortal([overlay, popover].filter(Boolean), 'popover') : null

    return h('div', {
      class: `wf-popover-wrap${isOpen ? ' wf-popover-wrap--open' : ''}`,
      ref: (el: HTMLElement | null) => { if (el) wrapEl = el },
      ...hoverProps,
      onClick,
    }, [children, portalContent].filter(Boolean))
  }
}
