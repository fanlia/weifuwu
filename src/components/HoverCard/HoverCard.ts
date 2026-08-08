import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, createPortal } from '../../client/vnode.ts'
import { computeFixedPosRect } from '../../client/popup.ts'
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

/** 悬停富内容卡（对应 shadcn HoverCard）：hover 延迟显隐，支持任意 VNode 内容 */
export const HoverCard: Component<HoverCardProps> = (_props, ctx) => {
  // ── mount（只一次）──
  let show = false
  let wrapEl: HTMLElement | null = null
  const wrapRef = (el: HTMLElement | null) => { if (el) wrapEl = el }
  let latestPosition: HoverCardPosition = 'top'
  let latestOpenDelay = 150
  let prevOpen = false
  let openTimer: ReturnType<typeof setTimeout> | undefined
  let closeTimer: ReturnType<typeof setTimeout> | undefined

  const pos = ctx.ui.usePopupPosition({
    el: () => wrapEl,
    isOpen: () => show,
    compute: (r) => computeFixedPosRect(r, latestPosition, 8, true),
  })

  return (props: HoverCardProps) => {
    const { content, position = 'top', children, disabled, openDelay = 150, closeDelay = 0 } = props
    latestPosition = position
    latestOpenDelay = openDelay

    const showCard = () => {
      show = true
      ctx.ui.render()
    }
    const hideCard = () => {
      show = false
      ctx.ui.render()
    }

    const onEnter = () => {
      if (disabled) return
      clearTimeout(closeTimer)
      openTimer = setTimeout(showCard, openDelay)
    }
    const onLeave = () => {
      if (disabled) return
      clearTimeout(openTimer)
      closeTimer = setTimeout(hideCard, closeDelay)
    }
    const onFocusIn = () => {
      if (disabled) return
      clearTimeout(closeTimer)
      showCard()
    }
    const onFocusOut = () => {
      if (disabled) return
      hideCard()
    }

    if (show && !prevOpen) pos.refresh()
    prevOpen = show

    const p = pos

    const card = !disabled ? h('div', {
      class: `wf-hover-card wf-hover-card--${position}${show ? '' : ' wf-hover-card--hidden'}`,
      style: { position: 'fixed', top: p.top, left: p.left },
      role: 'tooltip',
    }, content) : null

    const portalContent = !disabled ? createPortal(card, 'popover') : null

    return h('div', {
      class: 'wf-hover-card-wrap',
      ref: wrapRef,
      onMouseEnter: onEnter,
      onMouseLeave: onLeave,
      onFocus: onFocusIn,
      onBlur: onFocusOut,
      onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Escape') { clearTimeout(openTimer); hideCard() } },
    }, [children, portalContent].filter(Boolean))
  }
}
