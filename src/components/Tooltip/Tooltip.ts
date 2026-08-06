/**
 * weifuwu/components — Tooltip
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, createPortal } from '../../client/vnode.ts'
import { computeFixedPosRect } from '../../client/popup.ts'
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
  let wrapEl: HTMLElement | null = null
  const wrapRef = (el: HTMLElement | null) => { if (el) wrapEl = el }
  let latestPosition: TooltipPosition = 'top'
  let prevOpen = false

  // 滚动/resize 时自动重算坐标（弹层跟随触发元素）
  const pos = ctx.ui.usePopupPosition({
    el: () => wrapEl,
    isOpen: () => show,
    compute: (r) => computeFixedPosRect(r, latestPosition, 6, true),
  })

  // ── render（每次 dirty/props 变化）──
  return (props: TooltipProps) => {
    const { content, position = 'top', children, disabled } = props
    latestPosition = position

    const showe = () => {
      show = true
      ctx.ui.render()
    }
    const hide = () => {
      show = false
      ctx.ui.render()
    }

    // ── 打开瞬间算一次初始坐标 ──
    if (show && !prevOpen) pos.refresh()
    prevOpen = show

    const p = pos

    const tip = !disabled ? h('div', {
      class: `wf-tooltip wf-tooltip--${position}${show ? '' : ' wf-tooltip--hidden'}`,
      style: { top: p.top, left: p.left },
      role: 'tooltip',
    }, [h('div', { class: 'wf-tooltip-arrow' }), h('div', { class: 'wf-tooltip-content' }, content)]) : null

    const portalContent = !disabled ? createPortal(tip, 'tooltip') : null

    return h('div', {
      class: 'wf-tooltip-wrap',
      ref: wrapRef,
      onMouseEnter: showe, onMouseLeave: hide,
      onFocus: showe, onBlur: hide,
    }, [children, portalContent].filter(Boolean))
  }
}
