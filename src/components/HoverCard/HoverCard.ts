/**
 * weifuwu/components — HoverCard
 *
 * usePopup 组合器：hover 触发（触屏自动降级 tap）+ openDelay/closeDelay +
 * 定位/视口 clamp + Escape + portal。对应 shadcn HoverCard。
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
import type { Placement } from '../../client/popup.ts'

export type HoverCardPosition = Placement

export interface HoverCardProps {
  /** 富内容（任意 VNode，区别于 Tooltip 的 string） */
  content: any
  position?: HoverCardPosition
  children: any
  disabled?: boolean
  /** 悬停打开延迟（ms），默认 150 */
  openDelay?: number
  /** 移出关闭延迟（ms），默认 0 */
  closeDelay?: number
}

/** 悬停富内容卡：hover 延迟显隐，支持任意 VNode 内容（移动端 tap 降级） */
export const HoverCard: Component<HoverCardProps> = (_props, ctx) => {
  // ── mount（只一次）──
  let show = false
  let latestPosition: HoverCardPosition = 'top'
  let disabled = false
  let latestDelay = { open: 150, close: 0 }
  let wrapEl: HTMLElement | null = null
  const wrapRef = (el: HTMLElement | null) => { if (el) wrapEl = el }

  const popup = ctx.ui.usePopup({
    trigger: 'hover',
    placement: () => latestPosition,
    gap: 8,
    el: () => wrapEl,
    isOpen: () => show,
    setOpen: (v) => { show = v; ctx.ui.render() },
    disabled: () => disabled,
    openDelay: () => latestDelay.open,
    closeDelay: () => latestDelay.close,
  })

  return (props: HoverCardProps) => {
    const { content, position = 'top', children } = props
    latestPosition = position
    disabled = !!props.disabled
    latestDelay = { open: props.openDelay ?? 150, close: props.closeDelay ?? 0 }

    const card = h('div', {
      class: `wf-hover-card wf-hover-card--${position}`,
      role: 'tooltip',
    }, content)

    return h('div', {
      class: 'wf-hover-card-wrap',
      ref: wrapRef,
      ...popup.wrapProps,
    }, [children, popup.portal(card, 'popover')].filter(Boolean))
  }
}
