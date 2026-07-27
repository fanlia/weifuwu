import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right'

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

  const show = () => { $.show = true }
  const hide = () => { $.show = false }

  const tip = $.show && !disabled
    ? h('div', {
        class: `wf-tooltip wf-tooltip--${position}`,
        role: 'tooltip',
      }, [
        h('div', { class: 'wf-tooltip-arrow' }),
        h('div', { class: 'wf-tooltip-content' }, content),
      ])
    : null

  return h('div', {
    class: 'wf-tooltip-wrap',
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
  }, [children, tip].filter(Boolean))
}
