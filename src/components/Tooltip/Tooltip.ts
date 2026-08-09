/**
 * weifuwu/components — Tooltip
 *
 * usePopup 组合器：hover 触发（触屏自动降级 tap）+ 定位/视口 clamp + Escape + portal。
 * 移动端友好由构造保证——tap 可显、44px 命中区走 base coarse 清单。
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
import type { Placement } from '../../client/popup.ts'

export type TooltipPosition = Placement

export interface TooltipProps {
  content: string
  position?: TooltipPosition
  children: any
  disabled?: boolean
}

export const Tooltip: Component<TooltipProps> = (_props, ctx) => {
  // ── mount（只一次）──
  let show = false
  let latestPosition: TooltipPosition = 'top'
  let disabled = false
  let wrapEl: HTMLElement | null = null
  const wrapRef = (el: HTMLElement | null) => { if (el) wrapEl = el }

  const popup = ctx.ui.usePopup({
    trigger: 'hover',
    placement: () => latestPosition,
    gap: 6,
    el: () => wrapEl,
    isOpen: () => show,
    setOpen: (v) => { show = v; ctx.ui.render() },
    disabled: () => disabled,
  })

  // ── render（每次 dirty/props 变化）──
  return (props: TooltipProps) => {
    const { content, position = 'top', children } = props
    latestPosition = position
    disabled = !!props.disabled

    const tip = h('div', {
      class: `wf-tooltip wf-tooltip--${position}`,
      role: 'tooltip',
    }, [h('div', { class: 'wf-tooltip-arrow' }), h('div', { class: 'wf-tooltip-content' }, content)])

    return h('div', {
      class: 'wf-tooltip-wrap',
      ref: wrapRef,
      'aria-haspopup': 'tooltip',
      ...popup.wrapProps,
    }, [children, popup.portal(tip, 'tooltip')].filter(Boolean))
  }
}
