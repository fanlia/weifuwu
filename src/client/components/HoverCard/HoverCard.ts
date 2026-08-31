/**
 * weifuwu/components — HoverCard
 *
 * 命令式弹窗（一个形态——ctx.ui.openPopup——toast 心智）：hover 触发
 * （触屏自动降级 tap）+ openDelay/closeDelay + 定位/视口 clamp + Escape。
 * 对应 shadcn HoverCard。
 */

import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import type { PopupHandle } from '../../vdom/hooks/popup-manager.ts'
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
export const HoverCard: Component<HoverCardProps> = (_props, ctx) => {
  // ── mount（只一次）──
  let latestPosition: HoverCardPosition = 'top'
  let disabled = false
  let latestDelay = { open: 150, close: 0 }
  let wrapEl: HTMLElement | null = null
  const wrapRef = (el: HTMLElement | null) => { if (el) wrapEl = el }
  /** 命令式句柄（唯一形态——openPopup——组件内部同步样板） */
  let handle: PopupHandle | null = null

  // useOpen：受控/非受控 open 统一（hover 触发内联）
  let openCtrl: ReturnType<UIContext['ui']['useOpen']> | null = null

  // hover 触发（延迟——openDelay/closeDelay——原 弹层 trigger 语义）
  let hoverTimer: ReturnType<typeof setTimeout> | null = null
  const clearHover = (): void => {
    if (hoverTimer !== null) { clearTimeout(hoverTimer); hoverTimer = null }
  }
  const hoverOpen = (): void => {
    clearHover()
    if (disabled) return
    hoverTimer = setTimeout(() => {
      hoverTimer = null
      if (!openCtrl?.open) openCtrl?.setOpen(true)
    }, latestDelay.open)
  }
  const hoverClose = (): void => {
    clearHover()
    hoverTimer = setTimeout(() => {
      hoverTimer = null
      if (openCtrl?.open) openCtrl?.setOpen(false)
    }, latestDelay.close)
  }
  ctx.ui.onUnmount?.(clearHover)
  ctx.ui.onUnmount?.(() => { if (handle) handle.close() })

  return (props: HoverCardProps) => {
    const { content, position = 'top', children } = props
    // HoverCard 非受控（hover 显隐由 hover 触发驱动——无 open prop）
    openCtrl = ctx.ui.useOpen({ name: 'HoverCard' })
    latestPosition = position
    disabled = !!props.disabled
    latestDelay = { open: props.openDelay ?? 150, close: props.closeDelay ?? 0 }

    const card = h('div', {
      class: `wf-hover-card wf-hover-card--${position}`,
      role: 'tooltip',
    }, content)

    // 命令式同步（受控 + 内容更新——每次渲染恒调用）
    if (openCtrl?.open && !handle)
      handle = ctx.ui.openPopup({
        anchor: () => wrapEl,
        placement: () => latestPosition,
        gap: 8,
        content: () => card,
        onClose: () => { handle = null; openCtrl?.setOpen(false) },
      })
    else if (!openCtrl?.open && handle) { handle.close(); handle = null }
    else if (handle) handle.update(card)

    return h('div', {
      class: 'wf-hover-card-wrap',
      ref: wrapRef,
      'aria-haspopup': 'dialog',
      'aria-expanded': String(!!openCtrl?.open),
      onMouseEnter: hoverOpen,
      onMouseLeave: hoverClose,
      onClick: () => { openCtrl?.setOpen(!openCtrl.open) }, // 触屏降级 tap
    }, children)
  }
}
