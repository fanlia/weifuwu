import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, createPortal } from '../../client/vnode.ts'
import { computeFixedPos } from '../../client/popup.ts'
import type { Placement } from '../../client/popup.ts'

export type TooltipPosition = Placement

export interface TooltipProps {
  content: string
  position?: TooltipPosition
  children: any
  disabled?: boolean
}

export const Tooltip: Component<TooltipProps> = (props, ctx) => {
  const { content, position = 'top', children, disabled } = props
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.show = false }

  const show = (e: Event) => {
    $._pos = computeFixedPos(e.currentTarget as HTMLElement, position, 6, true)
    $.show = true
  }
  const hide = () => { $.show = false }

  const p = $._pos ?? { top: 0, left: 0 }

  const tip = $.show && !disabled ? h('div', {
    class: `wf-tooltip wf-tooltip--${position}`,
    style: { top: p.top, left: p.left },
    role: 'tooltip',
  }, [h('div', { class: 'wf-tooltip-arrow' }), h('div', { class: 'wf-tooltip-content' }, content)]) : null

  const portalContent = $.show && !disabled ? createPortal(tip, 'tooltip') : null

  return h('div', {
    class: 'wf-tooltip-wrap',
    onMouseEnter: show, onMouseLeave: hide,
    onFocus: show, onBlur: hide,
  }, [children, portalContent].filter(Boolean))
}
