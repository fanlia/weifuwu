/**
 * weifuwu/components — Popover
 *
 * usePopup 组合器：click/hover 双触发（hover 触屏自动降级 tap）+ 受控 open +
 * 外部点击（document 级，取代原 overlay）+ 定位/视口 clamp + Escape + portal。
 */

import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import type { Placement } from '../../vdom/hooks/popup.ts'

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

export const Popover: Component<PopoverProps> = async (_init, ctx) => {
  // ── mount（只一次）──
  let latestPosition: PopoverPosition = 'bottom'
  let latestTrigger: 'click' | 'hover' = 'click'
  let disabled = false
  let wrapEl: HTMLElement | null = null
  const wrapRef = (el: HTMLElement | null) => { if (el) wrapEl = el }

  // useOpen：受控/非受控 open 统一（warn 缺回调——受控纪律自动化）
  let openCtrl: ReturnType<UIContext['ui']['useOpen']> | null = null

  const popup = ctx.ui.usePopup({
    trigger: () => latestTrigger,
    placement: () => latestPosition,
    gap: 6,
    el: () => wrapEl,
    isOpen: () => openCtrl?.open ?? false,
    setOpen: (v) => openCtrl?.setOpen(v),
    disabled: () => disabled,
  })

  // ── render（每次 dirty/props 变化）──
  return async (props: PopoverProps) => {
    const { content, position = 'bottom', trigger = 'click', children } = props
    latestPosition = position
    latestTrigger = trigger
    openCtrl = ctx.ui.useOpen({ open: props.open, onOpenChange: props.onOpenChange, name: 'Popover' })
    disabled = !!props.disabled

    const popover = h('div', {
      class: `wf-popover wf-popover--${position} wf-popover--enter`,
      role: 'tooltip',
    }, [
      h('div', { class: 'wf-popover-arrow' }),
      h('div', { class: 'wf-popover-content' }, content),
    ])

    return h('div', {
      class: `wf-popover-wrap${openCtrl?.open ? ' wf-popover-wrap--open' : ''}`,
      ref: wrapRef,
      'aria-haspopup': 'dialog',
      'aria-expanded': String(!!openCtrl?.open),
      ...popup.wrapProps,
    }, [children, popup.portal(popover, 'popover')].filter(Boolean))
  }
}
