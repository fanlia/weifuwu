/**
 * weifuwu/components — HoverCard
 *
 * usePopup 组合器：hover 触发（触屏自动降级 tap）+ openDelay/closeDelay +
 * 定位/视口 clamp + Escape + portal。对应 shadcn HoverCard。
 */

import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import type { Placement } from '../../vdom/hooks/popup.ts'

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
export const HoverCard: Component<HoverCardProps> = async (_props, ctx) => {
  // ── mount（只一次）──
  let latestPosition: HoverCardPosition = 'top'
  let disabled = false
  let latestDelay = { open: 150, close: 0 }
  let wrapEl: HTMLElement | null = null
  const wrapRef = (el: HTMLElement | null) => { if (el) wrapEl = el }

  // useOpen：受控/非受控 open 统一（hover 触发由 usePopup trigger 驱动）
  let openCtrl: ReturnType<UIContext['ui']['useOpen']> | null = null

  const popup = ctx.ui.usePopup({
    trigger: 'hover',
    placement: () => latestPosition,
    gap: 8,
    el: () => wrapEl,
    isOpen: () => openCtrl?.open ?? false,
    setOpen: (v) => openCtrl?.setOpen(v),
    disabled: () => disabled,
    openDelay: () => latestDelay.open,
    closeDelay: () => latestDelay.close,
  })

  return async (props: HoverCardProps) => {
    const { content, position = 'top', children } = props
    // HoverCard 非受控（hover 显隐由 usePopup trigger 驱动——无 open prop）
    openCtrl = ctx.ui.useOpen({ name: 'HoverCard' })
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
      'aria-haspopup': 'dialog',
      'aria-expanded': String(!!openCtrl?.open),
      ...popup.wrapProps,
    }, [children, popup.portal(card, 'popover')].filter(Boolean))
  }
}
