/**
 * weifuwu/components — Popover
 *
 * usePopup 组合器：click/hover 双触发（hover 触屏自动降级 tap）+ 受控 open +
 * 外部点击（document 级，取代原 overlay）+ 定位/视口 clamp + Escape + portal。
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
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

export const Popover: Component<PopoverProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let show = false
  let latestPosition: PopoverPosition = 'bottom'
  let latestTrigger: 'click' | 'hover' = 'click'
  let latestOpen: boolean | undefined = _init?.open
  let latestOnOpenChange: ((open: boolean) => void) | undefined = _init?.onOpenChange
  let disabled = false
  let wrapEl: HTMLElement | null = null
  const wrapRef = (el: HTMLElement | null) => { if (el) wrapEl = el }

  const popup = ctx.ui.usePopup({
    trigger: () => latestTrigger,
    placement: () => latestPosition,
    gap: 6,
    el: () => wrapEl,
    isOpen: () => show,
    setOpen: (v) => { show = v; ctx.ui.render() },
    // 受控桥：initProps 传了 open 才进受控模式；open 值每次渲染同步（getter）
    open: _init?.open !== undefined ? () => !!latestOpen : undefined,
    onOpenChange: (v) => latestOnOpenChange?.(v),
    disabled: () => disabled,
  })

  // ── render（每次 dirty/props 变化）──
  return (props: PopoverProps) => {
    const { content, position = 'bottom', trigger = 'click', children } = props
    latestPosition = position
    latestTrigger = trigger
    latestOpen = props.open
    latestOnOpenChange = props.onOpenChange
    disabled = !!props.disabled

    const popover = h('div', {
      class: `wf-popover wf-popover--${position} wf-popover--enter`,
      role: 'tooltip',
    }, [
      h('div', { class: 'wf-popover-arrow' }),
      h('div', { class: 'wf-popover-content' }, content),
    ])

    return h('div', {
      class: `wf-popover-wrap${popup.open ? ' wf-popover-wrap--open' : ''}`,
      ref: wrapRef,
      ...popup.wrapProps,
    }, [children, popup.portal(popover, 'popover')].filter(Boolean))
  }
}
