/**
 * weifuwu/components — Popover
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, createPortal } from '../../client/vnode.ts'
import { computeFixedPos } from '../../client/popup.ts'
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

export const Popover: Component<PopoverProps> = (props, ctx) => {
  const { content, trigger = 'click', position = 'bottom', open, onOpenChange, disabled, children } = props
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.show = false }

  const isOpen = open !== undefined ? open : $.show
  const setOpen = (v: boolean) => {
    if (open === undefined) $.show = v
    onOpenChange?.(v)
  }

  const updatePos = (e: Event) => {
    $._pos = computeFixedPos(e.currentTarget as HTMLElement, position, 6, true)
  }

  const onClick = trigger === 'click' && !disabled
    ? (e: Event) => { updatePos(e); setOpen(!isOpen) }
    : undefined

  const hoverProps: Record<string, any> = {}
  if (trigger === 'hover' && !disabled) {
    hoverProps.onMouseEnter = (e: Event) => { updatePos(e); setOpen(true) }
    hoverProps.onMouseLeave = () => setOpen(false)
    hoverProps.onFocus = (e: Event) => { updatePos(e); setOpen(true) }
    hoverProps.onBlur = () => setOpen(false)
  }

  const p = $._pos ?? { top: 0, left: 0 }

  const overlay = isOpen ? h('div', {
    class: 'wf-popover-overlay',
    onMouseDown: () => setOpen(false),
  }) : null

  const panel = isOpen ? h('div', {
    class: `wf-popover wf-popover--${position}`,
    style: { top: p.top, left: p.left },
    role: 'dialog', 'aria-modal': 'true', 'aria-label': '弹出面板',
    onMouseDown: (e: Event) => e.stopPropagation(),
  }, [h('div', { class: 'wf-popover-arrow' }), h('div', { class: 'wf-popover-content' }, content)]) : null

  const portalContent = isOpen ? createPortal([overlay, panel], 'popover') : null

  return h('div', {
    class: `wf-popover-wrap${isOpen ? ' wf-popover-wrap--open' : ''}`,
    ...hoverProps,
  }, [h('div', { class: 'wf-popover-trigger', onClick }, children), portalContent].filter(Boolean))
}
